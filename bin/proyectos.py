#!/usr/bin/env python3
"""proyectos — crear una app paso a paso con la IA de la persona. Solo biblioteca estándar.

  proyectos.py lista <salida.json>
  proyectos.py plan  <entrada.json {nombre, frase, detalle?, plataformas, piezas}> <salida.json>
  proyectos.py revisar <entrada.json {id}> <salida.json>
  proyectos.py crear <entrada.json {id}> <salida.json>
  proyectos.py paso  <entrada.json {id, n}> <salida.json>
  proyectos.py borrar <entrada.json {id, carpeta: si|no}> <salida.json>

Un proyecto se guarda en <carpeta de datos>/proyectos/<id>.json. La app queda en ~/Pieza/<Nombre> (o en PIEZA_PROYECTOS, para
las pruebas).

- `plan`: la IA desglosa lo propio de la app en pasos chicos (JSON validado). Las piezas ya hechas no entran al plan.
- `revisar`: la idea y el plan van a 3 sesiones NUEVAS de la IA (sin la conversación que armó el plan), cada una con un enfoque:
  riesgos y seguridad, uso, y pasos. Es el patrón «elefante y pez dorado»: quien no trae contexto ve lo que el autor ya no ve.
  Devuelve hallazgos; la persona acepta los que quiere y rehace el plan con ellos (`acuerdos` en `plan`).
- `crear`: `pieza.py crear` con las piezas elegidas (el Pieza que va dentro de la app, en datos/pieza/). No usa la IA.
- `paso`: con Claude o Codex (`ia.puede_escribir()`), la IA edita los archivos de la app directamente, SOLO en su carpeta y sin
  terminal. Después Pieza revisa lo que cambió: devuelve a su estado los archivos de piezas, `piezas.json` y `acciones.json`, y lo
  que identifica a la app en `app.json`. Con Gemini, la IA devuelve los archivos en JSON y Pieza los revisa y los escribe. En los
  dos casos Pieza corre `bash pruebas/correr.sh`; si falla, la IA recibe el error y tiene un intento más.

Para gastar menos en cada paso, la IA recibe un mapa de los archivos propios de la app y lo que hicieron los pasos anteriores, y
no puede leer lo que no le sirve para programar (`NO_LEER`: lo generado, la app de escritorio, la página, las licencias).

Los tokens son los que la IA dice haber usado (Claude y Codex). Si no los dice (Gemini), se estiman con el largo del pedido, de
la respuesta y de lo que cambió en los archivos (~4 caracteres por token).
"""
import difflib
import json
import os
import shutil
import tempfile
from concurrent.futures import ThreadPoolExecutor
import re
import subprocess
import sys
import unicodedata

import ia
import nucleo
import piezas
import trabajos

CARACTERES_POR_TOKEN = 4
MAX_PASOS = 30       # en el plan; pasos chicos
MAX_PASOS_TOTAL = 40  # con los que salen de dividir
TOPE_PASO = 60_000   # tokens estimados: un paso más grande se divide
MAX_ARCHIVOS_PASO = 6  # archivos propios por paso (sin contar en.json, CHANGELOG ni pruebas)
MAX_LOTE = 3         # pasos que se hacen a la vez
LIMITE_LOTE = 2400
MAX_CAMBIO = 2000  # «pedir un cambio» a una app ya creada o publicada
MAX_FRASE = 400
MAX_ACUERDOS = 20  # cambios aceptados de la revisión
MAX_HALLAZGOS = 6  # por enfoque
ENFOQUES = {
    "riesgos": "Riesgos y seguridad: qué puede salir mal, datos o dinero en juego, secretos, casos borde, lo que falta proteger.",
    "uso": "Uso: si una persona sin conocimientos técnicos entiende y usa la app sin ayuda; pasos de más, textos confusos, lo que falta mostrar.",
    "pasos": "Plan: si los pasos alcanzan para lo que promete la idea, si alguno es muy grande, si el orden sirve y si algo se contradice.",
}
MAX_DETALLE = 12_000  # la idea completa (opcional): reglas, pantallas, datos; va al plan y a cada paso
MAX_ARCHIVOS = 30
MAX_BYTES_ARCHIVO = 300_000
INTENTOS = 2
FRENO = 3  # un paso que gasta más de 3 veces lo estimado se detiene y pregunta
MAX_RESUMEN = 4000    # lo que la IA cuenta que hizo, completo (la interfaz lo muestra al abrir el paso)
MAX_HISTORIAL = 6    # intentos guardados por paso
MAX_REGISTRO = 300   # lo que leyó y escribió en la última vez
LIMITE_PRUEBAS = 600
LIMITE_IA = 1500  # por intento; la acción de la app tiene 3600 s para dos intentos y las pruebas
# Lo que la IA nunca escribe: lo que arma pieza.py. app.json sí (sus acciones), pero sin tocar lo que la identifica.
PROTEGIDOS = {"piezas.json", "acciones.json", "pruebas/correr.sh"}  # correr.sh: la IA no puede aflojar las pruebas
APP_FIJO = ("id", "nombre", "repo", "datos", "plataformas", "privado", "version")
# Lo que la IA no lee en un paso: no le sirve para programar la app y solo gasta tokens. Las piezas sí se pueden leer (su API).
NO_LEER = ("escritorio/", "docs/", ".github/", "herramientas/", "piezas.json", "acciones.json", "LICENSE", "CODE_OF_CONDUCT.md",
           "CONTRIBUTING.md", "SECURITY.md", "CLAUDE.md", "GEMINI.md", "build.sh", "instalar.sh")
MAX_MAPA = 80  # archivos en el mapa


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

SIN_CONTAR = ("ui/idiomas/", "CHANGELOG.md", "AGENTS.md", "README.md", "pruebas/")


def validar_plan(datos, maximo=MAX_PASOS, previos=0):
    """{pasos: [{titulo, que, archivos, tokens, entrega, depende}]} → la lista limpia, o ValueError.
    `depende` llega con los números de paso (1, 2…) y queda con índices (0, 1…); solo pasos anteriores. Sin `depende`, el paso
    depende del anterior (un plan de antes). `previos`: pasos que ya existen antes de estos (al dividir)."""
    pasos = datos.get("pasos") if isinstance(datos, dict) else None
    if not isinstance(pasos, list) or not 1 <= len(pasos) <= maximo:
        n = len(pasos) if isinstance(pasos, list) else 0
        raise ValueError(f"El plan tiene que traer entre 1 y {maximo} pasos (trajo {n}).")
    limpio = []
    for i, x in enumerate(pasos):
        if not isinstance(x, dict) or not _texto(x.get("titulo"), 80):
            raise ValueError("Un paso del plan no tiene título.")
        archivos = [a for a in (x.get("archivos") or []) if isinstance(a, str) and _ruta_valida(a)][:MAX_ARCHIVOS]
        t = x.get("tokens")
        t = int(t) if isinstance(t, (int, float)) and 0 <= t <= 500_000 else 0
        propios = [a for a in archivos if not a.startswith(SIN_CONTAR)]
        if t > TOPE_PASO or len(propios) > MAX_ARCHIVOS_PASO:
            raise ValueError(f"El paso {previos + i + 1} («{_texto(x.get('titulo'), 80)}») es muy grande: divídelo en pasos de "
                             f"menos de {TOPE_PASO // 1000} mil tokens y {MAX_ARCHIVOS_PASO} archivos propios como máximo.")
        dep = x.get("depende")
        if isinstance(dep, list):
            dep = sorted({d - 1 for d in dep if isinstance(d, int) and not isinstance(d, bool) and 1 <= d <= previos + i})
        else:
            dep = [previos + i - 1] if previos + i > 0 else []
        limpio.append({"titulo": _texto(x.get("titulo"), 80), "que": _texto(x.get("que"), 500), "archivos": archivos, "tokens": t,
                       "entrega": _texto(x.get("entrega"), 400), "depende": dep})
    return limpio


