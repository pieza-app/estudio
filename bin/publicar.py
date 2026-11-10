#!/usr/bin/env python3
"""publicar — subir una app a GitHub y el explorador de apps hechas con Pieza. Solo biblioteca estándar.

  publicar.py explorar <salida.json>
  publicar.py revisar  <entrada.json {id}> <salida.json>
  publicar.py subir    <entrada.json {id, dueno, visibilidad, explorador}> <salida.json>
  publicar.py instalar <entrada.json {id}> <salida.json>
  publicar.py conectar <entrada.json {id}> <salida.json>
  publicar.py preparar <entrada.json {id}> <salida.json>

- `explorar`: las apps con el topic «hecho-con-pieza» que lista la página de Pieza (solo pieza-app.github.io, pieza «red»).
- `revisar`: si `gh` está instalado y con sesión, el usuario y sus organizaciones (dónde puede crear el repo).
- `subir`: con la cuenta de la persona (su `gh`), nunca con una nuestra. Pone el repo en app.json y regenera lo que depende de él,
  revisa la privacidad, hace el primer commit, crea el repo y sube. Con `explorador` (y repo público) suma el topic
  «hecho-con-pieza»: así aparece en el explorador sin pedirle permiso a nadie. Activa GitHub Pages para la página de la app.

- `instalar`: GitHub CLI con el instalador del sistema (Homebrew en Mac, winget en Windows). Sin instalador, `guia`: dónde
  bajarlo. Nunca se baja un binario por nuestra cuenta.
- `conectar`: `gh auth login --web` con la cuenta de la persona. El código de una vez sale en el avance ({"t": "codigo"}) y la
  interfaz lo muestra con «Abrir GitHub» (github.com/login/device): la persona lo pega en GitHub y Pieza espera hasta que
  autoriza. Pieza nunca ve ni guarda la clave: la guarda gh en el llavero del sistema.

- `preparar`: lo que se va a subir, antes de subir nada: la lista de archivos, secretos (bloquean), datos personales (la persona
  confirma que son de ejemplo) y qué hace la app (a qué dominios se conecta, si corre comandos). `subir` lo vuelve a revisar.

Lo que escribe la persona (la frase) nunca va como argumento: la descripción del repo va por un archivo de entrada a `gh api`.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

import trabajos
import ia  # noqa: F401 — prepara el PATH (los CLI de Homebrew, npm…) igual que para la IA
import nucleo
import proyectos

PAGINA = "https://pieza-app.github.io/pieza/datos/proyectos.json"
TOPIC = "hecho-con-pieza"
DUENO = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")


def _gh(*args, entrada=None, cwd=None, timeout=120):
    r = subprocess.run(["gh", *args], input=entrada, capture_output=True, text=True, timeout=timeout, cwd=cwd,
                       env=proyectos._entorno())
    return r.returncode == 0, (r.stdout or "").strip(), (r.stderr or "").strip()


def _git(carpeta, *args):
    r = subprocess.run(["git", *args], cwd=carpeta, capture_output=True, text=True, timeout=120, env=proyectos._entorno())
    if r.returncode != 0:
        raise ValueError((r.stderr or r.stdout).strip()[-400:] or "git falló.")
    return r.stdout.strip()


# ── El explorador ────────────────────────────────────────────────────────────────────────────────────────────────────────

def _texto(v, maximo):
    return v.strip()[:maximo] if isinstance(v, str) else ""


def limpiar_apps(datos):
    """Lo que viene de la página de Pieza, validado: solo repos de GitHub y páginas https."""
    salida = []
    for x in (datos.get("proyectos") if isinstance(datos, dict) else None) or []:
        if not isinstance(x, dict) or not isinstance(x.get("repo"), str) or not re.fullmatch(r"[\w.-]{1,39}/[\w.-]{1,100}", x["repo"]):
            continue
        pagina = x.get("pagina") if isinstance(x.get("pagina"), str) and x["pagina"].startswith("https://") else ""
        salida.append({"nombre": _texto(x.get("nombre"), 60) or x["repo"].split("/")[1], "repo": x["repo"],
                       "descripcion": _texto(x.get("descripcion"), 280), "pagina": pagina[:300],
                       "revisada": (x.get("revision") or {}).get("estado") == "revisado", "familia": bool(x.get("familia"))})
    return salida[:500]


def explorar(_d):
    import red
    try:
        datos = red.Red(["pieza-app.github.io"], "Pieza").get(PAGINA)
    except red.ErrorRed as e:
        return {"ok": False, "error": "No pude leer el explorador. Revisa tu conexión.", **e.como_dict()}
    return {"ok": True, "apps": limpiar_apps(datos)}


# ── Revisar y subir ──────────────────────────────────────────────────────────────────────────────────────────────────────

def revisar(d):
    proyectos._leer(d.get("id"))
    if not shutil.which("gh"):
        return {"ok": True, "gh": False, "sesion": False}
    ok, usuario, _ = _gh("api", "user", "--jq", ".login")
    if not ok or not DUENO.match(usuario or ""):
        return {"ok": True, "gh": True, "sesion": False}
    _, orgs, _ = _gh("api", "user/orgs", "--jq", ".[].login")
    return {"ok": True, "gh": True, "sesion": True, "usuario": usuario,
            "duenos": [usuario] + [o for o in orgs.splitlines() if DUENO.match(o)][:50]}


CODIGO = re.compile(r"\b([A-Z0-9]{4}-[A-Z0-9]{4})\b")
LIMITE_CONECTAR = 900


def instalar(d):
    """Instala GitHub CLI con el instalador del sistema, si hay uno. Si no, dice dónde bajarlo."""
    proyectos._leer(d.get("id"))
    if shutil.which("gh"):
        return dict(revisar(d), instalado=True)
    if sys.platform == "darwin" and shutil.which("brew"):
        orden = ["brew", "install", "gh"]
    elif sys.platform.startswith("win") and shutil.which("winget"):
        orden = ["winget", "install", "--id", "GitHub.cli", "-e", "--accept-source-agreements", "--accept-package-agreements"]
    else:
        return {"ok": True, "gh": False, "sesion": False, "guia": "https://cli.github.com/"}
    trabajos.emitir({"t": "fase", "fase": "instalar"})
    try:
        r = subprocess.run(orden, capture_output=True, text=True, timeout=840, env=proyectos._entorno())
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "La instalación tardó demasiado.", "guia": "https://cli.github.com/"}
    if r.returncode != 0 or not shutil.which("gh"):
        return {"ok": False, "error": ((r.stderr or r.stdout) or "No se pudo instalar.").strip()[-400:], "guia": "https://cli.github.com/"}
    return dict(revisar(d), instalado=True)


def conectar(d):
    """Inicia sesión en GitHub con la cuenta de la persona: gh muestra un código de una vez, la interfaz lo enseña y abre
    github.com/login/device, y gh espera hasta que la persona autoriza."""
    proyectos._leer(d.get("id"))
    if not shutil.which("gh"):
        return {"ok": True, "gh": False, "sesion": False}
    actual = revisar(d)
    if actual.get("sesion"):
        return actual
    entorno = dict(proyectos._entorno(), GH_BROWSER="true", BROWSER="true", GH_PROMPT_DISABLED="1")  # el navegador lo abre la interfaz
    proc = subprocess.Popen(["gh", "auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web",
                             "--scopes", "repo,workflow,read:org"],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=entorno)
    try:
        proc.stdin.write("\n")  # «Press Enter to open github.com in your browser»
        proc.stdin.flush()
    except OSError:
        pass
    visto = False
    try:
        for linea in proc.stdout:
            m = CODIGO.search(linea)
            if m and not visto:
                visto = True
                trabajos.emitir({"t": "codigo", "codigo": m.group(1), "url": "https://github.com/login/device"})
        proc.wait(timeout=LIMITE_CONECTAR)
    except subprocess.TimeoutExpired:
        proc.kill()
        return {"ok": False, "error": "Se acabó el tiempo para autorizar en GitHub. Inténtalo de nuevo."}
    final = revisar(d)
    if not final.get("sesion"):
        return dict(final, ok=False, error="GitHub no quedó conectado. Inténtalo de nuevo.")
    return final


# ── Antes de subir: secretos, datos personales y qué hace la app ────────────────────────────────────────────────────────

SECRETOS = [
    ("llave privada", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("token de GitHub", re.compile(r"\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}")),
    ("llave de Anthropic u OpenAI", re.compile(r"\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}")),
    ("llave de AWS", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("llave de Google", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("token de Slack", re.compile(r"\bxox[abposr]-[A-Za-z0-9-]{10,}")),
]
PERSONALES = [
    ("RUT", re.compile(r"\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b")),
    ("correo", re.compile(r"\b[A-Za-z0-9._%+-]+@(?!(?:users\.noreply\.github\.com|example\.(?:com|org|cl)|ejemplo\.cl)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    ("teléfono", re.compile(r"\+56\s?9\s?\d{4}\s?\d{4}\b")),
    ("ruta de un usuario", re.compile(r"/(?:Users|home)/(?!ana|runner|usuario|user|tu-usuario)[a-z][a-z0-9._-]{2,}/")),
]
ARCHIVOS_SECRETOS = (".env", ".env.local", "id_rsa", "id_ed25519", ".npmrc", ".pypirc", "credentials.json")
MAX_REVISAR = 2_000_000
URL = re.compile(r"https?://([A-Za-z0-9.-]+\.[A-Za-z]{2,})")
COMANDOS = re.compile(r"\bsubprocess\b|\bos\.system\(|\bos\.popen\(|Command::new\(|child_process")


def _archivos(carpeta):
    """Lo que git subiría: lo que no ignora .gitignore (la lista blanca de la app)."""
    if not os.path.isdir(os.path.join(carpeta, ".git")):
        _git(carpeta, "init", "-q", "-b", "main")
    salida = _git(carpeta, "ls-files", "--cached", "--others", "--exclude-standard", "-z")
    return sorted(x for x in salida.split("\0") if x)


def revisar_subida(carpeta):
    archivos = _archivos(carpeta)
    de_piezas = proyectos._de_piezas(carpeta)
    secretos, personales, dominios, comandos = [], [], set(), []
    for rel in archivos:
        nombre = os.path.basename(rel)
        if nombre in ARCHIVOS_SECRETOS or nombre.startswith(".env"):
            secretos.append({"archivo": rel, "linea": 0, "tipo": "archivo de secretos"})
            continue
        ruta = os.path.join(carpeta, rel)
        try:
            if os.path.getsize(ruta) > MAX_REVISAR:
                continue
            with open(ruta, encoding="utf-8") as f:
                texto = f.read()
        except (OSError, UnicodeDecodeError):
            continue
        for n, linea in enumerate(texto.splitlines(), 1):
            for tipo, patron in SECRETOS:
                if patron.search(linea):
                    secretos.append({"archivo": rel, "linea": n, "tipo": tipo})
            for tipo, patron in PERSONALES:
                m = patron.search(linea)
                if m:
                    personales.append({"archivo": rel, "linea": n, "tipo": tipo, "muestra": m.group(0)[:60]})
        if rel in de_piezas or rel.startswith(("pruebas/", "docs/", ".github/", "herramientas/")) or rel.endswith((".md", ".json", ".lock")):
            continue  # qué hace la app: solo su propio código
        dominios.update(h.lower() for h in URL.findall(texto) if not h.lower().endswith(("example.com", "github.com", "githubusercontent.com", "w3.org")))
        if COMANDOS.search(texto):
            comandos.append(rel)
    return {"archivos": archivos, "secretos": secretos[:50], "personales": personales[:50], "dominios": sorted(dominios)[:30],
            "comandos": comandos[:30]}


def preparar(d):
    p = proyectos._leer(d.get("id"))
    if not p.get("carpeta") or not os.path.isdir(p["carpeta"]):
        raise ValueError("Primero crea la app.")
    return dict(revisar_subida(p["carpeta"]), ok=True)


def subir(d):
    p = proyectos._leer(d.get("id"))
    if not p.get("carpeta") or not os.path.isdir(p["carpeta"]):
        raise ValueError("Primero crea la app.")
    dueno, visibilidad = d.get("dueno"), d.get("visibilidad")
    if not isinstance(dueno, str) or not DUENO.match(dueno) or visibilidad not in ("publico", "privado"):
        raise ValueError("Elige dónde y cómo publicarla.")
    info = revisar({"id": p["id"]})
    if not info.get("sesion"):
        return {"ok": False, "codigo": "gh", "error": "Para publicar necesitas GitHub CLI (gh) con tu sesión iniciada."}
    if dueno not in info["duenos"]:
        raise ValueError("No puedes crear repos ahí.")
    carpeta, repo = p["carpeta"], f"{dueno}/{p['id']}"
    # 0. Lo que se sube, revisado otra vez (la persona ya lo vio en «preparar»): un secreto bloquea; datos personales, solo si
    #    la persona confirmó que son de ejemplo.
    revision = revisar_subida(carpeta)
    if revision["secretos"]:
        return {"ok": False, "codigo": "secretos", "error": "Hay secretos en los archivos de tu app. Sácalos antes de publicar.",
                "revision": revision}
    if revision["personales"] and d.get("datos_ok") != "si":
        return {"ok": False, "codigo": "personales", "error": "Confirma que los datos personales que encontré son de ejemplo.",
                "revision": revision}
    # 1. El repo va en app.json y en todo lo que se genera de él (README, instaladores, página, workflows).
    ruta_app = os.path.join(carpeta, "app.json")
    app = nucleo.leer_json(ruta_app, {}, maximo=1_000_000)
    if app.get("repo") != repo:
        app["repo"] = repo
        nucleo.escribir_json(ruta_app, app)
        r = subprocess.run([sys.executable, proyectos._pieza_py(), "generar", carpeta], capture_output=True, text=True,
                           timeout=300, env=proyectos._entorno())
        if r.returncode != 0:
            return {"ok": False, "error": (r.stderr or r.stdout).strip()[-400:]}
    # 2. Privacidad antes de subir nada.
    revision = os.path.join(carpeta, "herramientas", "revisar_privacidad.sh")
    if os.path.isfile(revision):
        r = subprocess.run(["bash", revision, "--generico"], cwd=carpeta, capture_output=True, text=True, timeout=120,
                           env=proyectos._entorno())
        if r.returncode != 0:
            return {"ok": False, "codigo": "privacidad", "error": (r.stdout + r.stderr).strip()[-800:]}
    # 3. El primer commit, con el autor noreply de la persona.
    usuario = info["usuario"]
    _, uid, _ = _gh("api", "user", "--jq", ".id")
    correo = f"{uid}+{usuario}@users.noreply.github.com" if uid.isdigit() else f"{usuario}@users.noreply.github.com"
    if not os.path.isdir(os.path.join(carpeta, ".git")):
        _git(carpeta, "init", "-b", "main")
    _git(carpeta, "add", "-A")
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=carpeta).returncode != 0:
        _git(carpeta, "-c", f"user.name={usuario}", "-c", f"user.email={correo}", "commit", "-q", "-m",
             "Primera versión, hecha con Pieza")
    # 4. Crear y subir (con la cuenta de la persona). La descripción va por un archivo, nunca como argumento.
    ok, _, err = _gh("repo", "create", repo, "--public" if visibilidad == "publico" else "--private", "--source", ".",
                     "--remote", "origin", "--push", cwd=carpeta, timeout=300)
    if not ok:
        return {"ok": False, "error": err[-400:] or "GitHub no aceptó el repo."}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump({"description": p.get("frase", "")[:300], "homepage": f"https://{dueno.lower()}.github.io/{p['id']}/"}, f)
    try:
        _gh("api", "-X", "PATCH", f"repos/{repo}", "--input", f.name)
    finally:
        os.unlink(f.name)
    if visibilidad == "publico":
        _gh("api", "-X", "POST", f"repos/{repo}/pages", "-f", "build_type=workflow")
        if d.get("explorador") == "si":
            _gh("repo", "edit", repo, "--add-topic", TOPIC)
    pagina = f"https://{dueno.lower()}.github.io/{p['id']}/" if visibilidad == "publico" else ""
    p.update({"repo": repo, "publicado": visibilidad, "explorador": visibilidad == "publico" and d.get("explorador") == "si",
              "pagina": pagina})
    return {"ok": True, "proyecto": proyectos._guardar(p), "url": f"https://github.com/{repo}"}


if __name__ == "__main__":
    nucleo.script({"explorar": explorar, "revisar": revisar, "subir": subir, "instalar": instalar, "conectar": conectar,
                   "preparar": preparar}, __doc__)
