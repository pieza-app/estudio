// La interfaz de Pieza en un navegador de verdad (Chromium con Playwright), servida con la misma CSP que la app y con los
// datos ficticios de ui/demo.json. Revisa: sin errores de JavaScript ni violaciones de la CSP; el primer uso parte por el idioma,
// solo en la pantalla; después, todo traducido al inglés (ningún texto sin traducir); el asistente de punta a punta; Ajustes; y
// nada se sale a 390 px. Con CAPTURAS=<carpeta> guarda capturas para mirarlas a ojo (en GitHub quedan como artefacto).
//   PLAYWRIGHT=/ruta/a/node_modules/playwright node pruebas/interfaz.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const UI = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "ui");
const CAPTURAS = process.env.CAPTURAS || "";
const APP = "Pieza";

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'";
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const servidor = http.createServer((q, r) => {
  const ruta = path.normalize(path.join(UI, decodeURIComponent(new URL(q.url, "http://x").pathname).replace(/^\/+/, "") || "index.html"));
  if (!ruta.startsWith(UI + path.sep) || !fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": TIPOS[path.extname(ruta)] || "application/octet-stream", "Content-Security-Policy": CSP });
  fs.createReadStream(ruta).pipe(r);
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${servidor.address().port}/index.html`;

const navegador = await chromium.launch();
const errores = [];
async function abrir(consulta, ancho = 1280) {
  const page = await navegador.newPage({ viewport: { width: ancho, height: 800 } });
  page.on("pageerror", (e) => errores.push(`${consulta}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errores.push(`${consulta}: ${m.text()}`); });
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective}`)));
  await page.goto(BASE + consulta);
  return page;
}
const capturar = async (page, nombre) => { if (CAPTURAS) { await page.waitForTimeout(400); fs.mkdirSync(CAPTURAS, { recursive: true }); await page.screenshot({ path: path.join(CAPTURAS, `${nombre}.png`) }); } };
const faltantes = (page) => page.evaluate((app) => [...window[app]._pruebas.faltantes], APP);
const sinDesborde = async (page, donde) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${donde}: se sale a lo ancho`);

// 1. Primer uso: el idioma va primero y solo (nada de la app detrás).
let page = await abrir("?bienvenida");
await page.waitForSelector(".opciones-idioma");
assert.equal(await page.locator(".marco").count(), 0, "detrás del idioma no se pinta la app");
await capturar(page, "1-idioma");
await page.click('[data-bv-idioma="en"]');
await page.waitForSelector(".pieza-bv:not(.pieza-bv-idioma)");
await capturar(page, "2-bienvenida-en");
for (let i = 0; i < 10 && await page.locator(".pieza-bv [data-bv-ir].pz-principal").count(); i++) {
  await page.click(".pieza-bv [data-bv-ir].pz-principal");
}
await page.click(".pieza-bv [data-bv-fin]:not([data-bv-fin=despues])");
await page.waitForSelector("#nueva");