def dependencias(p, i):
    """Los pasos de los que depende el paso i (índices). Un plan de antes no los trae: depende del anterior."""
    x = p["pasos"][i]
    dep = x.get("depende")
    return [d for d in dep if isinstance(d, int) and 0 <= d < i] if isinstance(dep, list) else ([i - 1] if i > 0 else [])


def _detalle(p):
    """La idea completa que dio la persona (opcional). Manda sobre lo que la IA suponga."""
    d = _texto(p.get("detalle"), MAX_DETALLE)
    acuerdos = "\n".join(f"- {a}" for a in (p.get("acuerdos") or [])[:MAX_ACUERDOS])
    return (f"\n# La idea completa (manda sobre lo que supongas)\n{d}\n" if d else "") + (
        f"\n# Cambios acordados en la revisión (también mandan)\n{acuerdos}\n" if acuerdos else "")


def _prompt_plan(p, ficha, hechos=(), cambio=""):
    cat = piezas.catalogo()
    hechas = "\n".join(f"- {i}: {cat[i].get('descripcion', '')}" for i in ficha["piezas"] if i in cat and cat[i].get("estado") == "lista")
    por_hacer = "\n".join(f"- {i}: {cat[i].get('descripcion', '')}" for i in ficha["piezas"] if i in cat and cat[i].get("estado") != "lista")
    bloque_por_hacer = ("\n# Lo que la persona pidió y todavía no existe como pieza (inclúyelo en el plan, escrito dentro de la app)\n"
                        + por_hacer + "\n") if por_hacer else ""
    with open(os.path.join(_guias(), "reglas.md"), encoding="utf-8") as f:
        reglas = f.read()
    return f"""{reglas}

# La app
- Nombre: {p['nombre']}
- Qué hace: {p['frase']}
- Sistemas: {', '.join(p['plataformas'])}
{_detalle(p)}
# Lo que ya está hecho (piezas de Pieza, 0 tokens: no las planifiques)
{hechas}
{bloque_por_hacer}
{_ya_hecho(hechos)}{f"# El cambio que pide la persona (planifica SOLO los pasos para este cambio){chr(10)}{cambio}{chr(10)}{chr(10)}" if cambio else ""}# Lo que te pido
Desglosa SOLO lo propio de esta app en pasos CHICOS (entre 3 y {MAX_PASOS}). Más pasos chicos es mejor que pocos grandes. Un paso:
- hace una sola cosa que se puede probar (un script con su acción, o una pantalla, o una mejora);
- toca como máximo 4 archivos propios (sin contar ui/idiomas/en.json, el CHANGELOG ni las pruebas);
- gasta menos de {TOPE_PASO // 1000} mil tokens: tu IA lo termina en pocos minutos y deja las pruebas en verde.
Si algo es grande, pártelo. El primer paso reemplaza el ejemplo de `pieza.py crear` (ui/app.js, bin/ejemplo.py, la acción «ejemplo»).

Los pasos se conectan por lo que cada uno deja listo:
- En «entrega», escribe con nombres exactos lo que el paso deja para otros pasos: funciones (`modulo.funcion(args) → resultado`),
  acciones de app.json (nombre, datos y respuesta), formato de los datos guardados, pantallas. Así el que viene después lo usa sin
  adivinar. Lo compartido (un formato de datos, una acción base) va en un paso temprano y chico.
- En «depende», los números de los pasos que tienen que estar listos antes (solo pasos anteriores). Un paso que no usa nada de
  otro no depende de él: Pieza hace a la vez los pasos que no dependen entre sí y no tocan los mismos archivos.
Responde SOLO este JSON, sin texto antes ni después:
{{"pasos": [{{"titulo": "…", "que": "qué hace, en 1 a 3 frases", "archivos": ["ruta/relativa"], "tokens": 0,
  "entrega": "lo que deja listo para otros pasos", "depende": [1]}}]}}
En «tokens», tu estimado de lo que gastará ese paso."""


def _ya_hecho(hechos):
    """Al rehacer el plan de una app ya creada: los pasos listos siguen en la carpeta. El plan nuevo es solo lo que falta."""
    if not hechos:
        return ""
    lineas = "\n".join(f"{i + 1}. {x['titulo']}: {_texto(x.get('resumen') or x.get('que'), 300)}"
                       + (f" Dejó listo: {x['entrega']}" if x.get("entrega") else "") for i, x in enumerate(hechos))
    return (f"# Lo que ya está hecho en la carpeta (pasos 1 a {len(hechos)}: no los repitas)\n{lineas}\n"
            f"Planifica SOLO lo que falta. Tus pasos se numeran desde el {len(hechos) + 1}; en «depende» puedes usar los ya hechos.\n\n")


def plan(d):
    nombre = _texto(d.get("nombre"), 40)
    frase = _texto(d.get("frase"), MAX_FRASE)
    detalle = _texto(d.get("detalle"), MAX_DETALLE)
    acuerdos = [t for t in (_texto(a, 400) for a in (d.get("acuerdos") or [])[:MAX_ACUERDOS] if isinstance(a, str)) if t]
    pid = _id(nombre)
    if not pid or not pid[0].isalpha() or not frase:
        raise ValueError("Falta el nombre o la frase de la app.")
    ficha = piezas.ficha({"plataformas": d.get("plataformas"), "piezas": d.get("piezas") or []})
    try:
        p = _leer(pid)
    except ValueError:
        p = {"id": pid, "estado": "nuevo", "pasos": [], "gastado": 0, "gastado_plan": 0}
    creada = p.get("estado") in ("creado", "pasos")
    p.update({"nombre": nombre, "frase": frase, "detalle": detalle, "acuerdos": acuerdos, "revision": None})
    if not creada:
        p.update({"plataformas": ficha["plataformas"], "piezas": [x for x in d.get("piezas") or [] if x in ficha["piezas"]],
                  "ahorro": ficha["tokens_ahorrados"]})
    else:
        # Una app ya creada: sus piezas están en la carpeta. Se rehace solo lo que falta; los pasos listos se quedan.
        ficha = piezas.ficha({"plataformas": p["plataformas"], "piezas": p.get("piezas") or []})
    hechos = [x for x in p.get("pasos") or [] if creada and x.get("estado") == "listo"]
    # Un cambio a una app ya creada (o publicada): los pasos nuevos son solo para ese cambio y quedan después de los hechos.
    cambio = _texto(d.get("cambio"), MAX_CAMBIO) if creada else ""
    if cambio:
        p["cambios"] = (p.get("cambios") or [])[-19:] + [cambio]
    pedido, gastado, pasos = _prompt_plan(p, ficha, hechos, cambio), 0, None
    for intento in range(INTENTOS):
        texto, error = ia.preguntar(pedido, timeout=600)
        if error:
            return {"ok": False, "error": ia.frase(error), "codigo": error["codigo"]}
        gastado += tokens(pedido, texto)
        try:
            pasos = validar_plan(_json_de(texto), maximo=min(MAX_PASOS, MAX_PASOS_TOTAL - len(hechos)), previos=len(hechos))
            break
        except ValueError as e:
            falla = str(e)
            # Una app grande a veces sale con más pasos de la cuenta o sin JSON: se pide de nuevo diciendo qué falló.
            pedido = _prompt_plan(p, ficha, hechos, cambio) + (f"\n\n# Tu respuesta anterior no sirvió\n{falla} Si te pasaste de pasos, junta los más "
                                                f"chicos; si un paso es muy grande, divídelo. Responde solo el JSON.")
    p["gastado_plan"] = p.get("gastado_plan", 0) + gastado
    if pasos is None:
        p["gastado"] = p["gastado_plan"] + sum(x.get("gastado", 0) for x in p.get("pasos") or [])
        _guardar(p)
        return {"ok": False, "error": falla, "codigo": "plan", "gastado": gastado}
    if creada:
        # Lo que gastaron los pasos que se van (no listos) sigue en la cuenta.
        p["gastado_plan"] += sum(x.get("gastado", 0) for x in p["pasos"] if x.get("estado") != "listo")
        nuevo_indice = {i: j for j, i in enumerate(i for i, x in enumerate(p["pasos"]) if x.get("estado") == "listo")}
        p["pasos"] = [dict(p["pasos"][i], depende=[nuevo_indice[d] for d in dependencias(p, i) if d in nuevo_indice])
                      for i in sorted(nuevo_indice)]
    p["pasos"] = (p["pasos"] if creada else []) + [dict(x, estado="pendiente", gastado=0) for x in pasos]
    if not creada:
        p["estado"] = "plan"
    p["gastado"] = p["gastado_plan"] + sum(x.get("gastado", 0) for x in p["pasos"])
    return {"ok": True, "proyecto": _guardar(p)}


