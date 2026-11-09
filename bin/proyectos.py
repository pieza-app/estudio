#!/usr/bin/env python3
"""proyectos — crear una app paso a paso con la IA de la persona. Solo biblioteca estándar.

  proyectos.py lista <salida.json>
  proyectos.py plan  <entrada.json {nombre, frase, plataformas, piezas}> <salida.json>
  proyectos.py crear <entrada.json {id}> <salida.json>
  proyectos.py paso  <entrada.json {id, n}> <salida.json>

Un proyecto se guarda en <carpeta de datos>/proyectos/<id>.json. La app queda en ~/Pieza/<Nombre> (o en PIEZA_PROYECTOS, para
las pruebas).

- `plan`: la IA desglosa lo propio de la app en pasos chicos (JSON validado). Las piezas ya hechas no entran al plan.
- `crear`: `pieza.py crear` con las piezas elegidas (el Pieza que va dentro de la app, en datos/pieza/). No usa la IA.
- `paso`: la IA lee la carpeta de la app (solo leer) y devuelve los archivos del paso en JSON. Pieza los revisa y los escribe:
  nunca fuera de la carpeta, nunca un archivo de pieza. Después corre `bash pruebas/correr.sh`. Si falla, la IA recibe el error y
  tiene un intento más.

La IA nunca escribe por su cuenta: no tiene herramientas. Los tokens se estiman con el largo del pedido y de la respuesta
(~4 caracteres por token).
"""
import json
import os
import re
import subprocess
import sys
import unicodedata

import ia
import nucleo
import piezas

CARACTERES_POR_TOKEN = 4
MAX_PASOS = 12
MAX_ARCHIVOS = 30
MAX_BYTES_ARCHIVO = 300_000
INTENTOS = 2
LIMITE_PRUEBAS = 600
# Lo que la IA nunca escribe: lo que arma pieza.py. app.json sí (sus acciones), pero sin tocar lo que la identifica.
PROTEGIDOS = {"piezas.json", "acciones.json"}
APP_FIJO = ("id", "nombre", "repo", "datos", "plataformas", "privado", "version")


def _guias():
    return os.path.join(nucleo.recursos(), "datos", "guias")


def _pieza_py():
    return os.path.join(nucleo.recursos(), "datos", "pieza", "herramientas", "pieza.py")


def _base_proyectos():
    return os.environ.get("PIEZA_PROYECTOS") or os.path.join(os.path.expanduser("~"), "Pieza")


def _registro():
    carpeta = os.path.join(nucleo.carpeta_datos(), "proyectos")
    os.makedirs(carpeta, exist_ok=True)
    return carpeta


def _id(nombre):
    ascii_ = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", ascii_)[:30]


def _leer(pid):
    if not isinstance(pid, str) or not re.fullmatch(r"[a-z][a-z0-9]{0,29}", pid):
        raise ValueError("Proyecto desconocido.")
    p = nucleo.leer_json(os.path.join(_registro(), pid + ".json"), None, maximo=2_000_000)
    if not isinstance(p, dict):
        raise ValueError("Proyecto desconocido.")
    return p


def _guardar(p):
    nucleo.escribir_json(os.path.join(_registro(), p["id"] + ".json"), p)
    return p


def tokens(*textos):
    return sum(len(t or "") for t in textos) // CARACTERES_POR_TOKEN


def _json_de(texto):
    """El primer objeto JSON de la respuesta (la IA a veces lo envuelve en ```json)."""
    a, b = (texto or "").find("{"), (texto or "").rfind("}")
    if a < 0 or b <= a:
        return None
    try:
        return json.loads(texto[a:b + 1])
    except ValueError:
        return None


def _texto(v, maximo):
    return v.strip()[:maximo] if isinstance(v, str) else ""


# ── El plan ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

def validar_plan(datos):
    """{pasos: [{titulo, que, archivos, tokens}]} → la lista limpia, o ValueError."""
    pasos = datos.get("pasos") if isinstance(datos, dict) else None
    if not isinstance(pasos, list) or not 1 <= len(pasos) <= MAX_PASOS:
        raise ValueError(f"El plan tiene que traer entre 1 y {MAX_PASOS} pasos.")
    limpio = []
    for x in pasos:
        if not isinstance(x, dict) or not _texto(x.get("titulo"), 80):
            raise ValueError("Un paso del plan no tiene título.")
        archivos = [a for a in (x.get("archivos") or []) if isinstance(a, str) and _ruta_valida(a)][:MAX_ARCHIVOS]
        t = x.get("tokens")
        limpio.append({"titulo": _texto(x.get("titulo"), 80), "que": _texto(x.get("que"), 500), "archivos": archivos,
                       "tokens": int(t) if isinstance(t, (int, float)) and 0 <= t <= 500_000 else 0})
    return limpio


