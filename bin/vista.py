#!/usr/bin/env python3
"""vista — ver la app creada en el navegador, sin terminal. Solo biblioteca estándar.

  vista.py abrir  <entrada.json {id}> <salida.json>
  vista.py servir <carpeta ui> <puerto>          (lo lanza «abrir»; no se llama a mano)

«abrir» lanza un servidor aparte (sesión propia: sigue vivo cuando el script termina) que sirve solo la carpeta ui/ de la app en
127.0.0.1, en un puerto libre, y abre el navegador ahí. La interfaz corre en modo vista previa (datos ficticios de su demo).
El servidor se apaga solo a los 30 minutos. Nada queda abierto hacia la red: solo 127.0.0.1.
"""
import functools
import http.server
import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser

import nucleo
import proyectos

DURACION = 30 * 60


def _puerto_libre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _esperar(puerto, segundos=5):
    fin = time.time() + segundos
    while time.time() < fin:
        try:
            with socket.create_connection(("127.0.0.1", puerto), timeout=0.3):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def abrir(d):
    p = proyectos._leer(d.get("id"))
    ui = os.path.join(p.get("carpeta") or "", "ui")
    if not os.path.isfile(os.path.join(ui, "index.html")):
        raise ValueError("Primero crea la app.")
    puerto = _puerto_libre()
    subprocess.Popen([sys.executable, os.path.abspath(__file__), "servir", ui, str(puerto)], start_new_session=True,
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=proyectos._entorno())
    if not _esperar(puerto):
        return {"ok": False, "error": "No pude abrir la vista previa."}
    url = f"http://127.0.0.1:{puerto}/"
    webbrowser.open(url)
    return {"ok": True, "url": url}


class _Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def servir(ui, puerto):
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", int(puerto)), functools.partial(_Silencioso, directory=ui))
    threading.Timer(DURACION, servidor.shutdown).start()
    servidor.serve_forever()


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "servir":
        servir(sys.argv[2], sys.argv[3])
    else:
        nucleo.script({"abrir": abrir}, __doc__)