# ── Revisar a ciegas (elefante y pez dorado) ─────────────────────────────────────────────────────────────────────────────

def _documento(p):
    pasos = "\n".join(f"{i + 1}. {x['titulo']}: {x['que']}" for i, x in enumerate(p.get("pasos") or []))
    return f"""# {p['nombre']}
{p['frase']}
Sistemas: {', '.join(p.get('plataformas') or [])}
{_detalle(p)}
# El plan de pasos
{pasos}"""


def _prompt_revisar(p, enfoque):
    return f"""Eres un revisor exigente. No participaste en este proyecto y solo conoces el documento de abajo.
Tu enfoque: {ENFOQUES[enfoque]}
Busca fallas concretas, no elogios. Si algo está bien, no lo menciones. Como máximo {MAX_HALLAZGOS} hallazgos, de lo más grave a
lo menos grave. Escribe en el idioma del documento, con frases cortas.

Responde SOLO este JSON, sin texto antes ni después:
{{"hallazgos": [{{"gravedad": "alta" | "media" | "baja", "problema": "qué falla, en 1 o 2 frases",
  "propuesta": "qué cambiar, en 1 o 2 frases, lista para agregar a la idea"}}]}}

--- DOCUMENTO ---
{_documento(p)}"""


def validar_revision(datos, enfoque):
    if not isinstance(datos, dict) or not isinstance(datos.get("hallazgos"), list):
        raise ValueError("La revisión no trae «hallazgos».")
    limpio = []
    for h in datos["hallazgos"][:MAX_HALLAZGOS]:
        if not isinstance(h, dict) or h.get("gravedad") not in ("alta", "media", "baja"):
            continue
        problema, propuesta = _texto(h.get("problema"), 400), _texto(h.get("propuesta"), 400)
        if problema and propuesta:
            limpio.append({"enfoque": enfoque, "gravedad": h["gravedad"], "problema": problema, "propuesta": propuesta})
    return limpio


def revisar(d):
    p = _leer(d.get("id"))
    if p.get("estado") not in ("plan", "creado", "pasos") or not p.get("pasos"):
        raise ValueError("Primero haz el plan.")

    def uno(enfoque):
        pedido = _prompt_revisar(p, enfoque)
        texto, error = ia.preguntar(pedido, timeout=600)  # sesión nueva, sin herramientas ni la conversación del plan
        if error:
            return enfoque, [], tokens(pedido), error
        try:
            return enfoque, validar_revision(_json_de(texto), enfoque), tokens(pedido, texto), None
        except ValueError:
            return enfoque, [], tokens(pedido, texto), None

    with ThreadPoolExecutor(max_workers=len(ENFOQUES)) as hilos:
        resultados = list(hilos.map(uno, ENFOQUES))
    errores = [e for _, _, _, e in resultados if e]
    if len(errores) == len(ENFOQUES):
        return {"ok": False, "error": ia.frase(errores[0]), "codigo": errores[0]["codigo"]}
    orden = {"alta": 0, "media": 1, "baja": 2}
    hallazgos = sorted((h for _, hs, _, _ in resultados for h in hs), key=lambda h: orden[h["gravedad"]])
    for i, h in enumerate(hallazgos):
        h["id"] = f"h{i + 1}"
    gastado = sum(g for _, _, g, _ in resultados)
    p["gastado_plan"] = p.get("gastado_plan", 0) + gastado
    p["gastado"] = p["gastado_plan"]
    p["revision"] = {"hallazgos": hallazgos, "gastado": gastado, "enfoques": [e for e, _, _, err in resultados if not err]}
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
    # Solo las piezas que ya existen: las «por hacer» las escribe la IA en los pasos (están en el plan), no pieza.py crear.
    cat = piezas.catalogo()
    listas = [x for x in p["piezas"] if (cat.get(x) or {}).get("estado") == "lista"]
    r = subprocess.run([sys.executable, _pieza_py(), "crear", carpeta, "--id", p["id"], "--nombre", p["nombre"],
                        "--plataformas", ",".join(x for x in p["plataformas"] if x != "web") or "mac,windows,linux",
                        "--piezas", ",".join(listas)], capture_output=True, text=True, timeout=300, env=_entorno())
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


# Donde suelen quedar herramientas que no están en el PATH de una app (Rust con rustup, cargo install). La pieza «ia» ya suma las
# de los CLI de IA, Homebrew y Node.
RUTAS_EXTRA = [os.path.join(os.path.expanduser("~"), ".cargo", "bin")]


def sumar_rutas():
    actual = os.environ.get("PATH", "").split(os.pathsep)
    nuevas = [d for d in RUTAS_EXTRA if os.path.isdir(d) and d not in actual]
    if nuevas:
        os.environ["PATH"] = os.pathsep.join(actual + nuevas)


sumar_rutas()


def _entorno():
    """Lo que corre en la carpeta de la app no recibe las variables de Pieza."""
    return {k: v for k, v in os.environ.items() if not k.startswith(nucleo.prefijo())}


# Las pruebas corren código que escribió la IA: van aisladas. Sin internet (solo localhost), escriben solo en la carpeta de la app y
# en temporales, y no leen llaves ni carpetas privadas. Mac: sandbox-exec. Linux: bubblewrap si está. Windows: sin aislar (se dice).
PRIVADAS = (".ssh", ".gnupg", ".aws", ".config/gh", ".netrc", "Library/Keychains", "Library/Cookies", "Library/Mail", "Library/Messages",
            "Documents", "Desktop", "Downloads", "Library/Application Support/Pieza")