def _prompt_plan(p, ficha):
    cat = piezas.catalogo()
    hechas = "\n".join(f"- {i}: {cat[i].get('descripcion', '')}" for i in ficha["piezas"] if i in cat)
    with open(os.path.join(_guias(), "reglas.md"), encoding="utf-8") as f:
        reglas = f.read()
    return f"""{reglas}

# La app
- Nombre: {p['nombre']}
- Qué hace: {p['frase']}
- Sistemas: {', '.join(p['plataformas'])}

# Lo que ya está hecho (piezas de Pieza, 0 tokens: no las planifiques)
{hechas}

# Lo que te pido
Desglosa SOLO lo propio de esta app en pasos chicos (entre 2 y {MAX_PASOS}). Cada paso se hace en un solo pedido y deja las
pruebas en verde. El primer paso reemplaza el ejemplo de `pieza.py crear` (ui/app.js, bin/ejemplo.py, la acción «ejemplo»).
Responde SOLO este JSON, sin texto antes ni después:
{{"pasos": [{{"titulo": "…", "que": "qué hace, en 1 a 3 frases", "archivos": ["ruta/relativa"], "tokens": 0}}]}}
En «tokens», tu estimado de lo que gastará ese paso."""


def plan(d):
    nombre = _texto(d.get("nombre"), 40)
    frase = _texto(d.get("frase"), 300)
    pid = _id(nombre)
    if not pid or not pid[0].isalpha() or not frase:
        raise ValueError("Falta el nombre o la frase de la app.")
    ficha = piezas.ficha({"plataformas": d.get("plataformas"), "piezas": d.get("piezas") or []})
    try:
        p = _leer(pid)
    except ValueError:
        p = {"id": pid, "estado": "nuevo", "pasos": [], "gastado": 0, "gastado_plan": 0}
    if p.get("estado") not in (None, "nuevo", "plan"):
        raise ValueError("Esa app ya está creada: sigue con sus pasos.")
    p.update({"nombre": nombre, "frase": frase, "plataformas": ficha["plataformas"], "piezas": [x for x in d.get("piezas") or []
              if x in ficha["piezas"]], "ahorro": ficha["tokens_ahorrados"]})
    pedido = _prompt_plan(p, ficha)
    texto, error = ia.preguntar(pedido, timeout=600)
    if error:
        return {"ok": False, "error": ia.frase(error), "codigo": error["codigo"]}
    gastado = tokens(pedido, texto)
    p["gastado_plan"] = p.get("gastado_plan", 0) + gastado
    p["gastado"] = p["gastado_plan"]
    try:
        pasos = validar_plan(_json_de(texto))
    except ValueError as e:
        _guardar(p)
        return {"ok": False, "error": str(e), "codigo": "plan", "gastado": gastado}
    p.update({"estado": "plan", "pasos": [dict(x, estado="pendiente", gastado=0) for x in pasos]})
    return {"ok": True, "proyecto": _guardar(p)}


# ── Crear ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

def crear(d):
    p = _leer(d.get("id"))
    if p.get("estado") != "plan":
        raise ValueError("Primero el plan.")
    carpeta = os.path.join(_base_proyectos(), p["nombre"])
    if os.path.exists(carpeta) and os.listdir(carpeta):
        raise ValueError(f"Ya hay algo en {carpeta}. Cambia el nombre de la app.")
    os.makedirs(_base_proyectos(), exist_ok=True)
    r = subprocess.run([sys.executable, _pieza_py(), "crear", carpeta, "--id", p["id"], "--nombre", p["nombre"],
                        "--plataformas", ",".join(x for x in p["plataformas"] if x != "web") or "mac,windows,linux",
                        "--piezas", ",".join(p["piezas"])], capture_output=True, text=True, timeout=300, env=_entorno())
    if r.returncode != 0:
        return {"ok": False, "error": (r.stderr or r.stdout).strip()[-500:] or "No pude crear la app."}
    p.update({"estado": "creado", "carpeta": carpeta})
    return {"ok": True, "proyecto": _guardar(p)}


