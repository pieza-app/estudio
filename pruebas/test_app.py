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


class Proyectos(unittest.TestCase):
    """bin/proyectos.py en el mismo proceso, con una IA falsa (sin red ni CLI) y una carpeta temporal."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PIEZA_DATOS"] = os.path.join(self.tmp.name, "datos")
        os.environ["PIEZA_PROYECTOS"] = os.path.join(self.tmp.name, "Pieza")
        sys.path.insert(0, os.path.join(RAIZ, "bin"))
        import proyectos
        self.p = proyectos
        self.respuestas = []
        self.pedidos = []

        def falsa(pedido, **opciones):
            self.pedidos.append((pedido, opciones))
            return self.respuestas.pop(0), None
        self._original = proyectos.ia.preguntar
        proyectos.ia.preguntar = falsa

    def tearDown(self):
        self.p.ia.preguntar = self._original
        os.environ.pop("PIEZA_PROYECTOS", None)
        self.tmp.cleanup()

    def plan(self):
        self.respuestas.append('```json\n{"pasos": [{"titulo": "Recetas", "que": "Guardar recetas.", "archivos": ["bin/recetas.py",'
                               ' "../fuera"], "tokens": 900}]}\n```')
        return self.p.plan({"nombre": "Recetas", "frase": "Ordena las recetas de Ana Pérez.", "plataformas": ["mac"],
                            "piezas": ["ia"]})

    def test_plan_valida_y_guarda(self):
        r = self.plan()
        self.assertTrue(r["ok"], r)
        paso = r["proyecto"]["pasos"][0]
        self.assertEqual(paso["archivos"], ["bin/recetas.py"])  # la ruta que se sale no entra
        self.assertEqual(paso["estado"], "pendiente")
        self.assertGreater(r["proyecto"]["gastado"], 0)
        self.assertIn("0 tokens", self.pedidos[0][0])  # el pedido dice qué ya está hecho

    def test_plan_malo(self):
        self.respuestas.append("No sé.")
        r = self.p.plan({"nombre": "Recetas", "frase": "Ordena recetas.", "plataformas": ["mac"], "piezas": []})
        self.assertFalse(r["ok"])
        self.assertEqual(r["codigo"], "plan")

    def test_rutas(self):
        for mala in ("/etc/x", "../x", "a/../../x", ".git/config", "C:/x", "a\\b", ""):
            self.assertFalse(self.p._ruta_valida(mala), mala)
        self.assertTrue(self.p._ruta_valida("ui/app.js"))

    def test_crear_y_paso(self):
        self.plan()
        r = self.p.crear({"id": "recetas"})
        self.assertTrue(r["ok"], r)
        carpeta = r["proyecto"]["carpeta"]
        self.assertTrue(os.path.isfile(os.path.join(carpeta, "app.json")))
        # Un archivo de pieza nunca se escribe; uno propio sí.
        with self.assertRaises(ValueError):
            self.p.validar_archivos({"archivos": [{"ruta": "bin/nucleo.py", "contenido": "x"}]}, carpeta)
        with self.assertRaises(ValueError):  # app.json: sumar acciones sí; cambiar lo que identifica a la app, no
            self.p.validar_archivos({"archivos": [{"ruta": "app.json", "contenido": '{"id": "otra"}'}]}, carpeta)
        with open(os.path.join(carpeta, "app.json"), encoding="utf-8") as f:
            app = json.load(f)
        app["acciones"]["recetasListar"] = {"script": "recetas.py", "args": ["lista"], "entrada": None, "datos": {},
                                            "responde": "recetasListas", "limite": 30}
        _, _, borrar = self.p.validar_archivos({"archivos": [{"ruta": "app.json", "contenido": json.dumps(app)}],
                                                 "borrar": ["bin/ejemplo.py"]}, carpeta)
        self.assertEqual(borrar, ["bin/ejemplo.py"])
        with self.assertRaises(ValueError):
            self.p.validar_archivos({"archivos": [{"ruta": "x.txt", "contenido": "x"}], "borrar": ["bin/nucleo.py"]}, carpeta)
        pruebas = []
        self.p.probar = lambda c: (pruebas.append(c) or (len(pruebas) > 1, "falló algo"))
        respuesta = json.dumps({"resumen": "Listo.", "archivos": [{"ruta": "bin/recetas.py", "contenido": "print('hola')\n"}]})
        self.respuestas += [respuesta, respuesta]
        r = self.p.paso({"id": "recetas", "n": 0})
        self.assertTrue(r["ok"], r)
        paso = r["proyecto"]["pasos"][0]
        self.assertEqual((paso["estado"], paso["intentos"]), ("listo", 2))  # el segundo intento recibió el error
        self.assertIn("falló algo", self.pedidos[-1][0])
        self.assertEqual(self.pedidos[-1][1]["leer"], carpeta)  # la IA solo lee la carpeta
        with open(os.path.join(carpeta, "bin", "recetas.py"), encoding="utf-8") as f:
            self.assertEqual(f.read(), "print('hola')\n")


class Publicar(unittest.TestCase):
    """bin/publicar.py: lo que llega del explorador se valida; sin gh con sesión no se publica nada."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PIEZA_DATOS"] = os.path.join(self.tmp.name, "datos")
        sys.path.insert(0, os.path.join(RAIZ, "bin"))
        import publicar
        self.m = publicar

    def tearDown(self):
        self.tmp.cleanup()

    def test_explorador_valida(self):
        apps = self.m.limpiar_apps({"proyectos": [
            {"nombre": "Recetas", "repo": "ana-perez/recetas", "pagina": "https://ana-perez.github.io/recetas/", "revision": {"estado": "revisado"}},
            {"nombre": "Mala", "repo": "../../etc", "pagina": "javascript:alert(1)"},
            {"nombre": "Sin página", "repo": "matias-soto/gastos", "pagina": "http://x"}]})
        self.assertEqual([a["repo"] for a in apps], ["ana-perez/recetas", "matias-soto/gastos"])
        self.assertTrue(apps[0]["revisada"])
        self.assertEqual(apps[1]["pagina"], "")
        self.assertEqual(self.m.limpiar_apps("no"), [])

    def test_sin_sesion_no_publica(self):
        import proyectos
        carpeta = os.path.join(self.tmp.name, "Recetas")
        os.makedirs(carpeta)
        proyectos._guardar({"id": "recetas", "nombre": "Recetas", "frase": "x", "estado": "pasos", "pasos": [], "carpeta": carpeta})
        self.m.revisar = lambda d: {"ok": True, "gh": False, "sesion": False}
        r = self.m.subir({"id": "recetas", "dueno": "ana-perez", "visibilidad": "publico", "explorador": "si"})
        self.assertEqual(r["codigo"], "gh")
        with self.assertRaises(ValueError):
            self.m.subir({"id": "recetas", "dueno": "ana perez; rm", "visibilidad": "publico"})