def _perfil_mac(carpeta):
    h = os.path.expanduser("~")
    lee = " ".join(f'({"literal" if x == ".netrc" else "subpath"} "{os.path.join(h, x)}")' for x in PRIVADAS)
    return f"""(version 1)
(allow default)
(deny network-outbound)
(allow network-outbound (remote ip "localhost:*"))
(allow network-outbound (remote unix-socket))
(deny file-write*)
(allow file-write* (subpath "{carpeta}") (subpath "/private/tmp") (subpath "/private/var/folders") (subpath "/dev") (subpath "{h}/Library/Caches"))
(deny file-read* {lee})
"""


def aislar(orden, carpeta):
    """(la orden envuelta en el aislamiento del sistema, si quedó aislada)."""
    carpeta = os.path.realpath(carpeta)
    if '"' in carpeta or "\\" in carpeta:
        return orden, False
    if sys.platform == "darwin" and os.path.exists("/usr/bin/sandbox-exec"):
        return ["/usr/bin/sandbox-exec", "-p", _perfil_mac(carpeta), *orden], True
    if sys.platform.startswith("linux") and shutil.which("bwrap"):
        h = os.path.expanduser("~")
        tapar = [a for x in PRIVADAS if os.path.isdir(os.path.join(h, x)) for a in ("--tmpfs", os.path.join(h, x))]
        return ["bwrap", "--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp", *tapar,
                "--bind", carpeta, carpeta, "--unshare-net", "--die-with-parent", "--chdir", carpeta, *orden], True
    return orden, False


def _preparar_rust(carpeta):
    """Las dependencias de Rust se bajan antes, fuera del aislamiento (cargo fetch no compila ni corre nada): adentro no hay red."""
    manifiesto = os.path.join(carpeta, "escritorio", "Cargo.toml")
    if os.path.isfile(manifiesto) and shutil.which("cargo"):
        try:
            subprocess.run(["cargo", "fetch", "--manifest-path", manifiesto], cwd=carpeta, capture_output=True, timeout=600, env=_entorno())
        except (OSError, subprocess.TimeoutExpired):
            pass


def probar(carpeta):
    """(ok, las últimas líneas) de bash pruebas/correr.sh, aislado si el sistema lo permite."""
    _preparar_rust(carpeta)
    orden, _ = aislar(["bash", "pruebas/correr.sh"], carpeta)
    try:
        r = subprocess.run(orden, cwd=carpeta, capture_output=True, text=True, timeout=LIMITE_PRUEBAS, env=_entorno())
    except FileNotFoundError:
        return False, "No encontré bash para correr las pruebas."
    except subprocess.TimeoutExpired:
        return False, "Las pruebas tardaron demasiado."
    salida = "\n".join(((r.stdout or "") + "\n" + (r.stderr or "")).strip().splitlines()[-60:])
    return r.returncode == 0, salida


def _no_leer(rel):
    return any(rel == x or (x.endswith("/") and rel.startswith(x)) for x in NO_LEER)


def _mapa(carpeta):
    """Los archivos de la app que la IA puede leer, con su tamaño: así va directo a lo que necesita. Las piezas van aparte."""
    de_piezas = _de_piezas(carpeta)
    propios, piezas_ = [], []
    for raiz, dirs, archivos in os.walk(carpeta):
        dirs[:] = sorted(x for x in dirs if x not in (".git", "node_modules", "target", "__pycache__", "dist"))
        for a in sorted(archivos):
            rel = os.path.relpath(os.path.join(raiz, a), carpeta).replace(os.sep, "/")
            if _no_leer(rel) or rel.startswith("pruebas/datos/"):
                continue
            try:
                kb = max(1, round(os.path.getsize(os.path.join(raiz, a)) / 1024))
            except OSError:
                continue
            (piezas_ if rel in de_piezas else propios).append(f"{rel} ({kb} KB)")
    return propios[:MAX_MAPA], piezas_[:MAX_MAPA]


def _historia(p, n):
    """Lo que hicieron los pasos que quedaron listos: su resumen, lo que dejaron listo y qué archivos tocaron. Los pasos de los que
    depende este van primero y completos; los demás, cortos."""
    dep = set(dependencias(p, n))
    primero, resto = [], []
    for i, x in enumerate(p["pasos"]):
        if i == n or x.get("estado") != "listo":
            continue
        tocados = ", ".join((x.get("escritos") or [])[:12])
        entrega = f" Dejó listo: {x['entrega']}" if x.get("entrega") else ""
        if i in dep:
            primero.append(f"{i + 1}. {x['titulo']} (este paso lo usa): {_texto(x.get('resumen'), 600) or 'listo'}{entrega}"
                           + (f" (tocó {tocados})" if tocados else ""))
        else:
            resto.append(f"{i + 1}. {x['titulo']}: {_texto(x.get('resumen'), 200) or 'listo'}{entrega}")
    return "\n".join(primero + resto) or "Ninguno todavía."


def _prompt_paso(p, n, error=None):
    with open(os.path.join(_guias(), "reglas.md"), encoding="utf-8") as f:
        reglas = f.read()
    plan_ = "\n".join(f"{i + 1}. {x['titulo']} ({x['estado']})" for i, x in enumerate(p["pasos"]))
    x = p["pasos"][n]
    propios, de_piezas = _mapa(p["carpeta"])
    extra = (f"\n\n# El intento anterior no quedó\nArregla la causa (puede que lo del paso ya esté hecho y solo falte arreglar esto). "
             f"Las últimas líneas:\n```\n{error}\n```") if error else ""
    return f"""{reglas}

# La app «{p['nombre']}»
{p['frase']}
{_detalle(p)}
# El plan
{plan_}

# Lo que ya hicieron los pasos anteriores
{_historia(p, n)}

# Los archivos de la app
Propios (los que se cambian): {", ".join(propios) or "ninguno"}
De piezas (no se cambian; su API está en AGENTS.md): {", ".join(de_piezas) or "ninguno"}

# Este paso ({n + 1})
{x['titulo']}
{x['que']}
Archivos que pensabas tocar: {', '.join(x['archivos']) or 'los que hagan falta'}{_entrega(p, n)}{extra}

# Cómo responder
Lee solo lo que necesitas (usa el mapa de arriba). Responde SOLO este JSON, sin texto antes ni después:
{{"resumen": "qué hiciste, en 1 a 3 frases", "archivos": [{{"ruta": "ruta/relativa", "contenido": "el archivo completo"}}],
 "borrar": ["ruta/que/ya/no/sirve"]}}
«borrar» es opcional (por ejemplo, el ejemplo de `pieza.py crear` que reemplazas)."""


def _entrega(p, n):
    """Lo que este paso tiene que dejar listo para los que vienen (con esos nombres exactos) y quiénes lo van a usar."""
    x = p["pasos"][n]
    usan = [str(j + 1) for j in range(n + 1, len(p["pasos"])) if n in dependencias(p, j)]
    if not x.get("entrega") and not usan:
        return ""
    return ("\nLo que tiene que dejar listo, con estos nombres (otros pasos lo usan): " + (x.get("entrega") or "lo que hagas")
            + (f" (lo usan los pasos {', '.join(usan)})" if usan else ""))