# ── Un paso ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

def _ruta_valida(ruta):
    if not isinstance(ruta, str) or not ruta or len(ruta) > 200 or ruta.startswith(("/", "\\")) or "\\" in ruta:
        return False
    partes = ruta.split("/")
    return all(x and x not in (".", "..") for x in partes) and partes[0] != ".git" and not re.match(r"^[A-Za-z]:", ruta)


def _de_piezas(carpeta):
    lock = nucleo.leer_json(os.path.join(carpeta, "piezas.json"), {}, maximo=2_000_000) or {}
    return {a for x in (lock.get("piezas") or {}).values() for a in (x.get("archivos") or {})}


def validar_archivos(datos, carpeta):
    """{resumen, archivos: [{ruta, contenido}], borrar?: [ruta]} → (resumen, [(ruta, contenido)], [ruta]), o ValueError."""
    if not isinstance(datos, dict) or not isinstance(datos.get("archivos"), list):
        raise ValueError("La respuesta no trae «archivos».")
    if not 1 <= len(datos["archivos"]) <= MAX_ARCHIVOS:
        raise ValueError(f"La respuesta tiene que traer entre 1 y {MAX_ARCHIVOS} archivos.")
    prohibidos = _de_piezas(carpeta) | PROTEGIDOS
    salida = []
    for a in datos["archivos"]:
        ruta, contenido = (a or {}).get("ruta"), (a or {}).get("contenido")
        if not _ruta_valida(ruta):
            raise ValueError(f"Ruta no válida: {str(ruta)[:80]}")
        if ruta in prohibidos:
            raise ValueError(f"{ruta} es de Pieza: no se cambia aquí.")
        if not isinstance(contenido, str) or len(contenido.encode("utf-8")) > MAX_BYTES_ARCHIVO:
            raise ValueError(f"{ruta}: contenido vacío o muy grande.")
        if ruta == "app.json":
            _revisar_app(carpeta, contenido)
        salida.append((ruta, contenido))
    borrar = []
    for ruta in (datos.get("borrar") or [])[:MAX_ARCHIVOS]:
        if not _ruta_valida(ruta) or ruta in prohibidos or ruta == "app.json":
            raise ValueError(f"No se puede borrar: {str(ruta)[:80]}")
        borrar.append(ruta)
    return _texto(datos.get("resumen"), 600), salida, borrar


def _revisar_app(carpeta, contenido):
    """La IA puede sumar acciones y config a app.json, pero no cambiar lo que identifica a la app."""
    try:
        nuevo = json.loads(contenido)
    except ValueError:
        raise ValueError("app.json no es JSON válido.")
    antes = nucleo.leer_json(os.path.join(carpeta, "app.json"), {}, maximo=1_000_000) or {}
    if not isinstance(nuevo, dict) or any(nuevo.get(k) != antes.get(k) for k in APP_FIJO):
        raise ValueError("app.json: no cambies " + ", ".join(APP_FIJO) + ". Solo suma acciones o config.")


def _escribir(carpeta, archivos):
    for ruta, contenido in archivos:
        destino = nucleo.ruta_en(carpeta, ruta)
        if not destino:
            raise ValueError(f"Ruta fuera de la app: {ruta[:80]}")
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        nucleo.escribir_atomico(destino, contenido)


def _entorno():
    """Lo que corre en la carpeta de la app no recibe las variables de Pieza."""
    return {k: v for k, v in os.environ.items() if not k.startswith(nucleo.prefijo())}


def probar(carpeta):
    """(ok, las últimas líneas) de bash pruebas/correr.sh."""
    try:
        r = subprocess.run(["bash", "pruebas/correr.sh"], cwd=carpeta, capture_output=True, text=True, timeout=LIMITE_PRUEBAS,
                           env=_entorno())
    except FileNotFoundError:
        return False, "No encontré bash para correr las pruebas."
    except subprocess.TimeoutExpired:
        return False, "Las pruebas tardaron demasiado."
    salida = "\n".join(((r.stdout or "") + "\n" + (r.stderr or "")).strip().splitlines()[-60:])
    return r.returncode == 0, salida


