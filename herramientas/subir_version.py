#!/usr/bin/env python3
"""subir_version — sube la versión de Pieza en todos los lugares que deben coincidir. Solo biblioteca estándar.

  python3 herramientas/subir_version.py [X.Y.Z] [--nota "Línea para el CHANGELOG · *English line*"]

Sin X.Y.Z sube el último número (0.6.2 → 0.6.3). Cambia app.json, escritorio/tauri.conf.json, escritorio/Cargo.toml, el paquete
«pieza» de escritorio/Cargo.lock y el respaldo de herramientas/empaquetar.sh. En el CHANGELOG, la nota (si hay) entra en «Sin
publicar» y todo lo de «Sin publicar» pasa a «## X.Y.Z». publicar.yml publica la versión cuando app.json cambia en main.
"""
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "estas líneas pasan a «## X.Y.Z». -->\n"


def leer(rel):
    with open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def escribir(rel, texto):
    with open(os.path.join(RAIZ, rel), "w", encoding="utf-8") as f:
        f.write(texto)


def cambiar(rel, patron, nuevo, veces=1):
    texto = leer(rel)
    texto2, n = re.subn(patron, nuevo, texto, count=veces, flags=re.M)
    if n != veces:
        raise SystemExit(f"No encontré la versión en {rel}.")
    escribir(rel, texto2)


def main(args):
    nota = ""
    if "--nota" in args:
        i = args.index("--nota")
        nota = args[i + 1].strip() if i + 1 < len(args) else ""
        del args[i:i + 2]
    actual = json.loads(leer("app.json"))["version"]
    if args:
        nueva = args[0]
    else:
        x, y, z = (int(n) for n in actual.split("."))
        nueva = f"{x}.{y}.{z + 1}"
    if not re.fullmatch(r"\d+\.\d+\.\d+", nueva):
        raise SystemExit("La versión es X.Y.Z.")
    v = re.escape(actual)
    cambiar("app.json", rf'^(\s*"version":\s*"){v}(")', rf"\g<1>{nueva}\g<2>")
    cambiar("escritorio/tauri.conf.json", rf'^(\s*"version":\s*"){v}(")', rf"\g<1>{nueva}\g<2>")
    cambiar("escritorio/Cargo.toml", rf'^(version = "){v}(")', rf"\g<1>{nueva}\g<2>")
    cambiar("escritorio/Cargo.lock", rf'^(name = "pieza"\nversion = "){v}(")', rf"\g<1>{nueva}\g<2>")
    if os.path.exists(os.path.join(RAIZ, "herramientas/empaquetar.sh")):
        cambiar("herramientas/empaquetar.sh", r"(\|\| echo )\d+\.\d+\.\d+\)", rf"\g<1>{nueva})")
    cl = leer("CHANGELOG.md")
    if MARCA not in cl:
        raise SystemExit("No encontré «Sin publicar» en el CHANGELOG.")
    cl = cl.replace(MARCA, MARCA + (f"- {nota}\n" if nota else ""), 1)
    cl = cl.replace(MARCA, MARCA + f"\n## {nueva}\n", 1)
    escribir("CHANGELOG.md", cl)
    print(f"{actual} → {nueva}")


if __name__ == "__main__":
    main(sys.argv[1:])
