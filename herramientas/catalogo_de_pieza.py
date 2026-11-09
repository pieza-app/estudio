#!/usr/bin/env python3
"""catalogo_de_pieza — arma datos/catalogo.json desde un checkout de Pieza. Solo biblioteca estándar.

  python3 herramientas/catalogo_de_pieza.py <carpeta-de-pieza>

Escribe datos/catalogo.json (va dentro de la app) y ui/demo-catalogo.json (la misma copia, para la vista previa). También
copia a datos/pieza/ lo que necesita «Crear la app»: herramientas/pieza.py (con plantillas.py e icono.py), piezas/, la plantilla
de «Pieza al día» y la guía para la IA (skills/lanzar-proyecto-open-source/SKILL.md). datos/pieza/VERSION dice de qué commit.

Lee piezas/*/pieza.json y guarda solo lo que la app muestra: id, nombre, versión, estado, categoría, descripción, cuándo
recomendarla, qué requiere, plataformas, pantallas, permisos, red, lo que le toca a la persona y el tamaño de sus archivos (para
estimar los tokens que ahorra). Las piezas retiradas no entran.
"""
import json
import os
import shutil
import subprocess
import sys

CAMPOS = ("id", "nombre", "version", "estado", "categoria", "descripcion", "en", "requiere", "plataformas", "pantallas", "permisos",
          "red", "tareas_persona")


def tamano(carpeta):
    """Bytes de los archivos de la pieza (sin pieza.json ni el ícono)."""
    total = 0
    for base, _, archivos in os.walk(carpeta):
        for a in archivos:
            if a not in ("pieza.json", "icono.svg", "README.md"):
                total += os.path.getsize(os.path.join(base, a))
    return total


def armar(pieza):
    raiz = os.path.join(pieza, "piezas")
    piezas = []
    for id_ in sorted(os.listdir(raiz)):
        ruta = os.path.join(raiz, id_, "pieza.json")
        if not os.path.isfile(ruta):
            continue
        with open(ruta, encoding="utf-8") as f:
            p = json.load(f)
        if p.get("estado") == "retirada":
            continue
        r = p.get("recomendar") or {}
        fila = {c: p[c] for c in CAMPOS if c in p}
        fila["recomendar"] = {"siempre": bool(r.get("siempre")), "cuando": r.get("cuando", ""), "palabras": r.get("palabras", [])}
        fila["bytes"] = tamano(os.path.join(raiz, id_))
        piezas.append(fila)
    return {"formato": 1, "piezas": piezas}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    datos = armar(sys.argv[1])
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # datos/catalogo.json va dentro de la app; ui/demo-catalogo.json es la misma copia para la vista previa del navegador.
    for destino in (os.path.join(raiz, "datos", "catalogo.json"), os.path.join(raiz, "ui", "demo-catalogo.json")):
        with open(destino, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
            f.write("\n")
    print(f"✓ {len(datos['piezas'])} piezas en datos/catalogo.json y ui/demo-catalogo.json")
    copiar(sys.argv[1], os.path.join(raiz, "datos", "pieza"))


COPIAR = ("herramientas/pieza.py", "herramientas/plantillas.py", "herramientas/icono.py", "plantillas/pieza-al-dia.yml",
          "skills/lanzar-proyecto-open-source/SKILL.md", "LICENSE")


def copiar(pieza, destino):
    """Lo que usa «Crear la app» (bin/proyectos.py), sin cachés ni pruebas de las piezas."""
    shutil.rmtree(destino, ignore_errors=True)
    for rel in COPIAR:
        if os.path.isfile(os.path.join(pieza, rel)):
            os.makedirs(os.path.dirname(os.path.join(destino, rel)), exist_ok=True)
            shutil.copy2(os.path.join(pieza, rel), os.path.join(destino, rel))
    shutil.copytree(os.path.join(pieza, "piezas"), os.path.join(destino, "piezas"),
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "node_modules", "target", ".DS_Store"))
    commit = subprocess.run(["git", "-C", pieza, "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    with open(os.path.join(destino, "VERSION"), "w", encoding="utf-8") as f:
        f.write((commit or "desconocida") + "\n")
    print(f"✓ datos/pieza/ (Pieza {commit or '?'})")


if __name__ == "__main__":
    main()
