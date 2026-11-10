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
        self._puede = proyectos.ia.puede_escribir
        self.respuestas = []
        self.pedidos = []

        def falsa(pedido, **opciones):
            self.pedidos.append((pedido, opciones))
            return self.respuestas.pop(0), None
        self._original = (proyectos.ia.preguntar, proyectos.ia.preguntar_vivo)
        proyectos.ia.preguntar = falsa
        proyectos.ia.preguntar_vivo = falsa

    def tearDown(self):
        self.p.ia.preguntar, self.p.ia.preguntar_vivo = self._original
        self.p.ia.puede_escribir = self._puede
        os.environ.pop("PIEZA_PROYECTOS", None)
        self.tmp.cleanup()

    def plan(self):
        self.respuestas.append('```json\n{"pasos": [{"titulo": "Recetas", "que": "Guardar recetas.", "archivos": ["bin/recetas.py",'
                               ' "../fuera"], "tokens": 900}]}\n```')
        return self.p.plan({"nombre": "Recetas", "frase": "Ordena las recetas de Ana Pérez.", "plataformas": ["mac"],
                            "piezas": ["ia"]})

    def test_la_idea_completa_va_al_plan_y_a_cada_paso(self):
        self.respuestas.append('{"pasos": [{"titulo": "Recetas", "que": "Guardar recetas.", "archivos": [], "tokens": 900}]}')
        r = self.p.plan({"nombre": "Recetas", "frase": "Ordena las recetas de Ana Pérez.", "plataformas": ["mac"], "piezas": [],
                         "detalle": "Cada receta tiene porciones.\nLa lista de compras suma por ingrediente."})
        self.assertTrue(r["ok"], r)
        self.assertIn("La lista de compras suma por ingrediente.", self.pedidos[-1][0])
        carpeta = self.p.crear({"id": "recetas"})["proyecto"]["carpeta"]
        self.assertTrue(carpeta)
        pedido = self.p._prompt_editar(self.p._leer("recetas"), 0)
        self.assertIn("# La idea completa", pedido)
        self.assertIn("Cada receta tiene porciones.", pedido)
        sin = self.p._prompt_paso({**self.p._leer("recetas"), "detalle": ""}, 0)
        self.assertNotIn("# La idea completa", sin)

    def test_revisar_a_ciegas(self):
        """Tres sesiones nuevas, cada una con su enfoque, sin la conversación del plan; lo aceptado vuelve al plan como acuerdos."""
        self.plan()
        for _ in range(3):
            self.respuestas.append('{"hallazgos": [{"gravedad": "media", "problema": "Falta X.", "propuesta": "Agregar X."},'
                                   ' {"gravedad": "alta", "problema": "Se pierden datos.", "propuesta": "Guardar con respaldo."},'
                                   ' {"gravedad": "rara", "problema": "No vale.", "propuesta": "No vale."}]}')
        antes = len(self.pedidos)
        r = self.p.revisar({"id": "recetas"})
        self.assertTrue(r["ok"], r)
        hs = r["proyecto"]["revision"]["hallazgos"]
        self.assertEqual(len(hs), 6)  # la gravedad desconocida no entra
        self.assertEqual(hs[0]["gravedad"], "alta")
        self.assertEqual(sorted({h["enfoque"] for h in hs}), ["pasos", "riesgos", "uso"])
        pedidos = [x[0] for x in self.pedidos[antes:]]
        self.assertEqual(len(pedidos), 3)
        for x in pedidos:
            self.assertIn("No participaste en este proyecto", x)
            self.assertIn("Ordena las recetas de Ana Pérez.", x)
        self.respuestas.append('{"pasos": [{"titulo": "Recetas", "que": "Guardar recetas.", "archivos": [], "tokens": 900}]}')
        r = self.p.plan({"nombre": "Recetas", "frase": "Ordena las recetas de Ana Pérez.", "plataformas": ["mac"], "piezas": [],
                         "acuerdos": ["Guardar con respaldo.", 7, ""]})
        self.assertEqual(r["proyecto"]["acuerdos"], ["Guardar con respaldo."])
        self.assertIsNone(r["proyecto"]["revision"])
        self.assertIn("# Cambios acordados en la revisión", self.pedidos[-1][0])
        self.assertIn("Guardar con respaldo.", self.pedidos[-1][0])

    def test_plan_reintenta_si_se_pasa_de_pasos(self):
        muchos = {"pasos": [{"titulo": f"Paso {i}", "que": "x", "archivos": [], "tokens": 1} for i in range(20)]}
        self.respuestas.append(json.dumps(muchos))
        self.respuestas.append('{"pasos": [{"titulo": "Recetas", "que": "Guardar recetas.", "archivos": [], "tokens": 900}]}')
        r = self.p.plan({"nombre": "Recetas", "frase": "Ordena las recetas de Ana Pérez.", "plataformas": ["mac"], "piezas": []})
        self.assertTrue(r["ok"], r)
        self.assertIn("trajo 20", self.pedidos[-1][0])

    def test_revisar_sin_plan(self):
        with self.assertRaises(ValueError):
            self.p.revisar({"id": "nada"})

    def test_plan_valida_y_guarda(self):
        r = self.plan()
        self.assertTrue(r["ok"], r)
        paso = r["proyecto"]["pasos"][0]
        self.assertEqual(paso["archivos"], ["bin/recetas.py"])  # la ruta que se sale no entra
        self.assertEqual(paso["estado"], "pendiente")
        self.assertGreater(r["proyecto"]["gastado"], 0)
        self.assertIn("0 tokens", self.pedidos[0][0])  # el pedido dice qué ya está hecho

    def test_plan_malo(self):
        self.respuestas += ["No sé.", "Tampoco."]  # dos intentos
        r = self.p.plan({"nombre": "Recetas", "frase": "Ordena recetas.", "plataformas": ["mac"], "piezas": []})
        self.assertFalse(r["ok"])
        self.assertEqual(r["codigo"], "plan")

    def test_rutas(self):
        for mala in ("/etc/x", "../x", "a/../../x", ".git/config", "C:/x", "a\\b", ""):
            self.assertFalse(self.p._ruta_valida(mala), mala)
        self.assertTrue(self.p._ruta_valida("ui/app.js"))

    def test_paso_editando_la_carpeta(self):
        """Con Claude o Codex la IA edita directo; Pieza devuelve lo que no le toca y corre las pruebas."""
        self.plan()
        carpeta = self.p.crear({"id": "recetas"})["proyecto"]["carpeta"]
        nucleo_antes = open(os.path.join(carpeta, "bin", "nucleo.py"), encoding="utf-8").read()
        self.p.ia.puede_escribir = lambda ia=None: True
        self.p.probar = lambda c: (True, "ok")

        def edita(pedido, **opciones):
            self.pedidos.append((pedido, opciones))
            c = opciones["escribir"]
            open(os.path.join(c, "bin", "recetas.py"), "w").write("print('recetas')\n")
            open(os.path.join(c, "bin", "nucleo.py"), "w").write("# roto\n")  # de una pieza: se devuelve
            open(os.path.join(c, "pruebas", "correr.sh"), "w").write("exit 0\n")  # aflojar las pruebas: se devuelve
            app = json.load(open(os.path.join(c, "app.json")))
            app["id"] = "otra"  # lo que identifica a la app: se devuelve
            app["acciones"]["recetasListar"] = {"script": "recetas.py", "args": ["lista"], "entrada": None, "datos": {},
                                                "responde": "recetasListas", "limite": 30}
            json.dump(app, open(os.path.join(c, "app.json"), "w"))
            return "Hice la lista de recetas.", None
        self.p.ia.preguntar_vivo = edita
        r = self.p.paso({"id": "recetas", "n": 0})
        self.assertTrue(r["ok"], r)
        x = r["proyecto"]["pasos"][0]
        self.assertIn("bin/recetas.py", x["escritos"])
        self.assertIn("bin/nucleo.py", x["cuidados"])
        self.assertIn("app.json:id", x["cuidados"])
        self.assertIn("pruebas/correr.sh", x["cuidados"])
        self.assertEqual(open(os.path.join(carpeta, "bin", "nucleo.py"), encoding="utf-8").read(), nucleo_antes)
        app = json.load(open(os.path.join(carpeta, "app.json")))
        self.assertEqual(app["id"], "recetas")
        self.assertIn("recetasListar", json.load(open(os.path.join(carpeta, "acciones.json")))["acciones"])
        self.assertEqual(self.pedidos[-1][1]["escribir"], carpeta)
        self.assertNotIn('"archivos"', self.pedidos[-1][0])  # sin JSON de archivos: edita directo

    def test_paso_liviano_y_tokens_reales(self):
        """Cada paso recibe el mapa de archivos y lo que hicieron los anteriores, no lee lo que no sirve y cuenta los tokens reales."""
        self.plan()
        carpeta = self.p.crear({"id": "recetas"})["proyecto"]["carpeta"]
        self.p.ia.puede_escribir = lambda ia=None: True
        self.p.probar = lambda c: (True, "ok")

        def edita(pedido, **opciones):
            self.pedidos.append((pedido, opciones))
            c = opciones["escribir"]
            with open(os.path.join(c, "bin", "recetas.py"), "a") as f:
                f.write("print('recetas')\n")
            opciones["al_evento"]({"t": "uso", "entrada": 5000, "cache": 40000, "salida": 800})
            return "Hice la lista de recetas.", None
        self.p.ia.preguntar_vivo = edita
        x = self.p.paso({"id": "recetas", "n": 0})["proyecto"]["pasos"][0]
        self.assertEqual((x["gastado"], x["cache"], x["medido"]), (5800, 40000, True))
        pedido, opciones = self.pedidos[-1]
        self.assertIn("escritorio/", opciones["no_leer"])
        self.assertIn("bin/recetas.py", pedido)  # el mapa
        self.assertIn("bin/nucleo.py", pedido.split("De piezas")[1].split("\n")[0])
        self.assertNotIn("escritorio/", pedido.split("# Los archivos de la app")[1].split("# Este paso")[0])
        proyecto = self.p._leer("recetas")
        proyecto["pasos"].append({"titulo": "Buscar", "que": "Buscar recetas.", "archivos": [], "tokens": 0, "estado": "pendiente"})
        pedido = self.p._prompt_editar(proyecto, 1)
        historia = pedido.split("# Lo que ya hicieron los pasos anteriores")[1].split("#")[0]
        self.assertIn("Hice la lista de recetas.", historia)
        self.assertIn("bin/recetas.py", historia)

    def test_paso_sin_cambios_queda_si_las_pruebas_pasan(self):
        """Si lo del paso ya estaba hecho, la IA no cambia nada: mandan las pruebas, no «no cambiaste ningún archivo»."""
        self.plan()
        self.p.crear({"id": "recetas"})
        self.p.ia.puede_escribir = lambda ia=None: True
        self.p.probar = lambda c: (True, "ok")

        def nada(pedido, **opciones):
            opciones["al_evento"]({"t": "lee", "ruta": os.path.join(opciones["escribir"], "bin", "recetas.py")})
            return "Revisé el paso: ya estaba hecho.", None
        self.p.ia.preguntar_vivo = nada
        r = self.p.paso({"id": "recetas", "n": 0})
        self.assertTrue(r["ok"], r)
        x = r["proyecto"]["pasos"][0]
        self.assertEqual(x["resumen"], "Revisé el paso: ya estaba hecho.")
        self.assertEqual(x["registro"][0], {"t": "lee", "ruta": "bin/recetas.py", "intento": 1})
        self.assertEqual(x["historial"][-1]["causa"], "")

    def test_reintentar_lleva_el_error_y_guarda_cada_intento(self):
        """Un paso que falló: cada intento queda anotado con su causa, y al reintentar la IA recibe el error de la vez anterior."""
        self.plan()
        self.p.crear({"id": "recetas"})
        self.p.ia.puede_escribir = lambda ia=None: True
        self.p.probar = lambda c: (False, "FALLA: test_lista esperaba 3 recetas")
        self.pedidos.clear()

        def edita(pedido, **opciones):
            self.pedidos.append(pedido)
            with open(os.path.join(opciones["escribir"], "bin", "recetas.py"), "a") as f:
                f.write("x = 1\n")
            return "Hice la lista. " + "más detalle " * 100, None
        self.p.ia.preguntar_vivo = edita
        x = self.p.paso({"id": "recetas", "n": 0})["proyecto"]["pasos"][0]
        self.assertEqual((x["estado"], x["causa"]), ("fallo", "pruebas"))
        self.assertEqual([h["intento"] for h in x["historial"]], [1, 2])
        self.assertIn("test_lista", x["historial"][0]["error"])
        self.assertGreater(len(x["resumen"]), 600)  # completo: la interfaz lo muestra al abrir el paso
        self.assertNotIn("El intento anterior no quedó", self.pedidos[0])
        self.assertIn("test_lista", self.pedidos[1])
        self.pedidos.clear()
        self.p.probar = lambda c: (True, "ok")
        x = self.p.paso({"id": "recetas", "n": 0})["proyecto"]["pasos"][0]
        self.assertEqual(x["estado"], "listo")
        self.assertIn("test_lista", self.pedidos[0])  # «Arreglarlo»: el error va desde el primer intento
        self.assertNotIn("causa", x)
        self.assertEqual([h["intento"] for h in x["historial"]], [1, 2, 3])

    def test_cambiado_cuenta_solo_lo_nuevo(self):
        self.assertEqual(self.p._cambiado(b"x" * 10000 + b"fin", b"x" * 10000 + b"nuevo fin"), 6)
        self.assertEqual(self.p._cambiado(b"", b"hola"), 4)
        self.assertEqual(self.p._cambiado(b"hola", b""), 0)

    def test_una_pieza_por_hacer_no_rompe_crear(self):
        """Marcar una pieza que todavía no existe («comentarios») la manda al plan; crear la app sigue funcionando."""
        self.respuestas.append('{"pasos": [{"titulo": "Recetas", "que": "Guardar recetas.", "archivos": [], "tokens": 900}]}')
        r = self.p.plan({"nombre": "Recetas", "frase": "Ordena las recetas de Ana Pérez.", "plataformas": ["mac"],
                         "piezas": ["comentarios"]})
        self.assertTrue(r["ok"], r)
        self.assertIn("todavía no existe como pieza", self.pedidos[-1][0])
        self.assertIn("- comentarios:", self.pedidos[-1][0].split("todavía no existe como pieza")[1])
        r = self.p.crear({"id": "recetas"})
        self.assertTrue(r["ok"], r)
        self.assertNotIn("comentarios", json.load(open(os.path.join(r["proyecto"]["carpeta"], "piezas.json")))["piezas"])

    def test_borrar_una_app(self):
        """Quitar de la lista deja la carpeta; borrar la quita también, pero solo si es la de esa app dentro de la carpeta Pieza."""
        self.plan()
        carpeta = self.p.crear({"id": "recetas"})["proyecto"]["carpeta"]
        p = self.p._leer("recetas")
        p["carpeta"] = os.path.expanduser("~")  # una carpeta que no es de la app: nunca se borra
        self.p._guardar(p)
        with self.assertRaises(ValueError):
            self.p.borrar({"id": "recetas", "carpeta": "si"})
        p["carpeta"] = carpeta
        self.p._guardar(p)
        r = self.p.borrar({"id": "recetas", "carpeta": "si"})
        self.assertEqual((r["ok"], r["carpeta"]), (True, True))
        self.assertFalse(os.path.exists(carpeta))
        with self.assertRaises(ValueError):
            self.p._leer("recetas")
        self.plan()
        r = self.p.borrar({"id": "recetas", "carpeta": "no"})
        self.assertEqual((r["ok"], r["carpeta"]), (True, False))

    def test_crear_y_paso(self):
        self.plan()
        self.p.ia.puede_escribir = lambda ia=None: False
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