def _ultima_linea(salida):
    """La línea que mejor dice qué falló (para verla en vivo): primero la de la prueba que falló («FAIL:», «AssertionError»…), si
    no la última que hable de un error, y si no, la última."""
    lineas = [l.strip() for l in (salida or "").splitlines() if l.strip()]
    for patron in (r"^(FAIL|ERROR):|AssertionError|Error:|✕|falló", r"error|fail|fall[óo]|assert"):
        for l in reversed(lineas):
            if re.search(patron, l, re.I) and not l.startswith("FAILED ("):
                return l[:200]
    return lineas[-1][:200] if lineas else ""


def _gastar(x, uso, estimado):
    """Suma al paso los tokens reales si la IA los dijo; si no, la estimación. `cache` (lo que la IA reusó, mucho más barato) va
    aparte y no entra en «gastado»."""
    if uso.get("entrada") or uso.get("salida"):
        x["gastado"] = x.get("gastado", 0) + uso.get("entrada", 0) + uso.get("salida", 0)
        x["cache"] = x.get("cache", 0) + uso.get("cache", 0)
        x["medido"] = True
    else:
        x["gastado"] = x.get("gastado", 0) + estimado


def paso(d):
    p = _leer(d.get("id"))
    n = d.get("n")
    if p.get("estado") not in ("creado", "pasos") or not p.get("carpeta"):
        raise ValueError("Primero crea la app.")
    if not isinstance(n, int) or not 0 <= n < len(p["pasos"]):
        raise ValueError("Paso desconocido.")
    carpeta, x = p["carpeta"], p["pasos"][n]
    # Si el paso ya falló, el error de la vez anterior va desde el primer intento: así «Arreglarlo» le dice a la IA qué pasó.
    error_prueba = x.get("error") if x.get("estado") == "fallo" and x.get("error") else None
    resumen, escritos = "", []
    edita = ia.puede_escribir()
    registro, historial = [], list(x.get("historial") or [])[-(MAX_HISTORIAL - INTENTOS):]
    x.pop("causa", None)

    def anotar(intento, causa=""):
        """Lo que hizo cada intento, para que la persona vea qué pasó (y por qué falló) aunque el paso no quede."""
        historial.append({"intento": len(historial) + 1, "resumen": resumen, "escritos": escritos[:40],
                          "causa": causa, "error": (x.get("error") or "")[-1500:] if causa else ""})
    for intento in range(1, INTENTOS + 1):
        if edita:
            # La IA edita la carpeta directamente; después Pieza devuelve lo que no le toca.
            antes = _foto(carpeta)
            pedido = _prompt_editar(p, n, error_prueba)
            trabajos.emitir({"t": "fase", "fase": "ia", "n": n, "intento": intento})
            uso = {}
            texto, error = ia.preguntar_vivo(pedido, timeout=LIMITE_IA, escribir=carpeta, no_leer=NO_LEER,
                                             al_evento=_avisar(carpeta, n, intento, uso, registro))
            trabajos.emitir({"t": "fase", "fase": "revisar", "n": n, "intento": intento})
            nuevos, cuidados, bytes_ = _cuidar(carpeta, antes)
            _gastar(x, uso, tokens(pedido, texto) + bytes_ // CARACTERES_POR_TOKEN)
            if cuidados:
                x["cuidados"] = sorted(set(x.get("cuidados", [])) | set(cuidados))
            if error:
                escritos = sorted(set(escritos) | set(nuevos))
                x.update(estado="fallo", error=ia.frase(error), intentos=intento, escritos=escritos)
                anotar(intento, "ia")
                break
            resumen = _texto(texto, MAX_RESUMEN)
            escritos = sorted(set(escritos) | set(nuevos))
            # Sin cambios no es un fallo: lo que pide el paso puede estar hecho de antes. Mandan las pruebas (más abajo).
        else:
            pedido = _prompt_paso(p, n, error_prueba)
            trabajos.emitir({"t": "fase", "fase": "ia", "n": n, "intento": intento})
            uso = {}
            texto, error = ia.preguntar_vivo(pedido, timeout=LIMITE_IA, leer=carpeta, no_leer=NO_LEER,
                                             al_evento=_avisar(carpeta, n, intento, uso, registro))
            _gastar(x, uso, tokens(pedido, texto))
            if error:
                x.update(estado="fallo", error=ia.frase(error), intentos=intento)
                anotar(intento, "ia")
                break
            try:
                resumen, archivos, borrar = validar_archivos(_json_de(texto), carpeta)
            except ValueError as e:
                error_prueba = f"La respuesta no se pudo usar: {e}"
                x.update(estado="fallo", error=str(e), intentos=intento)
                anotar(intento, "respuesta")
                continue
            _escribir(carpeta, archivos)
            for ruta in borrar:
                destino = nucleo.ruta_en(carpeta, ruta)
                if destino and os.path.isfile(destino):
                    os.remove(destino)
            escritos = sorted(set(escritos) | {r for r, _ in archivos})
        # acciones.json lo arma Pieza desde app.json (la IA no puede tocarlo): siempre antes de las pruebas, aunque app.json haya
        # cambiado en un intento anterior. Si no, el contrato falla con «acciones.json no está al día» y la IA no lo puede arreglar.
        trabajos.emitir({"t": "fase", "fase": "acciones", "n": n, "intento": intento})
        falla = _armar_acciones(carpeta)
        if falla:
            error_prueba = falla
            x.update(estado="fallo", error=error_prueba, intentos=intento, resumen=resumen, escritos=escritos)
            anotar(intento, "acciones")
            continue
        trabajos.emitir({"t": "fase", "fase": "pruebas", "n": n, "intento": intento})
        registro.append({"t": "prueba", "ruta": "pruebas/correr.sh", "intento": intento})
        ok, salida = probar(carpeta)
        x.update(intentos=intento, resumen=resumen, escritos=escritos)
        if ok:
            x.update(estado="listo", error="")
            anotar(intento)
            break
        error_prueba = salida
        x.update(estado="fallo", error=salida[-1500:])
        trabajos.emitir({"t": "prueba", "ok": False, "n": n, "intento": intento, "ultima": _ultima_linea(salida)})
        # Freno de gasto: si el paso ya gastó más de FRENO veces lo estimado, no se intenta de nuevo solo; la persona decide.
        if x.get("tokens") and x.get("gastado", 0) > FRENO * x["tokens"] and intento < INTENTOS:
            anotar(intento, "gasto")
            break
        anotar(intento, "pruebas")
    x["historial"] = historial[-MAX_HISTORIAL:]
    x["registro"] = registro[-MAX_REGISTRO:]
    if x["estado"] == "fallo":
        x["causa"] = historial[-1]["causa"] if historial else "ia"
    p["estado"] = "pasos"
    p["gastado"] = sum(y.get("gastado", 0) for y in p["pasos"]) + p.get("gastado_plan", 0)
    return {"ok": x["estado"] == "listo", "proyecto": _guardar(p), "n": n}


# ── Dividir un paso grande ───────────────────────────────────────────────────────────────────────────────────────────────

def _prompt_dividir(p, n):
    x = p["pasos"][n]
    intentos = "\n".join(f"- Intento {h['intento']}: {h.get('causa') or 'quedó'}. {_texto(h.get('resumen'), 300)}"
                          for h in (x.get("historial") or [])[-3:])
    error = f"\n# El último error\n```\n{_texto(x.get('error'), 1200)}\n```" if x.get("error") else ""
    return f"""Eres quien planifica los pasos de la app «{p['nombre']}» ({p['frase']}).
{_detalle(p)}
# El plan
{chr(10).join(f"{i + 1}. {y['titulo']} ({y['estado']})" for i, y in enumerate(p['pasos']))}

# El paso {n + 1} es muy grande o no quedó
{x['titulo']}: {x['que']}
Archivos: {', '.join(x.get('archivos') or []) or 'sin decir'}
Lo que deja listo: {x.get('entrega') or 'sin decir'}
{f"# Lo que pasó{chr(10)}{intentos}" if intentos else ""}{error}
# Escritos por un intento anterior (siguen en la carpeta: úsalos, no partas de cero)
{', '.join(x.get('escritos') or []) or 'ninguno'}

# Lo que te pido
Divide SOLO este paso en 2 a 4 pasos más chicos, en orden. Cada uno hace una sola cosa que se puede probar, toca pocos archivos
y gasta menos de {TOPE_PASO // 1000} mil tokens. Entre todos hacen lo mismo que el paso original y dejan listo lo mismo.
En «depende», los números DENTRO de esta división (1 = el primero de estos pasos); el primero hereda lo que necesitaba el original.
Responde SOLO este JSON:
{{"pasos": [{{"titulo": "…", "que": "…", "archivos": ["ruta"], "tokens": 0, "entrega": "…", "depende": []}}]}}"""


def dividir(d):
    """Cambia el paso n (que no quedó o es muy grande) por 2 a 4 pasos chicos. Los pasos que dependían de él pasan a depender del
    último de los nuevos; los índices de después se corren."""
    p = _leer(d.get("id"))
    n = d.get("n")
    if p.get("estado") not in ("plan", "creado", "pasos") or not isinstance(n, int) or not 0 <= n < len(p["pasos"]):
        raise ValueError("Paso desconocido.")
    x = p["pasos"][n]
    if x.get("estado") == "listo":
        raise ValueError("Ese paso ya está listo.")
    pedido = _prompt_dividir(p, n)
    nuevos, falla, gastado = None, "", 0
    for _ in range(INTENTOS):
        texto, error = ia.preguntar(pedido, timeout=600)
        if error:
            return {"ok": False, "error": ia.frase(error), "codigo": error["codigo"]}
        gastado += tokens(pedido, texto)
        try:
            nuevos = validar_plan(_json_de(texto), maximo=4)
            if len(nuevos) < 2:
                raise ValueError("Divide el paso en 2 a 4 pasos.")
            break
        except ValueError as e:
            falla, nuevos = str(e), None
            pedido = _prompt_dividir(p, n) + f"\n\n# Tu respuesta anterior no sirvió\n{falla} Responde solo el JSON."
    p["gastado_plan"] = p.get("gastado_plan", 0) + gastado
    if nuevos is None or len(p["pasos"]) - 1 + len(nuevos) > MAX_PASOS_TOTAL:
        _guardar(p)
        return {"ok": False, "error": falla or "La app ya tiene demasiados pasos para dividir más.", "codigo": "dividir"}
    k = len(nuevos)
    base = dependencias(p, n)
    viejos = [dict(y, depende=dependencias(p, i)) for i, y in enumerate(p["pasos"])]
    armados = []
    for j, y in enumerate(nuevos):
        # validar_plan los numeró desde 0 dentro de la división (y, sin «depende», del anterior): se pasan a índices del plan.
        dentro = [n + d for d in y["depende"] if 0 <= d < j]
        armados.append(dict(y, depende=sorted(set(base + dentro)) if j == 0 else sorted(set(dentro or [n + j - 1])),
                            estado="pendiente", gastado=0, dividido_de=x["titulo"]))
    if x.get("escritos"):
        armados[0]["que"] = _texto(armados[0]["que"] + " (Un intento anterior dejó cambios en: " + ", ".join(x["escritos"][:8]) + ".)", 700)

    def correr(d):
        return d if d < n else n + k - 1 if d == n else d + k - 1
    despues = [dict(y, depende=sorted({correr(d) for d in y["depende"]})) for y in viejos[n + 1:]]
    p["pasos"] = viejos[:n] + armados + despues
    p["gastado_plan"] += x.get("gastado", 0)  # lo que gastó el paso original no se pierde de la cuenta
    p["gastado"] = sum(y.get("gastado", 0) for y in p["pasos"]) + p["gastado_plan"]
    return {"ok": True, "proyecto": _guardar(p), "n": n, "nuevos": k}


# ── Varios pasos a la vez ────────────────────────────────────────────────────────────────────────────────────────────────

IGNORAR_COPIA = shutil.ignore_patterns(".git", "node_modules", "target", "dist", "__pycache__")


def listos_para_lote(p, saltados=()):
    """Los pasos que se pueden hacer ahora y a la vez: no están listos, todo lo que necesitan está listo y no comparten archivos
    (los de traducciones, CHANGELOG y pruebas sí: se juntan solos). Como máximo MAX_LOTE."""
    elegidos, tocados = [], set()
    for i, x in enumerate(p["pasos"]):
        if x.get("estado") == "listo" or i in saltados:
            continue
        if any(p["pasos"][d].get("estado") != "listo" for d in dependencias(p, i)):
            continue
        propios = {a for a in x.get("archivos") or [] if not a.startswith(SIN_CONTAR)}
        if propios & tocados or (not propios and elegidos):
            continue
        elegidos.append(i)
        tocados |= propios
        if len(elegidos) == MAX_LOTE:
            break
    return elegidos


def _juntar_texto(base, a, b):
    """Junta dos cambios a un mismo texto si tocan líneas distintas (dos agregados en el mismo lugar van los dos). None si chocan."""
    bl = base.splitlines(True)
    trozos = []
    for origen, quien in ((a.splitlines(True), 0), (b.splitlines(True), 1)):
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, bl, origen, autojunk=False).get_opcodes():
            if op != "equal":
                trozos.append((i1, i2, origen[j1:j2], quien))
    for x in trozos:
        for y in trozos:
            if x[3] < y[3]:
                cruzan = max(x[0], y[0]) < min(x[1], y[1])
                dentro = any(p[0] == p[1] and q[0] < p[0] < q[1] for p, q in ((x, y), (y, x)))
                if cruzan or dentro:
                    return None
    trozos.sort(key=lambda t: (t[0], t[0] != t[1], t[3]))
    salida, i = [], 0
    for i1, i2, nuevo, _ in trozos:
        salida.extend(bl[i:i1])
        salida.extend(nuevo)
        i = max(i, i2)
    salida.extend(bl[i:])
    return "".join(salida)


