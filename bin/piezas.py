#!/usr/bin/env python3
"""piezas — el catálogo de piezas y la ficha de una app nueva. Solo biblioteca estándar.

  piezas.py lista <salida.json>
  piezas.py ficha <entrada.json {"plataformas": [...], "piezas": [...]}> <salida.json>

`lista` lee datos/catalogo.json (lo arma herramientas/catalogo_de_pieza.py desde un checkout de Pieza) y devuelve las piezas.
`ficha` suma a las piezas elegidas las de siempre y las que estas requieren, solo las que sirven en esas plataformas. Devuelve
pantallas, permisos, red y lo que le toca a la persona. No gasta tokens: no usa la IA.
"""
import os

import nucleo

PLATAFORMAS = ("mac", "windows", "linux", "ios", "android", "web")
# La vista previa web no tiene host: le sirven las piezas que corren en escritorio y en celular (las de interfaz).
WEB = {"mac", "ios"}
# Cada plataforma trae su host. Android espera a «host-movil» (planeada).
HOSTS = {"mac": "host-tauri", "windows": "host-tauri", "linux": "host-tauri", "ios": "host-ios", "android": "host-movil"}
# Tokens por byte de código: un estimado para decir cuánto se ahorra con una pieza ya hecha (~4 bytes por token).
BYTES_POR_TOKEN = 4


def catalogo():
    ruta = os.path.join(nucleo.recursos(), "datos", "catalogo.json")
    datos = nucleo.leer_json(ruta, {}, maximo=2_000_000)
    piezas = datos.get("piezas") if isinstance(datos, dict) else None
    if not isinstance(piezas, list):
        raise ValueError("No encontré el catálogo de piezas.")
    return {p["id"]: p for p in piezas if isinstance(p, dict) and isinstance(p.get("id"), str)}


def _plataformas(d):
    lista = d.get("plataformas")
    if not isinstance(lista, list) or not lista:
        raise ValueError("Elige al menos un sistema.")
    fuera = [p for p in lista if p not in PLATAFORMAS]
    if fuera:
        raise ValueError("Sistema desconocido: " + ", ".join(map(str, fuera)))
    return list(dict.fromkeys(lista))


def _sirve(pieza, plataformas):
    propias = set(pieza.get("plataformas") or [])
    if "web" in plataformas and WEB <= propias:
        return True
    return any(p in propias for p in plataformas if p != "web")


def lista(_d):
    return {"ok": True, "piezas": list(catalogo().values())}


def ficha(d):
    todas = catalogo()
    plataformas = _plataformas(d)
    pedidas = d.get("piezas") if isinstance(d.get("piezas"), list) else []
    desconocidas = [p for p in pedidas if p not in todas]
    if desconocidas:
        raise ValueError("Pieza desconocida: " + ", ".join(map(str, desconocidas)))
    elegidas = list(pedidas)
    elegidas += [p["id"] for p in todas.values() if p["recomendar"]["siempre"] and _sirve(p, plataformas)]
    elegidas += [HOSTS[p] for p in plataformas if p in HOSTS and HOSTS[p] in todas]
    # Lo que requieren, hasta el fondo.
    i = 0
    while i < len(elegidas):
        for r in todas[elegidas[i]].get("requiere") or []:
            if r in todas and r not in elegidas:
                elegidas.append(r)
        i += 1
    ids = [p for p in dict.fromkeys(elegidas) if _sirve(todas[p], plataformas)]
    piezas = [todas[p] for p in ids]
    hechas = [p for p in piezas if p.get("estado") == "lista"]
    por_hacer = [p["id"] for p in piezas if p.get("estado") != "lista"]
    permisos = {}
    for p in piezas:
        for plat, filas in (p.get("permisos") or {}).items():
            if plat in plataformas:
                for f in filas:
                    if f not in permisos.setdefault(plat, []):
                        permisos[plat].append(f)
    red = sorted({dominio for p in piezas for dominio in (p.get("red") or [])})
    tareas = list(dict.fromkeys(t for p in piezas for t in (p.get("tareas_persona") or [])))
    pantallas = [dict(f, pieza=p["id"]) for p in piezas for f in (p.get("pantallas") or [])]
    return {
        "ok": True,
        "plataformas": plataformas,
        "piezas": ids,
        "hechas": len(hechas),
        "por_hacer": por_hacer,
        "tokens_ahorrados": sum(p.get("bytes", 0) for p in hechas) // BYTES_POR_TOKEN,
        "pantallas": pantallas,
        "permisos": permisos,
        "red": red,
        "tareas": tareas,
    }


if __name__ == "__main__":
    nucleo.script({"lista": lista, "ficha": ficha}, __doc__)
