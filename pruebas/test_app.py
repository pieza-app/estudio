"""Pruebas de lo propio de Pieza en Python. Cada una corre con una carpeta temporal: nunca toca datos reales.

Una clase por script de bin/, con datos ficticios.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def correr(script, *args, entrada=None):
    """Corre bin/<script> como lo corre el host: lo de la persona en un archivo de entrada y el último argumento es la salida."""
    with tempfile.TemporaryDirectory() as tmp:
        archivos = []
        if entrada is not None:
            ruta = os.path.join(tmp, "entrada.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(entrada, f)
            archivos.append(ruta)
        salida = os.path.join(tmp, "salida.json")
        entorno = {**os.environ, "HOME": tmp, "PIEZA_DATOS": os.path.join(tmp, "datos")}
        r = subprocess.run([sys.executable, os.path.join(RAIZ, "bin", script), *args, *archivos, salida],
                           capture_output=True, text=True, timeout=60, env=entorno)
        if r.returncode != 0:
            raise AssertionError(r.stderr)
        with open(salida, encoding="utf-8") as f:
            return json.load(f)


class Piezas(unittest.TestCase):
    def test_lista_trae_el_catalogo(self):
        r = correr("piezas.py", "lista")
        self.assertTrue(r["ok"])
        ids = {p["id"] for p in r["piezas"]}
        self.assertTrue({"ia", "host-tauri", "tema"} <= ids)
        self.assertNotIn("host-mac", ids, "las retiradas no entran")

    def test_ficha_de_escritorio_suma_las_de_siempre_el_host_y_lo_que_requieren(self):
        r = correr("piezas.py", "ficha", entrada={"plataformas": ["mac", "linux"], "piezas": ["ia"]})
        self.assertTrue(r["ok"])
        for p in ("ia", "nucleo", "host-tauri", "tema", "bienvenida", "empaquetado"):
            self.assertIn(p, r["piezas"])
        self.assertNotIn("host-ios", r["piezas"])
        self.assertGreater(r["hechas"], 5)
        self.assertGreater(r["tokens_ahorrados"], 0)
        self.assertEqual(set(r["permisos"]) - {"mac", "linux"}, set())

    def test_ficha_de_celular_usa_su_host_y_avisa_lo_que_falta(self):
        r = correr("piezas.py", "ficha", entrada={"plataformas": ["ios", "android"], "piezas": []})
        self.assertIn("host-ios", r["piezas"])
        self.assertIn("host-movil", r["por_hacer"])
        self.assertNotIn("host-tauri", r["piezas"])

    def test_ficha_web_sin_host(self):
        r = correr("piezas.py", "ficha", entrada={"plataformas": ["web"], "piezas": []})
        self.assertFalse([p for p in r["piezas"] if p.startswith("host-") and p != "host-ui"])
        self.assertIn("host-ui", r["piezas"])

    def test_rechaza_lo_desconocido(self):
        self.assertFalse(correr("piezas.py", "ficha", entrada={"plataformas": ["amiga"], "piezas": []})["ok"])
        self.assertFalse(correr("piezas.py", "ficha", entrada={"plataformas": ["mac"], "piezas": ["nada"]})["ok"])
        self.assertFalse(correr("piezas.py", "ficha", entrada={"plataformas": [], "piezas": []})["ok"])

    def test_la_demo_trae_el_mismo_catalogo(self):
        with open(os.path.join(RAIZ, "datos", "catalogo.json"), encoding="utf-8") as a, \
                open(os.path.join(RAIZ, "ui", "demo-catalogo.json"), encoding="utf-8") as b:
            self.assertEqual(json.load(a), json.load(b), "corre herramientas/catalogo_de_pieza.py")

    def test_las_acciones_mandan_los_datos_por_archivo(self):
        # Regla de oro: lo que elige la persona nunca va como argumento del proceso.
        with open(os.path.join(RAIZ, "acciones.json"), encoding="utf-8") as f:
            a = json.load(f)["acciones"]
        self.assertEqual(a["piezasFicha"]["entrada"], "archivo")
        for x in a.values():
            self.assertFalse(any(arg.startswith("$") for arg in x["args"]))


if __name__ == "__main__":
    unittest.main()
