// Pieza: la interfaz. La misma en Mac (WKWebView), Windows y Linux (Electron) y en el navegador (vista previa con demo.json).
// La app manda el estado con window.Pieza.estado(json); la interfaz pide cosas con host.enviar(accion, datos).
// Empezó con «pieza.py crear» (pieza «esqueleto» de Pieza): desde ahí es de la app.
// Las piezas de interfaz (host.js, i18n.js, tema.*, componentes.*, bienvenida.*) no se editan aquí: ver AGENTS.md → «Piezas».
(() => {
  "use strict";
  // ── Puente con la app: pieza «host-ui». host.plataforma es "mac" | "windows" | "linux" | "web" (vista previa: simular()). ──
  const host = PiezaHost.crearHost({ nombre: "pieza", global: "Pieza", simular: (accion, d, c) => simular(accion, d, c) });
  const NOMBRE = "Pieza";
  const REPO = "pieza-app/estudio";
  const ENLACES = { sitio: "https://pieza-app.github.io/estudio/", codigo: `https://github.com/${REPO}`, comunidad: `https://github.com/${REPO}/discussions`,
    aportar: `https://github.com/${REPO}/blob/main/CONTRIBUTING.md` };
  const E = { config: {}, version: "", ias: [], ajustes: false, iniciada: false,
    catalogo: [], paso: 0, nueva: nuevaApp(), ficha: null, armando: false };
  // Una app nueva, mientras la persona la arma paso a paso (todavía no se crea nada en el disco).
  function nuevaApp() { return { plataformas: [], nombre: "", frase: "", piezas: [], tocadas: [] }; }
  const raiz = document.getElementById("app");
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");

  // ── Idiomas: pieza «i18n». Las claves son la frase en español; el inglés, en idiomas/en.json (todo texto nuevo va ahí). ──
  const faltantes = new Set();   // pruebas/interfaz.mjs revisa que no quede nada sin traducir
  const i18n = PiezaI18n.crear({ faltantes });
  const { Tp } = i18n;
  let idiomaElegido = null;
  async function cargarIdioma(elegido) {
    // Lo recién elegido > ?idioma= (vista previa y pruebas) > lo guardado > el del sistema.
    if (elegido) idiomaElegido = elegido;
    await i18n.cargar(i18n.elegir({ elegido: idiomaElegido, config: E.config.idioma_ui }));
    document.documentElement.lang = i18n.idioma;
  }

  // ── Tema (sistema, claro u oscuro) y componentes (diálogos, avisos, Tu IA, actualizaciones, Acerca de) ──
  const tema = PiezaTema.crear({ guardar: (v) => { E.config.tema = v; host.enviar("config", { tema: v }); } });
  const ui = PiezaComponentes.crear({
    i18n, host, app: NOMBRE, repo: REPO, version: () => E.version, pintar, mantenerCampos: true,
    cerrar: () => { E.ajustes = false; pintar(); },   // Esc, el velo o ✕ sobre un diálogo de la app
    retener: (...a) => bv.retener(...a),               // mientras se elige el idioma, los avisos esperan
    elegirIA: (id) => { E.config.ia = id; host.enviar("config", { ia: id }); },
  });
  const toast = (frase, o) => ui.aviso(frase, o);

  // ── Bienvenida: pieza «bienvenida». El idioma siempre primero y solo en la pantalla; después, los pasos de la app. ──
  const bv = PiezaBienvenida.crear({
    i18n, pintar, mostrarAviso: (...a) => toast(...a),
    guardarIdioma: (c) => { E.config.idioma_ui = c; host.enviar("config", { idioma_ui: c }); },
    cargarIdioma: (c) => cargarIdioma(c),
    terminar: () => { E.config.bienvenida = true; host.enviar("config", { bienvenida: true }); },
  });
  bv.sumarPaso({ id: "hola", orden: 10, titulo: "Te damos la bienvenida", saltable: false,
    cuerpo: () => `<p><b data-sin-traducir>${esc(NOMBRE)}</b></p><p>Pieza crea apps paso a paso, con piezas ya hechas. Lo que ya existe no gasta tokens de tu IA.</p>` });
  bv.sumarPaso({ id: "ia", orden: 20, titulo: "Elige tu IA", puede: () => !!E.config.ia,
    cuerpo: () => `<p>Usa la IA que ya tienes, con tu cuenta. La probamos con una pregunta corta.</p>${ui.filasIA({ ias: E.ias, elegida: E.config.ia })}` });

  // ── Lo que se ve ──
  // Sistemas que se pueden elegir. Android espera a la pieza «host-movil» (planeada): se puede elegir, y la ficha dice que falta.
  const SISTEMAS = [
    { grupo: "Escritorio", ids: [["mac", "Mac"], ["windows", "Windows"], ["linux", "Linux"]] },
    { grupo: "Celular", ids: [["ios", "iPhone"], ["android", "Android"]] },
    { grupo: "Web", ids: [["web", "Solo en el navegador"]] },
  ];
  const PASOS = ["¿Para qué sistemas?", "¿Qué hace tu app?", "Las piezas", "La ficha"];
  const CATEGORIAS = { base: "Base", plataforma: "Plataforma", interfaz: "Interfaz", ia: "IA", datos: "Datos", conexiones: "Conexiones",
    medios: "Medios", repo: "El repo" };
  const ICONO = '<img class="icono-pieza" src="pieza.svg" alt="" width="18" height="18">';

  // La misma regla que bin/piezas.py (_sirve): la vista previa web usa las piezas que corren en escritorio y en celular.
  function sirve(p, plats) {
    const propias = new Set(p.plataformas || []);
    if (plats.includes("web") && propias.has("mac") && propias.has("ios")) return true;
    return plats.some((x) => x !== "web" && propias.has(x));
  }
  // Las piezas que calzan con la frase (por sus palabras clave): se marcan solas, sin gastar tokens.
  function sugeridas(frase) {
    const t = frase.toLowerCase();
    return E.catalogo.filter((p) => !p.recomendar.siempre && (p.recomendar.palabras || []).some((w) => new RegExp(`\\b${w}`, "u").test(t))).map((p) => p.id);
  }

  function inicio() {
    return `<section class="inicio">
      <h2>Crea una app</h2>
      <p class="suave">Paso a paso, con piezas ya hechas. Lo que ya existe no gasta tokens de tu IA.</p>
      <div class="pz-pie"><button type="button" class="pz-boton pz-principal" id="nueva">Crear una app nueva</button></div>
    </section>`;
  }
  function cabeza() {
    return `<p class="paso-n" data-sin-traducir>${esc(Tp("Paso {n} de {total}", { n: E.paso, total: PASOS.length }))}</p><h2>${esc(PASOS[E.paso - 1])}</h2>`;
  }
  function pie({ puede = true, siguiente = "Siguiente" } = {}) {
    return `<div class="pz-pie"><button type="button" class="pz-boton" id="atras">Atrás</button>
      <button type="button" class="pz-boton pz-principal" id="siguiente"${puede ? "" : " disabled"}>${esc(siguiente)}</button></div>`;
  }
  function pasoSistemas() {
    const n = E.nueva;
    const grupos = SISTEMAS.map((g) => `<fieldset class="grupo"><legend>${esc(g.grupo)}</legend>${g.ids.map(([id, nombre]) =>
      `<label class="opcion"><input type="checkbox" data-sistema="${id}"${n.plataformas.includes(id) ? " checked" : ""}> <span>${esc(nombre)}</span>${
        id === "android" ? `<small class="suave">${esc("Por hacer: su pieza todavía no existe")}</small>` : ""}</label>`).join("")}</fieldset>`).join("");
    return cabeza() + `<p class="suave">El sistema decide qué piezas sirven. Por eso va primero.</p>${grupos}` + pie({ puede: n.plataformas.length > 0 });
  }
  function pasoIdea() {
    const n = E.nueva;
    return cabeza() + `<label class="pz-campo"><span>Nombre</span><input id="nombre" maxlength="40" value="${esc(n.nombre)}" autocomplete="off"></label>
      <label class="pz-campo"><span>En una frase: qué hace y para quién</span><textarea id="frase" rows="3" maxlength="400">${esc(n.frase)}</textarea></label>`
      + pie({ puede: n.nombre.trim().length > 0 && n.frase.trim().length > 0 });
  }
  function filaPieza(p, marcada, fija) {
    const lista = p.estado === "lista";
    const etiqueta = fija ? "Va siempre" : lista ? "0 tokens: ya está hecha" : "Por hacer";
    return `<label class="pieza${lista ? " hecha" : " por-hacer"}"><input type="checkbox" data-pieza="${esc(p.id)}"${marcada ? " checked" : ""}${fija ? " disabled" : ""}>
      <span class="pieza-texto"><b data-sin-traducir>${esc(p.nombre)}</b><small data-sin-traducir>${esc(p.descripcion)}</small></span>
      <span class="sello${lista ? "" : " sello-falta"}">${lista ? ICONO : ""}${esc(etiqueta)}</span></label>`;
  }
  function pasoPiezas() {
    const n = E.nueva;
    const disponibles = E.catalogo.filter((p) => sirve(p, n.plataformas) && !p.id.startsWith("host-") && p.id !== "esqueleto");
    const porCategoria = {};
    for (const p of disponibles) (porCategoria[p.categoria] ||= []).push(p);
    const bloques = Object.entries(porCategoria).map(([c, ps]) => `<fieldset class="grupo"><legend>${esc(CATEGORIAS[c] || c)}</legend>${
      ps.map((p) => filaPieza(p, p.recomendar.siempre || n.piezas.includes(p.id), p.recomendar.siempre)).join("")}</fieldset>`).join("");
    const hechas = disponibles.filter((p) => p.estado === "lista" && (p.recomendar.siempre || n.piezas.includes(p.id))).length;
    return cabeza() + `<p class="suave">${ICONO} ${esc("Las piezas con este ícono ya están hechas: no gastan tokens. Marcamos las que calzan con tu frase.")}</p>
      <p class="resumen" data-sin-traducir>${esc(Tp("{n} piezas ya hechas", { n: hechas }))}</p>${bloques}` + pie();
  }
  function pasoFicha() {
    const f = E.ficha;
    if (!f) return cabeza() + `<p class="suave">Armando la ficha…</p>`;
    if (!f.ok) return cabeza() + `<p class="pz-error-texto" data-sin-traducir>${esc(f.error || "")}</p>` + pie({ puede: false });
    const nombres = Object.fromEntries(E.catalogo.map((p) => [p.id, p.nombre]));
    const lista = (xs) => `<ul>${xs.map((x) => `<li data-sin-traducir>${x}</li>`).join("")}</ul>`;
    const permisos = Object.entries(f.permisos);
    return cabeza() + `<div class="cifras">
        <p><b>${esc(String(f.hechas))}</b> <span>${esc("piezas ya hechas")}</span></p>
        <p><b>${esc(String(f.por_hacer.length))}</b> <span>${esc("por hacer")}</span></p>
        <p><b data-sin-traducir>~${esc(f.tokens_ahorrados.toLocaleString(i18n.idioma))}</b> <span>${esc("tokens que no gastas")}</span></p></div>
      ${f.por_hacer.length ? `<h3>Por hacer</h3>${lista(f.por_hacer.map((id) => esc(nombres[id] || id)))}` : ""}
      <h3>Pantallas</h3>${lista(f.pantallas.map((x) => `<b>${esc(x.donde)} · ${esc(x.nombre)}</b>: ${esc(x.que)}`))}
      <h3>Permisos</h3>${permisos.length ? permisos.map(([plat, filas]) => `<p class="plataforma" data-sin-traducir>${esc(plat)}</p>${
        lista(filas.map((x) => `<b>${esc(x.clave)}</b>: ${esc(x.por)}`))}`).join("") : `<p class="suave">No pide permisos del sistema.</p>`}
      <h3>Internet</h3>${f.red.length ? lista(f.red.map(esc)) : `<p class="suave">Funciona sin internet.</p>`}
      <h3>Lo que te toca</h3>${lista(f.tareas.map(esc))}
      <p class="suave">Crear la app llega en la próxima versión. Por ahora, la ficha te dice todo lo que tendrá.</p>`
      + `<div class="pz-pie"><button type="button" class="pz-boton" id="atras">Atrás</button>
        <button type="button" class="pz-boton pz-principal" id="crear" disabled>Crear la app</button></div>`;
  }
  function principal() {
    const pasos = [inicio, pasoSistemas, pasoIdea, pasoPiezas, pasoFicha];
    return `<header class="barra"><h1 data-sin-traducir>${esc(NOMBRE)}</h1>
      <button type="button" class="pz-boton" id="abrir-ajustes">Ajustes</button></header>
      <main class="contenido">${pasos[E.paso]()}</main>`;
  }
  function ajustes() {
    const idiomas = [["es", "Español"], ["en", "English"]].map(([c, n]) =>
      `<button type="button" data-idioma="${c}" aria-pressed="${i18n.idioma === c}" lang="${c}" data-sin-traducir>${n}</button>`).join("");
    return `<h3>Idioma</h3><div class="pz-seg" role="group" aria-label="Idioma">${idiomas}</div>
      <h3>Apariencia</h3>${tema.selectorHTML()}
      <h3>Tu IA</h3>${ui.filasIA({ ias: E.ias, elegida: E.config.ia })}
      <h3>Actualizaciones</h3>${ui.filaActualizacion()}
      <h3>Acerca de</h3>${ui.acercaDe({ version: E.version, enlaces: ENLACES })}`;
  }
  function pintar() {
    if (bv.soloIdioma) {   // primer uso: el idioma, solo (sin la app detrás ni avisos)
      raiz.innerHTML = `<div class="pantalla-idioma">${bv.html()}</div>`;
      bv.enfocar();
      return;
    }
    raiz.innerHTML = principal()
      + (bv.activa ? ui.envolver(bv.html(), { id: "t-bv", sinEsc: true }) : "")
      + (E.ajustes ? ui.dialogo({ id: "t-ajustes", titulo: "Ajustes", cuerpo: ajustes(),
        pie: '<button type="button" class="pz-boton pz-principal" data-pz-cerrar>Listo</button>' }) : "")
      + ui.capas();
    i18n.traducirDOM(raiz);
    ui.despuesDePintar();
  }

  // ── Lo que hace la persona ──
  document.addEventListener("click", async (ev) => {
    if (bv.manejarClic(ev) || ui.manejarClic(ev)) return;
    if (tema.manejarClic(ev)) return pintar();
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.id === "abrir-ajustes") { E.ajustes = true; pintar(); }
    else if (b.dataset.idioma) {
      E.config.idioma_ui = b.dataset.idioma;
      host.enviar("config", { idioma_ui: b.dataset.idioma });
      await cargarIdioma(b.dataset.idioma);
      pintar();
    } else if (b.id === "nueva") { E.nueva = nuevaApp(); E.ficha = null; irA(1); }
    else if (b.id === "atras") irA(E.paso - 1);
    else if (b.id === "siguiente") irA(E.paso + 1);
  });
  function irA(paso) {
    const n = E.nueva;
    if (paso === 3 && !n.tocadas.length) n.piezas = sugeridas(n.frase);   // hasta que la persona toque una, las sugeridas
    E.paso = Math.max(0, Math.min(PASOS.length, paso));
    if (E.paso === 4) { E.ficha = null; host.enviar("piezasFicha", { plataformas: n.plataformas, piezas: n.piezas }); }
    pintar();
    const h = raiz.querySelector(".contenido h2");
    if (h) { h.tabIndex = -1; h.focus(); }
  }
  document.addEventListener("change", (ev) => {
    const t = ev.target, n = E.nueva;
    if (t.dataset.sistema) {
      n.plataformas = t.checked ? [...new Set([...n.plataformas, t.dataset.sistema])] : n.plataformas.filter((x) => x !== t.dataset.sistema);
      pintar();
    } else if (t.dataset.pieza) {
      n.tocadas = [...new Set([...n.tocadas, t.dataset.pieza])];
      n.piezas = t.checked ? [...new Set([...n.piezas, t.dataset.pieza])] : n.piezas.filter((x) => x !== t.dataset.pieza);
      pintar();
    }
  });
  document.addEventListener("keydown", (ev) => { if (ui.manejarTecla(ev)) return; bv.manejarTecla(ev); });
  document.addEventListener("input", (ev) => {
    const id = ev.target.id;
    if (id !== "nombre" && id !== "frase") return;
    const antes = !!(E.nueva.nombre.trim() && E.nueva.frase.trim());
    E.nueva[id] = ev.target.value;
    if (antes !== !!(E.nueva.nombre.trim() && E.nueva.frase.trim())) pintar();   // solo cambia «Siguiente»
  });

  // ── Lo que manda la app ──
  host.responder({
    async estado(e) {
      Object.assign(E, { config: e.config || {}, version: e.version || "" });
      await cargarIdioma();
      tema.aplicar(tema.elegir({ config: E.config.tema }));
      ui.actualizacionDisponible(e.actualizacion && e.actualizacion.hay ? e.actualizacion : null, { pintar: false });
      if (!E.iniciada) {
        E.iniciada = true;
        bv.abrir({ config: E.config, forzar: new URLSearchParams(location.search).has("bienvenida") });
        host.enviar("listaIA");
        host.enviar("piezasLista");
      }
      pintar();
    },
    piezasListas(r) {
      if (r && r.ok) E.catalogo = r.piezas || [];
      else toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
    fichaLista(r) { E.ficha = r || { ok: false }; if (E.paso === 4) pintar(); },
    iaLista(r) { E.ias = (r && r.ias) || []; pintar(); },
    iaProbada: (r) => ui.iaProbada(r),
    actualizacionRevisada: (r) => ui.actualizacionRevisada(r, { pintar: !bv.soloIdioma }),
    actualizacionProgreso: (a) => ui.actualizacionProgreso(a),
    // Los menús de la app (host-mac / host-escritorio): «Ajustes…» abre Ajustes (nunca en medio de la bienvenida); «guardar»
    // (al cerrar o salir) no tiene nada pendiente aquí.
    menu(m) { if (m && m.accion === "ajustes" && !bv.activa) { E.ajustes = true; pintar(); } },
    _probar(f) { f(E); pintar(); },
    _pruebas: { ui, bv, i18n, faltantes, E },
  });

  // ── Vista previa en el navegador (datos ficticios de demo.json): c.responder("x", json) hace lo que la app ──
  let DEMO = null, CATALOGO = [];
  // La ficha en la vista previa: lo mismo que bin/piezas.py ficha (las de siempre, el host de cada sistema y lo que requieren).
  function fichaSimulada(d) {
    const todas = Object.fromEntries(CATALOGO.map((p) => [p.id, p]));
    const plats = d.plataformas || [];
    const HOSTS = { mac: "host-tauri", windows: "host-tauri", linux: "host-tauri", ios: "host-ios", android: "host-movil" };
    const ids = [...(d.piezas || []), ...CATALOGO.filter((p) => p.recomendar.siempre && sirve(p, plats)).map((p) => p.id),
      ...plats.map((x) => HOSTS[x]).filter((x) => x && todas[x])];
    for (let i = 0; i < ids.length; i++) for (const r of todas[ids[i]].requiere || []) if (todas[r] && !ids.includes(r)) ids.push(r);
    const piezas = [...new Set(ids)].filter((id) => sirve(todas[id], plats)).map((id) => todas[id]);
    const hechas = piezas.filter((p) => p.estado === "lista");
    const permisos = {};
    for (const p of piezas) for (const [pl, filas] of Object.entries(p.permisos || {})) if (plats.includes(pl)) {
      permisos[pl] ||= [];
      for (const f of filas) if (!permisos[pl].some((x) => JSON.stringify(x) === JSON.stringify(f))) permisos[pl].push(f);
    }
    return { ok: true, plataformas: plats, piezas: piezas.map((p) => p.id), hechas: hechas.length,
      por_hacer: piezas.filter((p) => p.estado !== "lista").map((p) => p.id),
      tokens_ahorrados: Math.floor(hechas.reduce((s, p) => s + (p.bytes || 0), 0) / 4),
      pantallas: piezas.flatMap((p) => (p.pantallas || []).map((f) => ({ ...f, pieza: p.id }))), permisos,
      red: [...new Set(piezas.flatMap((p) => p.red || []))].sort(), tareas: [...new Set(piezas.flatMap((p) => p.tareas_persona || []))] };
  }
  const COMUNES = PiezaHost.simulacionesComunes();
  function simular(accion, d, c) {
    if (!DEMO) return;
    switch (accion) {
      case "listo": return c.responder("estado", DEMO);
      case "config": Object.assign(DEMO.config, d); return;
      case "piezasLista": return c.responder("piezasListas", { ok: true, piezas: CATALOGO });
      case "piezasFicha": return c.luego(200, () => c.responder("fichaLista", fichaSimulada(d)));
      case "listaIA": return c.responder("iaLista", { ias: DEMO.ias, elegida: DEMO.config.ia });
      default: return COMUNES[accion] ? COMUNES[accion](d, c) : undefined;
    }
  }

  async function iniciar() {
    if (host.plataforma === "web") {
      try { DEMO = await (await fetch("demo.json")).json(); } catch { DEMO = { config: {} }; }
      try { CATALOGO = (await (await fetch("demo-catalogo.json")).json()).piezas || []; } catch { CATALOGO = []; }
      // ?bienvenida: el primer uso, desde el idioma.
      if (new URLSearchParams(location.search).has("bienvenida")) DEMO.config.idioma_ui = "";
    }
    host.enviar("listo");
  }
  iniciar();
})();
