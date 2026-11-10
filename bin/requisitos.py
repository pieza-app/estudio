#!/usr/bin/env python3
"""requisitos — lo que el computador necesita para construir y publicar apps, y cómo instalar lo que falta. Solo biblioteca estándar.

  requisitos.py lista    <salida.json>
  requisitos.py instalar <entrada.json {id}> <salida.json>

- `lista`: cada herramienta con para qué sirve, si está (y su versión) y si Pieza la puede instalar sola en este sistema.
- `instalar`: con el instalador del sistema (Homebrew en Mac, winget en Windows). En Linux o sin instalador, `guia`: dónde
  bajarla. Nunca baja un binario ni corre un script de internet por su cuenta.
"""
import os
import re
import shutil
import subprocess
import sys

import ia  # noqa: F401 — prepara el PATH (Homebrew, cargo, npm…) igual que para la IA
import nucleo
import trabajos

# id: (nombre, para qué, si hace falta, orden de versión, Homebrew, winget, guía)
HERRAMIENTAS = {
    "git": ("Git", "Guardar las versiones de tu app y publicarla", True, ["git", "--version"], "git", "Git.Git",
            "https://git-scm.com/downloads"),
    "node": ("Node.js", "Probar la interfaz de tu app", True, ["node", "--version"], "node", "OpenJS.NodeJS.LTS", "https://nodejs.org/"),
    "rust": ("Rust", "Armar y probar la app de escritorio en tu computador (sin Rust, GitHub la arma igual al publicar)", False,
             ["cargo", "--version"], "rust", "Rustlang.Rustup", "https://rustup.rs/"),
    "gh": ("GitHub CLI", "Publicar tu app con tu cuenta de GitHub", False, ["gh", "--version"], "gh", "GitHub.cli", "https://cli.github.com/"),
}
EJECUTABLE = {"git": "git", "node": "node", "rust": "cargo", "gh": "gh"}


def _instalador():
    if sys.platform == "darwin" and shutil.which("brew"):
        return "brew"
    if sys.platform.startswith("win") and shutil.which("winget"):
        return "winget"
    return ""


def _version(orden):
    try:
        r = subprocess.run(orden, capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    m = re.search(r"\d+\.\d+(?:\.\d+)?", r.stdout or r.stderr or "")
    return m.group(0) if m else ""


def lista(_d=None):
    instalador = _instalador()
    salida = []
    for hid, (nombre, para, necesaria, orden, _, _, guia) in HERRAMIENTAS.items():
        hay = bool(shutil.which(EJECUTABLE[hid]))
        salida.append({"id": hid, "nombre": nombre, "para": para, "necesaria": necesaria, "hay": hay,
                       "version": _version(orden) if hay else "", "puede_instalar": bool(instalador), "guia": guia})
    return {"ok": True, "herramientas": salida, "instalador": instalador}


def instalar(d):
    hid = d.get("id")
    if hid not in HERRAMIENTAS:
        raise ValueError("Herramienta desconocida.")
    _, _, _, _, brew, winget, guia = HERRAMIENTAS[hid]
    instalador = _instalador()
    if shutil.which(EJECUTABLE[hid]):
        return dict(lista(), instalada=hid)
    if not instalador:
        return dict(lista(), ok=False, guia=guia, error="Pieza no puede instalarla sola en este computador: bájala desde su página.")
    orden = (["brew", "install", brew] if instalador == "brew"
             else ["winget", "install", "--id", winget, "-e", "--accept-source-agreements", "--accept-package-agreements"])
    trabajos.emitir({"t": "fase", "fase": "instalar", "id": hid})
    try:
        r = subprocess.run(orden, capture_output=True, text=True, timeout=1500)
    except subprocess.TimeoutExpired:
        return dict(lista(), ok=False, guia=guia, error="La instalación tardó demasiado.")
    if hid == "rust" and instalador == "winget" and shutil.which("rustup"):
        subprocess.run(["rustup", "default", "stable"], capture_output=True, text=True, timeout=900)
    if r.returncode != 0 and not shutil.which(EJECUTABLE[hid]):
        return dict(lista(), ok=False, guia=guia, error=((r.stderr or r.stdout) or "No se pudo instalar.").strip()[-400:])
    return dict(lista(), instalada=hid)


if __name__ == "__main__":
    nucleo.script({"lista": lista, "instalar": instalar}, __doc__)