// 2. El asistente de punta a punta (en la vista previa responde simular(), como lo haría la app).
await capturar(page, "3-inicio-en");
await page.click("#nueva");
assert.ok(await page.isDisabled("#siguiente"), "sin un sistema no se sigue");
await page.check('[data-sistema="mac"]');
await page.check('[data-sistema="ios"]');
await capturar(page, "3b-sistemas-en");
await page.click("#siguiente");
assert.ok(await page.isDisabled("#siguiente"), "sin nombre ni frase no se sigue");
await page.fill("#nombre", "Receta");
await page.fill("#frase", "Guarda recetas y tu IA arma la lista de compras");
await page.click("#siguiente");
await page.waitForSelector(".pieza");
assert.ok(await page.isChecked('[data-pieza="ia"]'), "la frase sugiere la pieza «ia» (sin gastar tokens)");
assert.ok(await page.locator(".pieza.hecha .icono-pieza").count() > 3, "las piezas hechas llevan el ícono de Pieza");
await capturar(page, "3c-piezas-en");
await page.click("#siguiente");
await page.waitForSelector(".cifras");
await capturar(page, "3d-ficha-en");
// 3. El plan con la IA, crear la app y los pasos en «Todo automático».
await page.click("#siguiente");
await page.click("#hacer-plan");
// El plan se mejora solo: plan → revisión a ciegas → corrección. Lo grave e importante se aplica; lo menor queda opcional.
await page.waitForSelector(".mejora .actual");
await page.waitForSelector(".plan-mejorado", { timeout: 15000 });
assert.equal(await page.locator(".mejora .hecha").count(), 3, "las tres etapas de la mejora quedan hechas");
assert.equal(await page.locator(".corregido li").count(), 2, "se aplicaron lo grave y lo importante");
assert.ok(await page.locator(".medidor .ahorro .icono-pieza").count(), "el medidor muestra lo ahorrado con piezas");
assert.ok(await page.locator(".panel-ahora").isVisible(), "el panel dice qué hacer ahora");
await capturar(page, "3e-plan-en");
await page.click(".plan-mejorado details:not([open]) summary");
await page.check('[data-hallazgo="h3"]');
await page.click("#sumar-opcionales");
await page.waitForFunction(() => document.querySelectorAll(".corregido li").length === 3, null, { timeout: 15000 });
await capturar(page, "3e2-revision-en");
await page.click("#siguiente");
await page.waitForSelector(".equipo [data-instalar=\"rust\"]");
assert.ok(await page.locator(".donde .tecnologias li").count() >= 4, "dice con qué se construye");
await capturar(page, "3e3-crear-en");
await page.click('[data-instalar="rust"]');
await page.waitForSelector(".equipo .hay >> text=Rust");
await page.click("#crear");
await page.waitForSelector(".pasos li");
await page.click('[data-modo="auto"]');
await page.waitForSelector("#tope");
await capturar(page, "3f-pasos-en");
await page.mouse.wheel(0, 2000);
assert.ok(await page.evaluate(() => document.querySelector(".lateral .marca").getBoundingClientRect().top >= 0), "la barra de la izquierda no se va al bajar");
await page.mouse.wheel(0, -2000);
await page.click("#hacer-paso");
await page.waitForFunction(() => document.querySelector(".consola-titulo")?.textContent.includes("2"), null, { timeout: 15000 });  // dos a la vez
await page.waitForSelector(".listo", { timeout: 15000 });
assert.equal(await page.locator(".pasos .estado-listo").count(), 4, "en automático se hacen todos los pasos");
assert.ok(await page.locator(".pasos .usa").first().isVisible(), "cada paso dice de qué paso usa lo hecho");
await capturar(page, "3g-lista-en");
// 4. Publicar: su propia etapa. GitHub se revisa solo; conectarlo muestra el código de una vez y espera; después, dónde y cómo.
await page.click("#siguiente");
await page.waitForSelector("#conectar-gh");
assert.ok(await page.isDisabled("#publicar"), "sin GitHub conectado no se publica");
await page.click("#conectar-gh");
await page.waitForSelector(".codigo-gh");
assert.equal(await page.locator(".codigo-gh").innerText(), "AB12-CD34");
await capturar(page, "3g2-conectar-en");
await page.waitForSelector("[data-dueno]");
assert.ok(await page.isChecked('[data-dueno="ana-perez"]'), "el dueño parte en el usuario");
// Una organización nueva: la guía, y Publicar espera hasta que la persona la crea y se revisa.
await page.click('[data-dueno="__nueva__"]');
await page.waitForSelector(".guia-org #org-nueva");
assert.ok(await page.isDisabled("#publicar"), "con una organización por crear no se publica todavía");
await capturar(page, "3h0-organizacion-en");
await page.click('[data-dueno="ana-app"]');
// Antes de subir: la revisión (secretos, datos personales, qué hace la app). Con datos que parecen personales, se confirma.
await page.waitForSelector(".revision-subida #datos-ok");
assert.ok(await page.isDisabled("#publicar"), "sin confirmar los datos, no se publica");
await page.check("#datos-ok");
await capturar(page, "3h1-revision-subida-en");
await page.click("#publicar");
await page.waitForSelector(".listo.publicar");
assert.ok(await page.locator('.enlaces-pub [data-abrir="https://ana-app.github.io/receta/"]').count(), "la página de la app, a un toque");
await page.fill("#pz-nombre", "Lista de compras");
await page.fill("#pz-que", "Arma una lista de compras desde recetas.");
assert.ok(!(await page.isDisabled("#proponer")), "con nombre y qué resuelve, se puede proponer");
await capturar(page, "3h-publicada-en");
// Después de publicar: una versión nueva (con su nota) y pedir un cambio (vuelve al plan, que se revisa solo).
assert.ok(await page.isDisabled("#publicar-version"), "sin decir qué cambió, no se publica una versión nueva");
await page.fill("#nota-version", "Ahora puedes exportar a PDF.");
await page.click("#publicar-version");
await page.waitForSelector("text=Published version: 0.2.0");
await page.fill("#cambio", "Que se pueda exportar a PDF.");
await page.click("#pedir-cambio");
await page.waitForSelector("text=The requested change");
assert.equal(await page.locator(".filas > *").count() >= 3, true, "lo hecho se queda y se suman los pasos del cambio");
await capturar(page, "3h2-pedir-cambio-en");
await page.click("#ir-inicio");
await page.click("#explorar");
await page.waitForSelector(".apps li");
await capturar(page, "3i-explorar-en");
await page.click("#ir-inicio");
await page.waitForSelector("#nueva");
await page.click("#abrir-ajustes");
await page.waitForSelector("[role=dialog]");
await capturar(page, "4-ajustes-en");
assert.deepEqual(await faltantes(page), [], "textos sin traducir al inglés (súmalos a ui/idiomas/en.json)");

