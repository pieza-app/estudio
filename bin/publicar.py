#!/usr/bin/env python3
"""publicar — subir una app a GitHub y el explorador de apps hechas con Pieza. Solo biblioteca estándar.

  publicar.py explorar <salida.json>
  publicar.py revisar  <entrada.json {id}> <salida.json>
  publicar.py subir    <entrada.json {id, dueno, visibilidad, explorador}> <salida.json>

- `explorar`: las apps con el topic «hecho-con-pieza» que lista la página de Pieza (solo pieza-app.github.io, pieza «red»).
- `revisar`: si `gh` está instalado y con sesión, el usuario y sus organizaciones (dónde puede crear el repo).
- `subir`: con la cuenta de la persona (su `gh`), nunca con una nuestra. Pone el repo en app.json y regenera lo que depende de él,
  revisa la privacidad, hace el primer commit, crea el repo y sube. Con `explorador` (y repo público) suma el topic
  «hecho-con-pieza»: así aparece en el explorador sin pedirle permiso a nadie. Activa GitHub Pages para la página de la app.

Lo que escribe la persona (la frase) nunca va como argumento: la descripción del repo va por un archivo de entrada a `gh api`.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

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
    p.update({"repo": repo, "publicado": visibilidad, "explorador": visibilidad == "publico" and d.get("explorador") == "si"})
    return {"ok": True, "proyecto": proyectos._guardar(p), "url": f"https://github.com/{repo}"}


if __name__ == "__main__":
    nucleo.script({"explorar": explorar, "revisar": revisar, "subir": subir}, __doc__)
