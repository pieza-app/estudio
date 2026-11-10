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
await page.waitForSelector(".plan li");
assert.ok(await page.locator(".medidor .ahorro .icono-pieza").count(), "el medidor muestra lo ahorrado con piezas");
await capturar(page, "3e-plan-en");
// Revisión a ciegas: lo grave viene marcado; rehacer el plan con lo aceptado.
await page.click("#revisar");
await page.waitForSelector(".hallazgos li");
assert.equal(await page.locator(".hallazgos li").count(), 3, "la revisión trae sus hallazgos");
assert.ok(await page.isChecked('[data-hallazgo="h1"]'), "lo grave viene marcado");
await capturar(page, "3e2-revision-en");
await page.click("#rehacer-con");
await page.waitForSelector(".hallazgos", { state: "detached" });  // el plan nuevo parte sin revisión
await page.waitForSelector(".plan li");
await page.click("#siguiente");
await page.click("#crear");
await page.waitForSelector(".pasos li");
await page.click('[data-modo="auto"]');
await page.waitForSelector("#tope");
await capturar(page, "3f-pasos-en");
await page.click("#hacer-paso");
await page.waitForFunction(() => document.querySelector(".consola-titulo")?.textContent.includes("2"), null, { timeout: 15000 });  // dos a la vez
await page.waitForSelector(".listo", { timeout: 15000 });
assert.equal(await page.locator(".pasos .estado-listo").count(), 4, "en automático se hacen todos los pasos");
assert.ok(await page.locator(".pasos .usa").first().isVisible(), "cada paso dice de qué paso usa lo hecho");
await capturar(page, "3g-lista-en");
// 4. Publicar con la cuenta de la persona (simulado) y proponer una pieza.
await page.click("#revisar-publicar");
await page.waitForSelector("[data-dueno]");
assert.ok(await page.isChecked('[data-dueno="ana-perez"]'), "el dueño parte en el usuario");
// Una organización nueva: la guía, y Publicar espera hasta que la persona la crea y se revisa.
await page.click('[data-dueno="__nueva__"]');
await page.waitForSelector(".guia-org #org-nueva");
assert.ok(await page.isDisabled("#publicar"), "con una organización por crear no se publica todavía");
await capturar(page, "3h0-organizacion-en");
await page.click('[data-dueno="ana-app"]');
await page.click("#publicar");
await page.waitForSelector(".publicar .listo");
assert.match(await page.locator(".publicar .listo").innerText(), /ana-app\/receta/);
await page.fill("#pz-nombre", "Lista de compras");
await page.fill("#pz-que", "Arma una lista de compras desde recetas.");
assert.ok(!(await page.isDisabled("#proponer")), "con nombre y qué resuelve, se puede proponer");
await capturar(page, "3h-publicada-en");
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
await page.click("#inicio");
await page.waitForSelector(".proyectos [data-seguir]");
await sinDesborde(page, "inicio a 390 px");
await capturar(page, "4c-inicio-390");
// Quitar una app de la lista (sin borrar su carpeta).
const antes = await page.locator(".proyectos li").count();
await page.click(".proyectos [data-menu-app]");
await page.click(".menu-app [data-quitar]");
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