_FALTA = object()


def _juntar_json(base, a, b):
    """Junta dos cambios a un JSON (app.json, idiomas/en.json) clave por clave, en cualquier nivel: lo que cambió uno solo se toma;
    si los dos cambiaron lo mismo de forma distinta, ValueError."""
    if a == b:
        return a
    if a == base:
        return b
    if b == base:
        return a
    if not all(isinstance(v, dict) for v in (a, b)) or not (base is _FALTA or isinstance(base, dict)):
        raise ValueError("choque")
    base = {} if base is _FALTA else base
    salida = {}
    for k in list(a) + [k for k in b if k not in a] + [k for k in base if k not in a and k not in b]:
        v = _juntar_json(base.get(k, _FALTA), a.get(k, _FALTA), b.get(k, _FALTA))
        if v is not _FALTA:
            salida[k] = v
    return salida


def _juntar(base, actual, nuevo, rel):
    """El archivo `rel` como queda con el cambio de un paso (`nuevo`) sobre lo que ya juntaron otros (`actual`). None si chocan."""
    if actual == base:
        return nuevo
    if nuevo == base or nuevo == actual:
        return actual
    if base is None or actual is None or nuevo is None:
        return None
    if rel.endswith(".json"):
        try:
            sangria = 2 if actual.startswith(b'{\n  "') else 1
            return (json.dumps(_juntar_json(json.loads(base), json.loads(actual), json.loads(nuevo)), ensure_ascii=False,
                               indent=sangria) + "\n").encode()
        except ValueError:
            return None
    try:
        r = _juntar_texto(base.decode(), actual.decode(), nuevo.decode())
    except UnicodeDecodeError:
        return None
    return r.encode() if r is not None else None


