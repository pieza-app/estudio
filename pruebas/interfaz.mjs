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
assert.equal(await page.locator(".barra").count(), 0, "detrás del idioma no se pinta la app");
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
await page.click("#siguiente");
await page.click("#crear");
await page.waitForSelector(".pasos li");
await page.click('[data-modo="auto"]');
await page.waitForSelector("#tope");
await capturar(page, "3f-pasos-en");
await page.click("#hacer-paso");
await page.waitForSelector(".listo", { timeout: 15000 });
assert.equal(await page.locator(".pasos .estado-listo").count(), 4, "en automático se hacen todos los pasos");
await capturar(page, "3g-lista-en");
// 4. Publicar con la cuenta de la persona (simulado) y proponer una pieza.
await page.click("#revisar-publicar");
await page.waitForSelector("[data-dueno]");
assert.ok(await page.isChecked('[data-dueno="ana-perez"]'), "el dueño parte en el usuario");
await page.click('[data-dueno="ana-app"]');
await page.click("#publicar");
await page.waitForSelector(".publicar .listo");
assert.match(await page.locator(".publicar .listo").innerText(), /ana-app\/receta/);
await page.fill("#pz-nombre", "Lista de compras");
await page.fill("#pz-que", "Arma una lista de compras desde recetas.");
assert.ok(!(await page.isDisabled("#proponer")), "con nombre y qué resuelve, se puede proponer");
await capturar(page, "3h-publicada-en");
await page.click("#inicio");
await page.click("#explorar");
await page.waitForSelector(".apps li");
await capturar(page, "3i-explorar-en");
await page.click("#inicio");
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
await page.click("#inicio");
await page.waitForSelector("[data-seguir]");
await sinDesborde(page, "inicio a 390 px");
await page.click("#abrir-ajustes");
await page.waitForSelector("[role=dialog]");
await sinDesborde(page, "Ajustes a 390 px");
await capturar(page, "5-ajustes-390");

await navegador.close();
servidor.close();
assert.deepEqual(errores, [], "errores de JavaScript o de la CSP");
console.log("Interfaz: todo bien");
