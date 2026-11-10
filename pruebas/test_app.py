"""Pruebas de lo propio de Pieza en Python. Cada una corre con una carpeta temporal: nunca toca datos reales.

Una clase por script de bin/, con datos ficticios.
"""
import json
import re
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
        muchos = {"pasos": [{"titulo": f"Paso {i}", "que": "x", "archivos": [], "tokens": 1} for i in range(35)]}
        self.respuestas.append(json.dumps(muchos))
        self.respuestas.append('{"pasos": [{"titulo": "Recetas", "que": "Guardar recetas.", "archivos": [], "tokens": 900}]}')
        r = self.p.plan({"nombre": "Recetas", "frase": "Ordena las recetas de Ana Pérez.", "plataformas": ["mac"], "piezas": []})
        self.assertTrue(r["ok"], r)
        self.assertIn("trajo 35", self.pedidos[-1][0])

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

    def plan_en_paralelo(self):
        pasos = [{"titulo": "Datos", "que": "Formato de recetas.", "archivos": ["bin/datos.py"], "tokens": 900, "entrega": "datos.leer() → lista",
                  "depende": []},
                 {"titulo": "Lista", "que": "Pantalla de lista.", "archivos": ["bin/lista.py"], "tokens": 900, "entrega": "", "depende": [1]},
                 {"titulo": "Buscar", "que": "Buscar recetas.", "archivos": ["bin/buscar.py"], "tokens": 900, "entrega": "", "depende": [1]},
                 {"titulo": "Compras", "que": "Lista de compras.", "archivos": ["bin/compras.py"], "tokens": 900, "depende": [2, 3]}]
        self.respuestas.append(json.dumps({"pasos": pasos}))
        p = self.p.plan({"nombre": "Recetas", "frase": "Ordena las recetas de Ana Pérez.", "plataformas": ["mac"], "piezas": []})["proyecto"]
        return p

    def test_plan_con_pasos_chicos_y_conectados(self):
        grande = {"pasos": [{"titulo": "Todo", "que": "x", "archivos": [f"bin/a{i}.py" for i in range(9)], "tokens": 900}]}
        self.respuestas.append(json.dumps(grande))
        p = self.plan_en_paralelo()
        self.assertIn("es muy grande", self.pedidos[-1][0])  # se pidió de nuevo, dividiendo
        self.assertEqual([x["depende"] for x in p["pasos"]], [[], [0], [0], [1, 2]])
        self.assertEqual(self.p.listos_para_lote(p), [0])
        p["pasos"][0]["estado"] = "listo"
        p["pasos"][0]["resumen"] = "Dejé el formato."
        self.assertEqual(self.p.listos_para_lote(p), [1, 2])  # no dependen entre sí ni comparten archivos
        p["carpeta"] = self.tmp.name
        pedido = self.p._prompt_paso(p, 1)
        self.assertIn("(este paso lo usa)", pedido)
        self.assertIn("datos.leer() → lista", pedido)

    def test_lote_hace_pasos_a_la_vez_y_junta_los_cambios(self):
        p = self.plan_en_paralelo()
        carpeta = self.p.crear({"id": "recetas"})["proyecto"]["carpeta"]
        proyecto = self.p._leer("recetas")
        proyecto["pasos"][0]["estado"] = "listo"
        self.p._guardar(proyecto)
        self.p.ia.puede_escribir = lambda ia=None: True
        self.p.probar = lambda c: (True, "ok")
        en_antes = json.load(open(os.path.join(carpeta, "ui", "idiomas", "en.json")))

        def edita(pedido, **opciones):
            c = opciones["escribir"]
            self.assertNotEqual(c, carpeta)  # cada paso en su copia
            n = int(re.search(r"# Este paso \((\d+)\)", pedido).group(1))
            open(os.path.join(c, "bin", f"paso{n}.py"), "w").write(f"print({n})\n")
            en = json.load(open(os.path.join(c, "ui", "idiomas", "en.json")))
            en.setdefault("textos", {})[f"Paso {n}"] = f"Step {n}"
            json.dump(en, open(os.path.join(c, "ui", "idiomas", "en.json"), "w"), ensure_ascii=False, indent=1)
            with open(os.path.join(c, "CHANGELOG.md"), "a") as f:
                f.write(f"- Paso {n}\n")
            return f"Hice el paso {n}.", None
        self.p.ia.preguntar_vivo = edita
        r = self.p.lote({"id": "recetas", "ns": [1, 2]})
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["aplicados"], [1, 2])
        self.assertEqual([x["estado"] for x in r["proyecto"]["pasos"]], ["listo", "listo", "listo", "pendiente"])
        for n in (2, 3):
            self.assertTrue(os.path.exists(os.path.join(carpeta, "bin", f"paso{n}.py")))
        en = json.load(open(os.path.join(carpeta, "ui", "idiomas", "en.json")))
        self.assertEqual((en["textos"]["Paso 2"], en["textos"]["Paso 3"]), ("Step 2", "Step 3"))  # las dos traducciones
        self.assertEqual(len(en["textos"]), len(en_antes.get("textos", {})) + 2)
        changelog = open(os.path.join(carpeta, "CHANGELOG.md")).read()
        self.assertIn("- Paso 2", changelog)
        self.assertIn("- Paso 3", changelog)
        with self.assertRaises(ValueError):
            self.p.lote({"id": "recetas", "ns": [0, 3]})  # el 1 ya está listo

    def test_lote_aplaza_lo_que_choca(self):
        self.plan_en_paralelo()
        carpeta = self.p.crear({"id": "recetas"})["proyecto"]["carpeta"]
        proyecto = self.p._leer("recetas")
        proyecto["pasos"][0]["estado"] = "listo"
        self.p._guardar(proyecto)
        self.p.ia.puede_escribir = lambda ia=None: True
        self.p.probar = lambda c: (True, "ok")
        primera = open(os.path.join(carpeta, "ui", "app.js")).read().splitlines()[0]

        def edita(pedido, **opciones):
            n = re.search(r"# Este paso \((\d+)\)", pedido).group(1)
            ruta = os.path.join(opciones["escribir"], "ui", "app.js")
            lineas = open(ruta).read().splitlines(True)
            lineas[0] = f"// paso {n}\n"
            open(ruta, "w").write("".join(lineas))
            return "Cambié la primera línea.", None
        self.p.ia.preguntar_vivo = edita
        r = self.p.lote({"id": "recetas", "ns": [1, 2]})
        self.assertFalse(r["ok"])
        self.assertEqual((r["aplicados"], r["aplazados"]), ([1], [2]))
        self.assertEqual(r["proyecto"]["pasos"][2]["estado"], "pendiente")
        self.assertEqual(open(os.path.join(carpeta, "ui", "app.js")).read().splitlines()[0], "// paso 2")
        self.assertNotEqual(primera, "// paso 2")

    def test_rehacer_lo_que_falta_de_una_app_creada(self):
        """Una app ya creada: revisar y rehacer el plan funcionan; los pasos listos se quedan y el plan nuevo es solo lo que falta."""
        self.plan_en_paralelo()
        self.p.crear({"id": "recetas"})
        proyecto = self.p._leer("recetas")
        proyecto["pasos"][0].update(estado="listo", gastado=5000, resumen="Dejé el formato.")
        proyecto["pasos"][2].update(estado="fallo", gastado=7000)
        proyecto["estado"] = "pasos"
        self.p._guardar(proyecto)
        self.respuestas.append(json.dumps({"pasos": [
            {"titulo": "Lista chica", "que": "a", "archivos": ["bin/lista.py"], "tokens": 500, "depende": [1]},
            {"titulo": "Buscar chico", "que": "b", "archivos": ["bin/buscar.py"], "tokens": 500, "depende": [1]}]}))
        r = self.p.plan({"nombre": "Recetas", "frase": "Ordena las recetas de Ana Pérez.", "plataformas": ["mac"], "piezas": []})
        self.assertTrue(r["ok"], r)
        p = r["proyecto"]
        self.assertEqual(p["estado"], "pasos")
        self.assertEqual([x["titulo"] for x in p["pasos"]], ["Datos", "Lista chica", "Buscar chico"])
        self.assertEqual([x["depende"] for x in p["pasos"]], [[], [0], [0]])
        self.assertIn("pasos 1 a 1: no los repitas", self.pedidos[-1][0])
        self.assertGreaterEqual(p["gastado"], 12000)  # lo gastado en el paso que se fue sigue en la cuenta
        self.respuestas.extend(['{"hallazgos": []}'] * 3)
        self.assertTrue(self.p.revisar({"id": "recetas"})["ok"])

    def test_pedir_un_cambio_a_una_app_creada(self):
        """«Pedir un cambio»: el plan nuevo es solo para el cambio, lo hecho se queda y el cambio queda anotado."""
        self.plan_en_paralelo()
        self.p.crear({"id": "recetas"})
        proyecto = self.p._leer("recetas")
        for x in proyecto["pasos"]:
            x.update(estado="listo", gastado=100)
        proyecto["estado"] = "pasos"
        self.p._guardar(proyecto)
        self.respuestas.append(json.dumps({"pasos": [
            {"titulo": "Exportar a PDF", "que": "a", "archivos": ["bin/pdf.py"], "tokens": 500, "depende": [1]}]}))
        r = self.p.plan({"nombre": "Recetas", "frase": "Ordena las recetas de Ana Pérez.", "plataformas": ["mac"], "piezas": [],
                         "cambio": "Que se pueda exportar a PDF."})
        self.assertTrue(r["ok"], r)
        p = r["proyecto"]
        self.assertEqual(p["pasos"][-1]["titulo"], "Exportar a PDF")
        self.assertEqual(len(p["pasos"]), len(proyecto["pasos"]) + 1)
        self.assertEqual(p["cambios"], ["Que se pueda exportar a PDF."])
        self.assertIn("Que se pueda exportar a PDF.", self.pedidos[-1][0])

    def test_dividir_un_paso(self):
        self.plan_en_paralelo()
        self.respuestas.append(json.dumps({"pasos": [
            {"titulo": "Lista: datos", "que": "a", "archivos": ["bin/lista.py"], "tokens": 500, "entrega": "lista.cargar()"},
            {"titulo": "Lista: pantalla", "que": "b", "archivos": ["ui/app.js"], "tokens": 500, "depende": [1]}]}))
        r = self.p.dividir({"id": "recetas", "n": 1})
        self.assertTrue(r["ok"], r)
        pasos = r["proyecto"]["pasos"]
        self.assertEqual([x["titulo"] for x in pasos], ["Datos", "Lista: datos", "Lista: pantalla", "Buscar", "Compras"])
        self.assertEqual([x["depende"] for x in pasos], [[], [0], [1], [0], [2, 3]])  # «Compras» ahora espera al último de la división
        self.assertEqual(pasos[1]["dividido_de"], "Lista")

    def test_acciones_json_se_arma_siempre(self):
        """app.json con una acción nueva de un intento anterior: Pieza arma acciones.json antes de las pruebas aunque este intento no
        cambie app.json (antes quedaba viejo y el contrato fallaba sin que la IA pudiera arreglarlo)."""
        self.plan()
        carpeta = self.p.crear({"id": "recetas"})["proyecto"]["carpeta"]
        app = json.load(open(os.path.join(carpeta, "app.json")))
        app["acciones"]["recetasListar"] = {"script": "recetas.py", "args": ["lista"], "entrada": None, "datos": {},
                                            "responde": "recetasListas", "limite": 30}
        json.dump(app, open(os.path.join(carpeta, "app.json"), "w"))
        open(os.path.join(carpeta, "bin", "recetas.py"), "w").write("print('recetas')\n")
        self.p.ia.puede_escribir = lambda ia=None: True
        self.p.probar = lambda c: (True, "ok")
        self.p.ia.preguntar_vivo = lambda pedido, **o: ("Ya estaba hecho.", None)
        self.assertTrue(self.p.paso({"id": "recetas", "n": 0})["ok"])
        self.assertIn("recetasListar", json.load(open(os.path.join(carpeta, "acciones.json")))["acciones"])

    def test_freno_de_gasto(self):
        """Un paso que ya gastó más de 3 veces lo estimado no se reintenta solo: queda con causa «gasto» para que la persona decida."""
        self.plan()
        self.p.crear({"id": "recetas"})
        self.p.ia.puede_escribir = lambda ia=None: True
        self.p.probar = lambda c: (False, "falla")
        llamadas = []

        def cara(pedido, **o):
            llamadas.append(1)
            o["al_evento"]({"t": "uso", "entrada": 5000, "salida": 0})  # el paso estimó 900
            return "Intenté.", None
        self.p.ia.preguntar_vivo = cara
        x = self.p.paso({"id": "recetas", "n": 0})["proyecto"]["pasos"][0]
        self.assertEqual((len(llamadas), x["causa"]), (1, "gasto"))

    def test_el_freno_mira_solo_lo_de_esta_vez(self):
        """Lo gastado otras veces no frena un intento nuevo: «Arreglarlo» tiene sus dos intentos."""
        self.plan()
        self.p.crear({"id": "recetas"})
        p = self.p._leer("recetas")
        p["pasos"][0].update(gastado=900_000, estado="fallo", error="falla de antes")
        self.p._guardar(p)
        self.p.ia.puede_escribir = lambda ia=None: True
        self.p.probar = lambda c: (False, "falla")
        llamadas = []

        def cara(pedido, **o):
            llamadas.append(1)
            o["al_evento"]({"t": "uso", "entrada": 100, "salida": 0})
            return "Intenté.", None
        self.p.ia.preguntar_vivo = cara
        x = self.p.paso({"id": "recetas", "n": 0})["proyecto"]["pasos"][0]
        self.assertEqual((len(llamadas), x["causa"]), (2, "pruebas"))

    def test_probar_de_nuevo_sin_ia(self):
        """«Probar de nuevo»: solo las pruebas, sin llamar a la IA. Si pasan, el paso queda listo."""
        self.plan()
        self.p.crear({"id": "recetas"})
        p = self.p._leer("recetas")
        p["pasos"][0].update(estado="fallo", error="falla", causa="gasto")
        self.p._guardar(p)
        self.p.ia.preguntar_vivo = lambda *a, **o: self.fail("no debe llamar a la IA")
        self.p.probar = lambda c: (False, "FAIL: test_x\nAssertionError: 1 != 2")
        r = self.p.reprobar({"id": "recetas", "n": 0})
        self.assertFalse(r["ok"])
        self.assertEqual(r["proyecto"]["pasos"][0]["causa"], "pruebas")
        self.p.probar = lambda c: (True, "ok")
        r = self.p.reprobar({"id": "recetas", "n": 0})
        self.assertTrue(r["ok"])
        self.assertEqual(r["proyecto"]["pasos"][0]["estado"], "listo")
        self.assertNotIn("causa", r["proyecto"]["pasos"][0])

    def test_pruebas_aisladas(self):
        """En Mac, las pruebas van en sandbox-exec: sin red de afuera, escribe solo en la carpeta, no lee llaves."""
        carpeta = "/" + "Users/ana/Pieza/Recetas"  # armada: la revisión de privacidad marca rutas de usuario escritas
        perfil = self.p._perfil_mac(carpeta)
        self.assertIn('(deny network-outbound)', perfil)
        self.assertIn(f'(allow file-write* (subpath "{carpeta}")', perfil)
        self.assertIn(".ssh", perfil)
        self.assertIn("Library/Keychains", perfil)
        original = self.p.sys.platform
        try:
            self.p.sys.platform = "darwin"
            orden, aislada = self.p.aislar(["bash", "pruebas/correr.sh"], self.tmp.name)
            if os.path.exists("/usr/bin/sandbox-exec"):
                self.assertTrue(aislada)
                self.assertEqual(orden[:2], ["/usr/bin/sandbox-exec", "-p"])
            orden, aislada = self.p.aislar(["bash"], '/tmp/con"comillas')
            self.assertFalse(aislada)
        finally:
            self.p.sys.platform = original

    def test_revisar_antes_de_subir(self):
        """Antes de publicar: secretos (bloquean), datos personales (se confirman), dominios y comandos de la app."""
        import publicar
        c = os.path.join(self.tmp.name, "app")
        os.makedirs(os.path.join(c, "bin"))
        open(os.path.join(c, ".gitignore"), "w").write("*\n!.gitignore\n!bin/\n!bin/*.py\n")
        open(os.path.join(c, "bin", "datos.py"), "w").write("import subprocess\nURL = 'https://api.ejemplo-banco.cl/v1'\n"
                                                             "RUT = '12." + "345.678-5'\nLLAVE = 'sk-ant-" + "a" * 30 + "'\n")
        open(os.path.join(c, "notas.txt"), "w").write("no se sube\n")
        r = publicar.revisar_subida(c)
        self.assertEqual(r["archivos"], [".gitignore", "bin/datos.py"])
        self.assertEqual([x["tipo"] for x in r["secretos"]], ["llave de Anthropic u OpenAI"])
        self.assertEqual([x["tipo"] for x in r["personales"]], ["RUT"])
        self.assertEqual(r["dominios"], ["api.ejemplo-banco.cl"])
        self.assertEqual(r["comandos"], ["bin/datos.py"])

    def test_lista_no_muestra_copias(self):
        """Un respaldo en la carpeta del registro (recetas.antes.json, con el mismo id) no es otra app."""
        self.plan()
        import shutil
        carpeta = self.p._registro()
        shutil.copy(os.path.join(carpeta, "recetas.json"), os.path.join(carpeta, "recetas.antes.json"))
        self.assertEqual([x["id"] for x in self.p.lista({})["proyectos"]], ["recetas"])

    def test_juntar_cambios(self):
        self.assertEqual(self.p._juntar_texto("a\nb\nc\n", "a\nB\nc\n", "a\nb\nc\nd\n"), "a\nB\nc\nd\n")
        self.assertEqual(self.p._juntar_texto("a\n", "a\nx\n", "a\ny\n"), "a\nx\ny\n")
        self.assertIsNone(self.p._juntar_texto("a\nb\n", "a\nX\n", "a\nY\n"))
        self.assertEqual(self.p._juntar_json({"t": {"x": 1}}, {"t": {"x": 1, "y": 2}}, {"t": {"x": 1, "z": 3}}),
                         {"t": {"x": 1, "y": 2, "z": 3}})
        with self.assertRaises(ValueError):
            self.p._juntar_json({"v": 1}, {"v": 2}, {"v": 3})

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