def _prompt_paso(p, n, error=None):
    with open(os.path.join(_guias(), "reglas.md"), encoding="utf-8") as f:
        reglas = f.read()
    plan_ = "\n".join(f"{i + 1}. {x['titulo']} ({x['estado']})" for i, x in enumerate(p["pasos"]))
    x = p["pasos"][n]
    extra = f"\n\n# Las pruebas fallaron con tu respuesta anterior\nArréglalo. Las últimas líneas:\n```\n{error}\n```" if error else ""
    return f"""{reglas}

# La app «{p['nombre']}»
{p['frase']}

# El plan
{plan_}

# Este paso ({n + 1})
{x['titulo']}
{x['que']}
Archivos que pensabas tocar: {', '.join(x['archivos']) or 'los que hagan falta'}{extra}

# Cómo responder
Lee la carpeta de la app antes de escribir. Responde SOLO este JSON, sin texto antes ni después:
{{"resumen": "qué hiciste, en 1 a 3 frases", "archivos": [{{"ruta": "ruta/relativa", "contenido": "el archivo completo"}}],
 "borrar": ["ruta/que/ya/no/sirve"]}}
«borrar» es opcional (por ejemplo, el ejemplo de `pieza.py crear` que reemplazas)."""


def paso(d):
    p = _leer(d.get("id"))
    n = d.get("n")
    if p.get("estado") not in ("creado", "pasos") or not p.get("carpeta"):
        raise ValueError("Primero crea la app.")
    if not isinstance(n, int) or not 0 <= n < len(p["pasos"]):
        raise ValueError("Paso desconocido.")
    carpeta, x = p["carpeta"], p["pasos"][n]
    error_prueba, resumen, escritos = None, "", []
    for intento in range(1, INTENTOS + 1):
        pedido = _prompt_paso(p, n, error_prueba)
        texto, error = ia.preguntar(pedido, timeout=900, leer=carpeta)
        x["gastado"] = x.get("gastado", 0) + tokens(pedido, texto)
        if error:
            x.update(estado="fallo", error=ia.frase(error), intentos=intento)
            break
        try:
            resumen, archivos, borrar = validar_archivos(_json_de(texto), carpeta)
        except ValueError as e:
            error_prueba = f"La respuesta no se pudo usar: {e}"
            x.update(estado="fallo", error=str(e), intentos=intento)
            continue
        _escribir(carpeta, archivos)
        for ruta in borrar:
            destino = nucleo.ruta_en(carpeta, ruta)
            if destino and os.path.isfile(destino):
                os.remove(destino)
        escritos = sorted(set(escritos) | {r for r, _ in archivos})
        if "app.json" in escritos:
            # Las acciones nuevas pasan a acciones.json (lo que lee la app de escritorio), con las reglas de pieza.py.
            r = subprocess.run([sys.executable, _pieza_py(), "acciones", carpeta], capture_output=True, text=True, timeout=120,
                               env=_entorno())
            if r.returncode != 0:
                error_prueba = "pieza.py acciones falló: " + (r.stderr or r.stdout).strip()[-1500:]
                x.update(estado="fallo", error=error_prueba, intentos=intento, resumen=resumen, escritos=escritos)
                continue
        ok, salida = probar(carpeta)
        x.update(intentos=intento, resumen=resumen, escritos=escritos)
        if ok:
            x.update(estado="listo", error="")
            break
        error_prueba = salida
        x.update(estado="fallo", error=salida[-1500:])
    p["estado"] = "pasos"
    p["gastado"] = sum(y.get("gastado", 0) for y in p["pasos"]) + p.get("gastado_plan", 0)
    return {"ok": x["estado"] == "listo", "proyecto": _guardar(p), "n": n}


def lista(_d):
    proyectos = []
    for nombre in sorted(os.listdir(_registro())):
        if nombre.endswith(".json"):
            p = nucleo.leer_json(os.path.join(_registro(), nombre), None, maximo=2_000_000)
            if isinstance(p, dict) and p.get("id"):
                proyectos.append(p)
    return {"ok": True, "proyectos": proyectos}


if __name__ == "__main__":
    nucleo.script({"lista": lista, "plan": plan, "crear": crear, "paso": paso}, __doc__)