// 3. En español, sin la bienvenida (ya hecha en demo.json), y a lo ancho de un celular.
page = await abrir("?idioma=es", 390);
await page.waitForSelector("#nueva");
await page.click("#nueva");
await page.check('[data-sistema="web"]');
await page.click("#siguiente");
await page.fill("#nombre", "Nota");
await page.fill("#frase", "Notas simples");
await page.click("#siguiente");
await page.waitForSelector(".pieza");
await sinDesborde(page, "piezas a 390 px");
await page.click("#siguiente");
await page.waitForSelector(".cifras");
await sinDesborde(page, "ficha a 390 px");
await page.click("#siguiente");
await page.click("#hacer-plan");
await page.waitForSelector(".plan li");
await sinDesborde(page, "plan a 390 px");
await page.click("#siguiente");
await page.click("#crear");
await page.waitForSelector(".pasos li");
await page.click("#hacer-paso");
await page.waitForSelector(".pasos .estado-listo");
await sinDesborde(page, "pasos a 390 px");
await capturar(page, "4b-pasos-390");
assert.equal(await page.getAttribute("#hacer-juntos", "data-ns"), "1,2", "paso a paso: ofrece los pasos que no dependen entre sí, a la vez");
// Un paso que no quedó: dice por qué, muestra lo que hizo y se arregla o se salta desde ahí.
await page.evaluate(() => window.Pieza._probar((E) => Object.assign(E.proyecto.pasos[1], {
  estado: "fallo", causa: "pruebas", error: "FALLA: test_lista esperaba 3 recetas", resumen: "Hice la lista de recetas. ".repeat(30),
  escritos: ["bin/recetas.py"], historial: [{ intento: 1, causa: "pruebas", resumen: "", escritos: [], error: "x" }, { intento: 2, causa: "pruebas", resumen: "", escritos: [], error: "x" }],
  registro: [{ t: "lee", ruta: "AGENTS.md", intento: 1 }, { t: "escribe", ruta: "bin/recetas.py", intento: 1 }, { t: "prueba", ruta: "pruebas/correr.sh", intento: 1 }] })));