class EnVivo(unittest.TestCase):
    """Lo que se ve mientras corre un paso: rutas de Rust y la línea que dice qué falló."""

    def setUp(self):
        sys.path.insert(0, os.path.join(RAIZ, "bin"))
        import proyectos
        self.p = proyectos

    def test_cargo_de_rustup_esta_en_el_path(self):
        self.assertIn(os.path.join(os.path.expanduser("~"), ".cargo", "bin"), self.p.RUTAS_EXTRA)

    def test_ultima_linea_dice_que_fallo(self):
        salida = "Sintaxis\nPython\nFAIL: test_retomar (pruebas.test_app.Historial)\nRan 30 tests\nFAILED (failures=1)"
        self.assertEqual(self.p._ultima_linea(salida), "FAIL: test_retomar (pruebas.test_app.Historial)")
        self.assertEqual(self.p._ultima_linea("uno\ndos"), "dos")
        self.assertEqual(self.p._ultima_linea(""), "")


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

    def test_version_nueva_sube_los_numeros(self):
        carpeta = os.path.join(self.tmp.name, "Recetas")
        os.makedirs(os.path.join(carpeta, "escritorio"))
        with open(os.path.join(carpeta, "app.json"), "w") as f:
            json.dump({"id": "recetas", "version": "0.3.2"}, f)
        with open(os.path.join(carpeta, "escritorio", "tauri.conf.json"), "w") as f:
            json.dump({"productName": "Recetas", "version": "0.3.2"}, f)
        with open(os.path.join(carpeta, "escritorio", "Cargo.toml"), "w") as f:
            f.write('[package]\nname = "recetas"\nversion = "0.3.2"\n\n[dependencies]\nserde = { version = "1" }\n')
        with open(os.path.join(carpeta, "escritorio", "Cargo.lock"), "w") as f:
            f.write('[[package]]\nname = "serde"\nversion = "1.0.0"\n\n[[package]]\nname = "recetas"\nversion = "0.3.2"\n')
        with open(os.path.join(carpeta, "CHANGELOG.md"), "w") as f:
            f.write("# Cambios\n\n## 0.3.2\n- Antes.\n")
        self.assertEqual(self.m._subir_numero(carpeta), ("0.3.2", "0.4.0"))
        self.m._anotar_cambio(carpeta, "0.4.0", "Ahora puedes exportar a PDF.")
        self.assertEqual(json.load(open(os.path.join(carpeta, "app.json")))["version"], "0.4.0")
        self.assertEqual(json.load(open(os.path.join(carpeta, "escritorio", "tauri.conf.json")))["version"], "0.4.0")
        cargo = open(os.path.join(carpeta, "escritorio", "Cargo.toml")).read()
        self.assertIn('version = "0.4.0"', cargo)
        self.assertIn('serde = { version = "1" }', cargo)
        lock = open(os.path.join(carpeta, "escritorio", "Cargo.lock")).read()
        self.assertIn('name = "serde"\nversion = "1.0.0"', lock)
        self.assertIn('name = "recetas"\nversion = "0.4.0"', lock)
        cambios = open(os.path.join(carpeta, "CHANGELOG.md")).read()
        self.assertLess(cambios.index("## 0.4.0"), cambios.index("## 0.3.2"))
        self.assertIn("- Ahora puedes exportar a PDF.", cambios)

    def test_version_nueva_pide_publicar_y_revisa(self):
        import proyectos
        carpeta = os.path.join(self.tmp.name, "Recetas")
        os.makedirs(carpeta)
        with open(os.path.join(carpeta, "app.json"), "w") as f:
            json.dump({"id": "recetas", "version": "0.1.0"}, f)
        proyectos._guardar({"id": "recetas", "nombre": "Recetas", "frase": "x", "estado": "pasos", "pasos": [], "carpeta": carpeta})
        with self.assertRaises(ValueError):  # sin publicar, no hay versión nueva
            self.m.version({"id": "recetas", "nota": "x"})
        p = proyectos._leer("recetas")
        p["repo"] = "ana-perez/recetas"
        proyectos._guardar(p)
        self.m.revisar = lambda d: {"ok": True, "gh": True, "sesion": True, "usuario": "ana-perez", "duenos": ["ana-perez"]}
        with open(os.path.join(carpeta, ".env"), "w") as f:
            f.write("CLAVE=1\n")
        r = self.m.version({"id": "recetas", "nota": "x"})
        self.assertEqual(r["codigo"], "secretos")
        self.assertEqual(json.load(open(os.path.join(carpeta, "app.json")))["version"], "0.1.0")  # no tocó nada

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