def lote(d):
    """Hace varios pasos a la vez (los que no dependen entre sí): cada uno en su copia de la carpeta, con la IA que edita. Después
    junta los cambios en la carpeta de la app (los que chocan quedan para después, solos) y corre las pruebas una vez."""
    p = _leer(d.get("id"))
    ns = d.get("ns")
    if p.get("estado") not in ("creado", "pasos") or not p.get("carpeta"):
        raise ValueError("Primero crea la app.")
    if not ia.puede_escribir():
        raise ValueError("Hacer pasos a la vez necesita una IA que edite la carpeta (Claude o Codex).")
    validos = set(listos_para_lote(p, set(range(len(p["pasos"]))) - set(ns if isinstance(ns, list) else [])))
    if not isinstance(ns, list) or not 1 <= len(ns) <= MAX_LOTE or not set(ns) <= validos:
        raise ValueError("Esos pasos no se pueden hacer a la vez.")
    carpeta = p["carpeta"]
    base = _foto(carpeta)

    def uno(n):
        x = p["pasos"][n]
        copia = os.path.join(tempfile.mkdtemp(prefix="pieza-paso-"), "app")
        try:
            shutil.copytree(carpeta, copia, ignore=IGNORAR_COPIA, symlinks=True)
            antes = _foto(copia)
            error_previo = x.get("error") if x.get("estado") == "fallo" else None
            pedido = _prompt_editar(p, n, error_previo)
            trabajos.emitir({"t": "fase", "fase": "ia", "n": n, "intento": 1})
            uso, registro = {}, []
            texto, error = ia.preguntar_vivo(pedido, timeout=LIMITE_IA, escribir=copia, no_leer=NO_LEER,
                                             al_evento=_avisar(copia, n, 1, uso, registro))
            trabajos.emitir({"t": "fase", "fase": "revisar", "n": n, "intento": 1})
            escritos, cuidados, bytes_ = _cuidar(copia, antes)
            final = _foto(copia)
            cambios = {r: final.get(r) for r in escritos}
            return n, {"texto": texto, "error": error, "escritos": escritos, "cuidados": cuidados, "cambios": cambios,
                       "uso": uso, "estimado": tokens(pedido, texto) + bytes_ // CARACTERES_POR_TOKEN, "registro": registro}
        finally:
            shutil.rmtree(os.path.dirname(copia), ignore_errors=True)

    with ThreadPoolExecutor(max_workers=len(ns)) as hilos:
        resultados = dict(hilos.map(uno, ns))
    actual = dict(base)
    aplicados, aplazados = [], []
    for n in sorted(resultados):
        r, x = resultados[n], p["pasos"][n]
        _gastar(x, r["uso"], r["estimado"])
        if r["cuidados"]:
            x["cuidados"] = sorted(set(x.get("cuidados", [])) | set(r["cuidados"]))
        x["registro"] = r["registro"][-MAX_REGISTRO:]
        historial = list(x.get("historial") or [])
        if r["error"]:
            x.update(estado="fallo", error=ia.frase(r["error"]), causa="ia", intentos=1)
            historial.append({"intento": len(historial) + 1, "resumen": "", "escritos": [], "causa": "ia", "error": x["error"]})
            x["historial"] = historial[-MAX_HISTORIAL:]
            continue
        juntado = {}
        for rel, nuevo in r["cambios"].items():
            j = _juntar(base.get(rel), actual.get(rel), nuevo, rel)
            if j is None:
                juntado = None
                break
            juntado[rel] = j
        x.update(resumen=_texto(r["texto"], MAX_RESUMEN), escritos=r["escritos"])
        if juntado is None:
            # Choca con lo que hizo otro paso de este lote: queda pendiente para hacerlo solo, sobre lo ya juntado.
            aplazados.append(n)
            x.update(estado="pendiente", nota="choque")
            continue
        actual.update(juntado)
        aplicados.append(n)
    for rel in sorted(set(actual) | set(base)):
        if actual.get(rel) == base.get(rel):
            continue
        destino = nucleo.ruta_en(carpeta, rel)
        if actual.get(rel) is None:
            if destino and os.path.isfile(destino):
                os.remove(destino)
            continue
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        with open(destino, "wb") as f:
            f.write(actual[rel])
    ok, salida = True, ""
    if aplicados:
        falla = _armar_acciones(carpeta)
        if falla:
            ok, salida = False, falla
        if ok:
            trabajos.emitir({"t": "fase", "fase": "pruebas", "n": aplicados[0], "intento": 1})
            ok, salida = probar(carpeta)
    for n in aplicados:
        x = p["pasos"][n]
        x.pop("nota", None)
        historial = list(x.get("historial") or [])
        causa = "" if ok else ("acciones" if salida.startswith("pieza.py acciones") else "pruebas")
        historial.append({"intento": len(historial) + 1, "resumen": x.get("resumen", ""), "escritos": x.get("escritos", [])[:40],
                          "causa": causa, "error": "" if ok else salida[-1500:]})
        x["historial"] = historial[-MAX_HISTORIAL:]
        x["intentos"] = 1
        if ok:
            x.update(estado="listo", error="")
            x.pop("causa", None)
        else:
            # Las pruebas corren una vez para todo el lote: no se sabe cuál de estos pasos las rompió. Cada uno queda en
            # «fallo» con el error; al arreglar uno, los demás vuelven a correr las pruebas y quedan si ya pasan.
            x.update(estado="fallo", error=salida[-1500:], causa=causa)
    p["estado"] = "pasos"
    p["gastado"] = sum(y.get("gastado", 0) for y in p["pasos"]) + p.get("gastado_plan", 0)
    return {"ok": ok and not aplazados and all(p["pasos"][n]["estado"] == "listo" for n in ns), "proyecto": _guardar(p), "ns": ns,
            "aplicados": aplicados, "aplazados": aplazados}


def _armar_acciones(carpeta):
    """pieza.py acciones: acciones.json al día con app.json. None si quedó bien; si no, el error (para la IA: está en app.json)."""
    r = subprocess.run([sys.executable, _pieza_py(), "acciones", carpeta], capture_output=True, text=True, timeout=120, env=_entorno())
    if r.returncode == 0:
        return None
    return ("pieza.py acciones falló (revisa las acciones de app.json; acciones.json lo arma Pieza, no lo escribas): "
            + (r.stderr or r.stdout).strip()[-1500:])


def _foto(carpeta):
    """{ruta relativa: bytes} de lo propio de la app (sin .git, node_modules ni target), para saber qué cambió en un paso."""
    foto = {}
    for raiz, dirs, archivos in os.walk(carpeta):
        dirs[:] = [x for x in dirs if x not in (".git", "node_modules", "target", "__pycache__")]
        for a in archivos:
            ruta = os.path.join(raiz, a)
            rel = os.path.relpath(ruta, carpeta).replace(os.sep, "/")
            try:
                if os.path.getsize(ruta) <= 5_000_000:
                    with open(ruta, "rb") as f:
                        foto[rel] = f.read()
            except OSError:
                pass
    return foto


def _cuidar(carpeta, antes):
    """Después de que la IA editó: devuelve lo que no le toca (piezas, piezas.json, acciones.json, lo que identifica a la app en
    app.json) y dice qué archivos cambió. Devuelve (escritos, cuidados, bytes_escritos)."""
    ahora = _foto(carpeta)
    intocables = (_de_piezas(carpeta) | PROTEGIDOS) & set(antes)
    cuidados = []
    for rel in sorted(intocables):
        if ahora.get(rel) != antes[rel]:
            destino = nucleo.ruta_en(carpeta, rel)
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            with open(destino, "wb") as f:
                f.write(antes[rel])
            cuidados.append(rel)
    if "app.json" in antes and ahora.get("app.json") != antes["app.json"]:
        try:
            nuevo, viejo = json.loads(ahora.get("app.json") or b"{}"), json.loads(antes["app.json"])
            if not isinstance(nuevo, dict):
                raise ValueError
            for k in APP_FIJO:
                if nuevo.get(k) != viejo.get(k):
                    if k in viejo:
                        nuevo[k] = viejo[k]
                    else:
                        nuevo.pop(k, None)
                    cuidados.append(f"app.json:{k}")
            nucleo.escribir_json(os.path.join(carpeta, "app.json"), nuevo)
        except ValueError:
            with open(os.path.join(carpeta, "app.json"), "wb") as f:
                f.write(antes["app.json"])
            cuidados.append("app.json")
    final = _foto(carpeta)
    escritos = sorted(r for r in set(final) | set(antes) if final.get(r) != antes.get(r))
    return escritos, cuidados, sum(_cambiado(antes.get(r, b""), final.get(r, b"")) for r in escritos)


def _cambiado(antes, ahora):
    """Cuántos bytes nuevos hay en `ahora`: sin lo que quedó igual al principio y al final (una edición chica en un archivo grande
    cuenta poco)."""
    i, tope = 0, min(len(antes), len(ahora))
    while i < tope and antes[i] == ahora[i]:
        i += 1
    j = 0
    while j < tope - i and antes[-1 - j] == ahora[-1 - j]:
        j += 1
    return len(ahora) - i - j


def _avisar(carpeta, n, intento, uso=None, registro=None):
    """En vivo para la interfaz (pieza «trabajos», acción con «progreso»): qué lee y qué escribe la IA, con rutas de la app.
    Los tokens que la IA dice haber usado ({"t": "uso"}) se suman en `uso`. Lo que lee y escribe queda en `registro` (se guarda
    en el paso: así se ve después qué hizo)."""
    def al_evento(e):
        if e.get("t") == "uso" and uso is not None:
            for k in ("entrada", "cache", "salida"):
                v = e.get(k)
                uso[k] = uso.get(k, 0) + (v if isinstance(v, int) and v >= 0 else 0)
            # Cuánto va gastando este intento, para verlo en vivo (lo mismo que se cobra al terminar).
            trabajos.emitir({"t": "uso", "n": n, "intento": intento, "tokens": uso.get("entrada", 0) + uso.get("salida", 0)})
            return
        if e.get("t") == "busca" and isinstance(e.get("patron"), str):
            trabajos.emitir({"t": "busca", "patron": e["patron"][:80], "n": n, "intento": intento})
            return
        ruta = e.get("ruta") if isinstance(e.get("ruta"), str) else ""
        if ruta.startswith(carpeta):
            ruta = os.path.relpath(ruta, carpeta).replace(os.sep, "/")
        if e.get("t") in ("lee", "escribe") and ruta and not ruta.startswith(".."):
            trabajos.emitir({"t": e["t"], "ruta": ruta[:200], "n": n, "intento": intento})
            if registro is not None and (not registro or registro[-1].get("ruta") != ruta[:200] or registro[-1].get("t") != e["t"]):
                registro.append({"t": e["t"], "ruta": ruta[:200], "intento": intento})
    return al_evento


def _prompt_editar(p, n, error=None):
    """El pedido de un paso cuando la IA edita la carpeta: las mismas reglas, sin JSON."""
    base = _prompt_paso(p, n, error)
    return base.split("# Cómo responder")[0] + """# Cómo trabajar en este paso
1. Lee solo lo que necesitas: los archivos que vas a cambiar y lo que los usa. Usa el mapa de arriba y busca con Grep en un
   archivo grande antes de leerlo entero. Lee un archivo de pieza solo si su API no está en AGENTS.md.
2. Crea o cambia los archivos que el paso necesita, directamente en la carpeta. No toques los archivos de piezas.
3. Al terminar, responde en 1 a 3 frases qué hiciste. Nada más."""


def borrar(d):
    """Quita una app de la lista. Con carpeta «si», también borra su carpeta, pero solo si está dentro de la carpeta de Pieza y es
    esa misma app (su app.json dice su id): nunca otra cosa del computador."""
    p = _leer(d.get("id"))
    carpeta_tambien = d.get("carpeta") == "si"
    borrada = False
    c = p.get("carpeta")
    if carpeta_tambien and isinstance(c, str) and c:
        base = os.path.realpath(_base_proyectos())
        real = os.path.realpath(c)
        dentro = os.path.commonpath([base, real]) == base and real != base
        app = nucleo.leer_json(os.path.join(real, "app.json"), {}, maximo=2_000_000) if dentro else {}
        if not dentro or not isinstance(app, dict) or app.get("id") != p["id"]:
            raise ValueError("No borré la carpeta: no es la de esta app dentro de la carpeta Pieza.")
        shutil.rmtree(real)
        borrada = True
    os.remove(os.path.join(_registro(), p["id"] + ".json"))
    return {"ok": True, "id": p["id"], "carpeta": borrada}


def abrir(d):
    """Abre la carpeta de la app en el Finder, el Explorador o el gestor de archivos."""
    p = _leer(d.get("id"))
    c = p.get("carpeta")
    if not c or not os.path.isdir(c):
        raise ValueError("Esta app todavía no tiene carpeta.")
    orden = ["open", c] if sys.platform == "darwin" else ["explorer", c] if sys.platform.startswith("win") else ["xdg-open", c]
    subprocess.Popen(orden, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"ok": True}


def lista(_d):
    """Las apps del registro: solo `<id>.json` cuyo id es ese (una copia o un respaldo en la carpeta, como `x.antes.json`, no es otra
    app: si no, aparecerían dos con el mismo id y se marcarían las dos)."""
    proyectos = []
    for nombre in sorted(os.listdir(_registro())):
        if nombre.endswith(".json"):
            p = nucleo.leer_json(os.path.join(_registro(), nombre), None, maximo=2_000_000)
            if isinstance(p, dict) and p.get("id") and nombre == p["id"] + ".json":
                proyectos.append(p)
    return {"ok": True, "proyectos": proyectos, "aisladas": aislar(["true"], os.path.expanduser("~"))[1]}


if __name__ == "__main__":
    nucleo.script({"lista": lista, "plan": plan, "revisar": revisar, "crear": crear, "paso": paso, "lote": lote, "dividir": dividir,
                   "borrar": borrar, "abrir": abrir}, __doc__)