await page.waitForSelector("#paso-1 .por-que [data-arreglar]");
assert.equal(await page.locator(".panel-control #hacer-paso").count(), 1, "el botón del próximo paso va en el panel de control");
assert.equal(await page.locator("#paso-1 [data-reprobar]").count(), 1, "un paso que falló se puede probar de nuevo sin IA");
assert.ok(await page.locator("#paso-1 .fallo-linea code").count(), "lo que falló se ve sin abrir el error completo");
await page.click("#paso-1 .detalle-paso summary");
assert.equal(await page.locator("#paso-1 .intentos li").count(), 2, "se ve cada intento");
assert.ok(await page.locator(".panel-control .consola").textContent().then((t) => t.includes("bin/recetas.py")), "la consola muestra lo que hizo la última vez");
await sinDesborde(page, "paso con fallo a 390 px");
await capturar(page, "4b2-paso-fallo-390");
await page.click("#paso-1 [data-saltar]");
await page.waitForSelector("#paso-1.saltado");
assert.equal(await page.getAttribute("#hacer-paso", "data-n"), "2", "saltado: sigue con el próximo");
await page.click("#paso-1 [data-arreglar]");
await page.waitForSelector("#paso-1.estado-listo");
// Dividir un paso que no queda: dos pasos más chicos en su lugar, y los de después se corren.
const total = await page.locator(".pasos > li").count();
await page.evaluate(() => window.Pieza._probar((E) => Object.assign(E.proyecto.pasos[2], { estado: "fallo", causa: "pruebas", error: "x" })));
await page.click("#paso-2 [data-dividir]");
await page.waitForFunction((n) => document.querySelectorAll(".pasos > li").length === n + 1, total);
assert.deepEqual(await page.locator("#paso-2 .fila-n, #paso-3 .fila-n").allTextContents(), ["3.1", "3.2"], "las partes llevan el número del paso: 3.1 y 3.2");
assert.equal((await page.locator("#paso-4 .fila-n").textContent()).trim(), "04", "los pasos de después no se corren");
// Un paso que llega al tope por paso se divide solo (5 → 5.1, 5.2) y sigue con la primera parte, sin que la persona toque nada.
const conPartes = await page.locator(".pasos > li").count();
await page.evaluate(() => {
  const E = window.Pieza._pruebas.E, n = E.proyecto.pasos.length - 1;
  const proyecto = JSON.parse(JSON.stringify(E.proyecto));
  Object.assign(proyecto.pasos[n], { estado: "fallo", causa: "tope", error: "Llegó al tope de 250000 tokens por paso." });
  window.Pieza.pasoListo({ ok: false, proyecto, n });
});
await page.waitForFunction((n) => document.querySelectorAll(".pasos > li").length === n + 1, conPartes);
await page.waitForSelector(".pasos > li:nth-last-child(2).estado-listo");   // la primera parte ya se hizo sola
// «Dile a Pieza»: una indicación para toda la app queda a la vista; una orden («saltar el paso 4»: el que la persona ve como 4) la entiende sin IA.
await page.fill("#decir", "Usa solo velas de 1 h.");
await page.click("#enviar-decir");
await page.waitForSelector(".indicaciones li");
await page.fill("#decir", "saltar el paso 4");
await page.click("#enviar-decir");
await page.waitForFunction(() => window.Pieza._pruebas.E.saltados.size === 1);
// Un paso que falla se arregla solo también en «paso a paso»: tu IA lo corrige sin que la persona apriete nada.
await page.evaluate(() => {
  const E = window.Pieza._pruebas.E, n = 0;
  const proyecto = JSON.parse(JSON.stringify(E.proyecto));
  Object.assign(proyecto.pasos[n], { estado: "fallo", causa: "pruebas", error: "FAIL: test_x" });
  window.Pieza.pasoListo({ ok: false, proyecto, n });
});
await page.waitForSelector("#paso-0.estado-listo");
await page.click("#inicio");
await page.waitForSelector(".proyectos [data-seguir]");
await sinDesborde(page, "inicio a 390 px");
await capturar(page, "4c-inicio-390");
// Quitar una app de la lista (sin borrar su carpeta).
const antes = await page.locator(".proyectos li").count();
await page.click(".proyectos [data-menu-app]");
await page.click(".menu-app [data-borrar]");
await page.click('[data-pz-confirmar="si"]');
await page.waitForFunction((n) => document.querySelectorAll(".proyectos li").length === n - 1, antes);
// La frase del inicio pasa a la idea.
await page.fill("#frase-rapida", "Ordena mis fotos");
await page.click("#nueva");
await page.check('[data-sistema="web"]');
await page.click("#siguiente");
assert.equal(await page.inputValue("#frase"), "Ordena mis fotos", "la frase del inicio llega a «Tu idea»");
await page.click("#ir-inicio");
await page.click("#abrir-ajustes");
await page.waitForSelector("[role=dialog]");
await sinDesborde(page, "Ajustes a 390 px");
await capturar(page, "5-ajustes-390");

await navegador.close();
servidor.close();
assert.deepEqual(errores, [], "errores de JavaScript o de la CSP");
console.log("Interfaz: todo bien");
