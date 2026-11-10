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
  const ENLACES = { sitio: "https://pieza-app.github.io/pieza/", codigo: `https://github.com/${REPO}`, comunidad: `https://github.com/${REPO}/discussions`,
    aportar: `https://github.com/${REPO}/blob/main/CONTRIBUTING.md` };
  const E = { config: {}, version: "", ias: [], ajustes: false, iniciada: false,
    catalogo: [], paso: 0, nueva: nuevaApp(), ficha: null, armando: false,
    proyectos: [], proyecto: null, ocupado: "", error: "", modo: "paso", tope: 200000, parar: false, saltados: new Set(), reparados: {}, divididos: {}, enCurso: [], vivos: {}, abiertos: new Set(), cerrados: new Set(), mejora: null,
    vista: "", apps: null, gh: null, pub: { dueno: "", visibilidad: "publico", explorador: true }, propuesta: { nombre: "", que: "", archivos: "" } };
  // Una app nueva, mientras la persona la arma paso a paso (todavía no se crea nada en el disco).
  function nuevaApp() { return { plataformas: [], nombre: "", frase: "", detalle: "", piezas: [], tocadas: [] }; }
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
    logo: '<img src="pieza.svg" alt="" width="56" height="56">',
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
  const PASOS = ["¿Para qué sistemas?", "¿Qué hace tu app?", "Las piezas", "La ficha", "El plan", "Crear la app", "Paso a paso", "Publícala"];
  const ESTADOS = { pendiente: "Pendiente", listo: "Listo", fallo: "Falló" };
  const miles = (n) => Math.round(n || 0).toLocaleString(i18n.idioma);
  const CATEGORIAS = { base: "Base", plataforma: "Plataforma", interfaz: "Interfaz", ia: "IA", datos: "Datos", conexiones: "Conexiones",
    medios: "Medios", repo: "El repo" };
  // El nombre y la descripción de una pieza en el idioma elegido (pieza.json → "en"; si no lo trae, el español).
  const enIdioma = (p, campo) => (i18n.idioma === "en" && p.en && typeof p.en[campo] === "string" ? p.en[campo] : p[campo]) || "";
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

  // El inicio: una frase basta para empezar; debajo, las apps empezadas («Seguir donde quedaste») y algunas hechas con Pieza.
  function inicio() {
    const tarjetas = E.proyectos.map((p) => {
      const listos = (p.pasos || []).filter((x) => x.estado === "listo").length, total = (p.pasos || []).length;
      const pct = total ? Math.round(listos * 100 / total) : 0;
      const estado = p.estado === "plan" ? Tp("Plan listo") : total && listos === total ? Tp("Lista") : p.estado === "nuevo" ? Tp("Empezada") : Tp("En construcción");
      const menu = E.menuApp === p.id ? `<div class="menu-app" role="menu">
        <button type="button" role="menuitem" data-seguir="${esc(p.id)}">${esc("Seguir")}</button>
        <button type="button" role="menuitem" data-quitar="${esc(p.id)}">${esc("Quitar de la lista")}</button>
        <button type="button" role="menuitem" class="peligro" data-borrar="${esc(p.id)}">${esc("Borrar la app…")}</button></div>` : "";
      return `<li class="tarjeta-app">
        <div class="tarjeta-cabeza"><button type="button" class="tarjeta-nombre" data-seguir="${esc(p.id)}" data-sin-traducir>${esc(p.nombre)}</button>
          <span class="chip-estado${total && listos === total ? " chip-ok" : ""}" data-sin-traducir>${esc(estado)}</span>
          <button type="button" class="boton-icono" data-menu-app="${esc(p.id)}" aria-expanded="${E.menuApp === p.id}" aria-label="${esc(Tp("Más acciones de {app}", { app: p.nombre }))}" data-sin-traducir>⋯</button></div>
        <span class="suave" data-sin-traducir>${esc(total ? Tp("{n} de {total} pasos listos", { n: listos, total }) : Tp("Sin plan todavía"))}</span>
        <progress class="barra-avance" max="100" value="${pct}" aria-hidden="true"></progress>${menu}</li>`;
    }).join("");
    return `<section class="inicio">
      <h2>¿Qué quieres crear hoy?</h2>
      <p class="suave">Cuéntalo en una frase. Pieza arma tu app paso a paso con piezas ya hechas, y lo que ya existe no gasta tokens de tu IA.</p>
      <div class="caja-idea">
        <label for="frase-rapida" class="etiqueta">Tu idea</label>
        <textarea id="frase-rapida" rows="2" maxlength="400" placeholder="Por ejemplo: guarda mis recetas y arma la lista de compras de la semana">${esc(E.fraseRapida || "")}</textarea>
        <div class="caja-idea-pie"><button type="button" class="pz-boton" id="explorar">Explorar apps hechas con Pieza</button>
          <button type="button" class="pz-boton pz-principal" id="nueva">Empezar</button></div>
      </div>
      ${tarjetas ? `<h3>Seguir donde quedaste</h3><ul class="proyectos">${tarjetas}</ul>` : ""}
    </section>`;
  }
  // La barra lateral: siempre a mano «App nueva», tus apps, el explorador, tu IA y Ajustes. En el celular queda arriba.
  function lateral() {
    const apps = E.proyectos.slice(0, 8).map((p) => `<li><button type="button" data-seguir="${esc(p.id)}"${E.proyecto && E.proyecto.id === p.id ? ' aria-current="true"' : ""}>
      <span class="punto${(p.pasos || []).length && (p.pasos || []).every((x) => x.estado === "listo") ? " punto-ok" : ""}"></span><span data-sin-traducir>${esc(p.nombre)}</span></button></li>`).join("");
    const ia = (E.ias || []).find((x) => x.id === E.config.ia);
    return `<nav class="lateral" aria-label="Principal">
      <button type="button" class="marca" id="ir-inicio"><img src="pieza.svg" alt="" width="28" height="28"><span data-sin-traducir>${esc(NOMBRE)}</span></button>
      <button type="button" class="pz-boton pz-principal" id="app-nueva">App nueva</button>
      ${apps ? `<p class="lateral-titulo">Tus apps</p><ul class="lateral-apps">${apps}</ul>` : ""}
      <button type="button" class="lateral-enlace" id="explorar-lateral">Explorar apps</button>
      <div class="lateral-pie">
        <button type="button" class="lateral-ia" id="ia-lateral"><small>Tu IA</small><span data-sin-traducir>${esc(ia ? ia.nombre || ia.id : Tp("Elegir mi IA"))}</span></button>
        <button type="button" class="lateral-enlace" id="abrir-ajustes">Ajustes</button>
      </div></nav>`;
  }
  // Lo que se gasta y lo que se ahorra: siempre a la vista desde el plan.
  function medidor(p) {
    const estimado = (p.pasos || []).reduce((s, x) => s + (x.tokens || 0), 0);
    return `<dl class="medidor panel-cifras">
      <div><dt>${esc("tokens gastados")}</dt><dd data-sin-traducir>~${esc(miles(p.gastado))}</dd></div>
      <div><dt>${esc("estimado del plan")}</dt><dd data-sin-traducir>~${esc(miles(estimado))}</dd></div>
      <div class="ahorro"><dt>${esc("ahorrados con piezas")}</dt><dd data-sin-traducir>${ICONO}~${esc(miles(p.ahorro))}</dd></div></dl>`;
  }
  // El explorador: las apps públicas con el topic «hecho-con-pieza» (las lista la página de Pieza).
  function explorar() {
    const apps = E.apps;
    const filas = !apps ? trabajando("Buscando apps…") : !apps.length ? `<p class="suave">Todavía no hay apps en el explorador.</p>`
      : `<ul class="apps">${apps.map((a) => `<li class="pz-vidrio"><b data-sin-traducir>${esc(a.nombre)}</b>
        ${a.revisada ? `<span class="chip-estado">${esc("Revisada")}</span>` : ""}
        <span class="suave" data-sin-traducir>${esc(a.descripcion)}</span>
        <span class="enlaces"><button type="button" class="pz-enlace" data-abrir="https://github.com/${esc(a.repo)}">Código</button>${
          a.pagina ? `<button type="button" class="pz-enlace" data-abrir="${esc(a.pagina)}">Página</button>` : ""}</span></li>`).join("")}</ul>`;
    return `<h2>Apps hechas con Pieza</h2>
      <p class="suave">Aparecen solas: cada persona elige sumarse al publicar su app. Nadie da permisos a nadie.</p>
      ${errorHTML()}${filas}<div class="pz-pie"><button type="button" class="pz-boton" id="inicio">Volver al inicio</button></div>`;
  }
  // Publicar: una etapa guiada. 1) GitHub conectado (gh instalado y con sesión: Pieza lo instala y conecta con un código que se
  // pega en GitHub), 2) dónde (tu cuenta o una organización, con la guía para crearla), 3) cómo (pública o privada, explorador).
  // Al publicar, GitHub arma la página y las descargas para Mac, Windows y Linux.
  function tarjetaPub(n, titulo, hecho, cuerpo, activa = true) {
    return `<section class="pub-paso${hecho ? " hecho" : ""}${activa ? "" : " inactiva"}"><header><span class="fila-n">${hecho ? "✓" : n}</span><h3>${esc(titulo)}</h3></header>
      ${activa ? `<div class="pub-cuerpo">${cuerpo}</div>` : ""}</section>`;
  }
  function conexionHTML() {
    const g = E.gh;
    if (E.ocupado === "revisar" && !g) return trabajando("Revisando GitHub en tu computador…");
    if (!g) return `<button type="button" class="pz-boton" id="revisar-publicar">Revisar mi GitHub</button>`;
    if (g.sesion) return `<p data-sin-traducir>${esc(Tp("Conectado como @{usuario}.", { usuario: g.usuario }))}</p>`;
    if (E.ocupado === "instalar") return trabajando("Instalando GitHub CLI… puede tardar unos minutos.");
    if (!g.gh) return `<p class="suave">${esc("Pieza publica con GitHub CLI, la herramienta oficial de GitHub, y con tu cuenta. Pieza no guarda tu clave.")}</p>
      ${g.guia ? `<ol class="suave"><li>${esc("Bájalo desde cli.github.com e instálalo.")}</li><li>${esc("Vuelve aquí y toca «Ya lo instalé».")}</li></ol>
        <div class="acciones-fallo"><button type="button" class="pz-boton pz-principal" data-abrir="https://cli.github.com/">Abrir cli.github.com</button>
        <button type="button" class="pz-boton" id="revisar-publicar">Ya lo instalé</button></div>`
        : `<div class="acciones-fallo"><button type="button" class="pz-boton pz-principal" id="instalar-gh"${E.ocupado ? " disabled" : ""}>Instalar GitHub CLI</button></div>`}`;
    if (E.ocupado === "conectar") {
      const c = E.codigoGH;
      return c ? `<p>${esc("Pega este código en GitHub y autoriza a GitHub CLI:")}</p>
        <p class="codigo-gh" data-sin-traducir>${esc(c.codigo)}</p>
        <div class="acciones-fallo"><button type="button" class="pz-boton pz-principal" data-abrir="https://github.com/login/device">Abrir GitHub</button>
        <button type="button" class="pz-boton" id="copiar-codigo">Copiar el código</button></div>
        ${trabajando("Esperando que autorices en GitHub…")}` : trabajando("Pidiendo un código a GitHub…");
    }
    return `<p class="suave">${esc("Conéctalo con tu cuenta: GitHub te da un código, lo pegas en su página y listo. Sin terminal.")}</p>
      <div class="acciones-fallo"><button type="button" class="pz-boton pz-principal" id="conectar-gh"${E.ocupado ? " disabled" : ""}>Conectar mi GitHub</button></div>`;
  }
  // La revisión antes de subir (publicar.py preparar): secretos bloquean, datos personales se confirman, y se ve qué hace la app.
  function pedirRevisionSubida() { E.subida = null; E.ocupado = "preparar"; host.enviar("publicarPreparar", { id: E.proyecto.id }); }
  function subidaOk() {
    const r = E.subida;
    return !!r && !(r.secretos || []).length && (!(r.personales || []).length || E.pub.datosOk);
  }
  function subidaHTML() {
    const r = E.subida;
    if (!r) return trabajando("Revisando lo que se va a subir…");
    const linea = (x) => `<li data-sin-traducir>${esc(x.archivo)}${x.linea ? `:${esc(String(x.linea))}` : ""} · ${esc(Tp(x.tipo))}${x.muestra ? ` · «${esc(x.muestra)}»` : ""}</li>`;
    return `<ul class="revision-subida">
      ${(r.secretos || []).length ? `<li class="mal"><b>${esc("Encontré secretos. Sácalos de tu app antes de publicar:")}</b><ul>${r.secretos.map(linea).join("")}</ul>
        <button type="button" class="pz-boton" id="revisar-subida">Ya los saqué: revisar de nuevo</button></li>`
        : `<li class="bien">${esc("Sin secretos: ni llaves, ni tokens, ni contraseñas.")}</li>`}
      ${(r.personales || []).length ? `<li class="ojo"><b>${esc("Encontré datos que parecen personales:")}</b><ul>${r.personales.map(linea).join("")}</ul>
        <label class="opcion"><input type="checkbox" id="datos-ok"${E.pub.datosOk ? " checked" : ""}> <span>${esc("Son datos de ejemplo, no son reales")}</span></label></li>`
        : `<li class="bien">${esc("Sin datos personales a la vista (RUT, correos, teléfonos, rutas de tu computador).")}</li>`}
      <li>${(r.dominios || []).length ? `<span data-sin-traducir>${esc(Tp("Tu app se conecta a: {lista}", { lista: r.dominios.join(", ") }))}</span>` : esc("Tu app no se conecta a internet.")}</li>
      <li>${(r.comandos || []).length ? `<span data-sin-traducir>${esc(Tp("Tu app corre comandos en el computador ({lista}).", { lista: r.comandos.join(", ") }))}</span>` : esc("Tu app no corre comandos en el computador.")}</li>
      </ul>
      <details><summary data-sin-traducir>${esc(Tp("Se suben {n} archivos", { n: (r.archivos || []).length }))}</summary><p class="archivos" data-sin-traducir>${esc((r.archivos || []).join(", "))}</p></details>
      <p class="suave">${esc("Firmada quiere decir que la versión viene de ti, no que sea segura. Por eso revisas esto antes.")}</p>`;
  }
  function pasoPublicar() {
    const p = E.proyecto;
    if (!p) return marcoPaso("", {});
    const faltan = (p.pasos || []).filter((x) => x.estado !== "listo").length;
    if (p.repo) {
      const enlaces = [["Ver el repositorio", `https://github.com/${p.repo}`], p.pagina ? ["Ver la página", p.pagina] : null,
        ["Descargas", `https://github.com/${p.repo}/releases`], ["Cómo va la armada", `https://github.com/${p.repo}/actions`]].filter(Boolean);
      return marcoPaso(`<section class="listo publicar"><h3>Publicada</h3>
        <p class="suave">${esc("GitHub está armando la página y las descargas para Mac, Windows y Linux. Tarda unos 15 minutos.")}</p>
        <div class="enlaces-pub">${enlaces.map(([t, u]) => `<button type="button" class="pz-boton" data-abrir="${esc(u)}">${esc(t)}</button>`).join("")}</div>
        <p class="suave" data-sin-traducir>${esc(p.explorador ? Tp("Aparece en el explorador de Pieza.") : Tp("No aparece en el explorador de Pieza."))}</p></section>
        <section class="proponer">${proponerHTML()}</section>`,
        { acciones: `<button type="button" class="pz-boton pz-principal" data-abrir="https://github.com/${esc(p.repo)}">Abrir en GitHub</button>
          <button type="button" class="pz-boton pz-plano" id="inicio">Volver al inicio</button>` });
    }
    const g = E.gh || {};
    const pub = E.pub;
    const org = pub.orgNueva || `${p.id}-app`;
    const nueva = pub.dueno === "__nueva__";
    const conectado = !!g.sesion;
    const duenos = (g.duenos || []).map((d) => `<label class="opcion"><input type="radio" name="dueno" data-dueno="${esc(d)}"${pub.dueno === d ? " checked" : ""}> <span data-sin-traducir>${esc(d)}/${esc(p.id)}</span></label>`).join("")
      + `<label class="opcion"><input type="radio" name="dueno" data-dueno="__nueva__"${nueva ? " checked" : ""}> <span>${esc("En una organización nueva")}</span></label>`
      + (nueva ? `<div class="guia-org">
        <label class="pz-campo"><span>Nombre de la organización</span><input id="org-nueva" maxlength="39" value="${esc(org)}" autocomplete="off"></label>
        <ol><li>${esc("Toca «Abrir GitHub» y escribe ese nombre.")}</li><li>${esc("Elige el plan gratis y toca «Create organization».")}</li><li>${esc("Vuelve aquí y toca «Ya la creé: revisar».")}</li></ol>
        <div class="acciones-fallo"><button type="button" class="pz-boton" data-abrir="https://github.com/account/organizations/new?plan=free">Abrir GitHub</button>
        <button type="button" class="pz-boton pz-principal" id="revisar-publicar">Ya la creé: revisar</button></div></div>` : "");
    const vis = [["publico", "Pública: cualquiera la ve, la baja y la usa"], ["privado", "Privada: solo tú (sin página ni explorador)"]].map(([v, n]) =>
      `<label class="opcion"><input type="radio" name="vis" data-vis="${v}"${pub.visibilidad === v ? " checked" : ""}> <span>${esc(n)}</span></label>`).join("")
      + `<label class="opcion"><input type="checkbox" id="explorador"${pub.explorador && pub.visibilidad === "publico" ? " checked" : ""}${pub.visibilidad === "publico" ? "" : " disabled"}> <span>${esc("Sumarla al explorador de Pieza (topic «hecho-con-pieza»)")}</span></label>`;
    const donde = conectado && pub.dueno && !nueva;
    const pagina = pub.dueno && !nueva ? `https://${pub.dueno.toLowerCase()}.github.io/${p.id}/` : "";
    const principal = (faltan ? `<p class="aviso-pasos">${esc(Tp("A tu app le faltan {n} pasos. Termínalos antes de publicarla.", { n: faltan }))}</p>` : "") + errorHTML()
      + tarjetaPub(1, "Conecta tu GitHub", conectado, conexionHTML())
      + tarjetaPub(2, "Dónde vive tu app", donde, `<fieldset class="grupo sin-borde">${duenos}</fieldset>`, conectado)
      + tarjetaPub(3, "Cómo la publicas", false, `<fieldset class="grupo sin-borde">${vis}</fieldset>`, conectado)
      + tarjetaPub(4, "Revisión antes de subir", subidaOk(), subidaHTML(), donde)
      + (E.ocupado === "publicar" ? trabajando("Publicando…") : "");
    if (donde && !E.subida && !E.ocupado) pedirRevisionSubida();
    const lado = `<div class="panel-bloque"><p class="etiqueta">Lo que se publica</p><ul class="se-publica">
        <li>${esc("El código de tu app, revisado: sin nombres, correos ni rutas reales.")}</li>
        ${pub.visibilidad === "publico" ? `<li data-sin-traducir>${esc(pagina ? Tp("Su página web: {url}", { url: pagina }) : Tp("Su página web, en GitHub Pages."))}</li>` : ""}
        <li>${esc("Las descargas para Mac, Windows y Linux, que arma GitHub solo (unos 15 minutos).")}</li>
        <li>${esc("Las actualizaciones: cada versión nueva llega sola a quien la instaló.")}</li></ul></div>`;
    const ahora = faltan ? "Termina los pasos de tu app antes de publicarla." : !conectado ? "Conecta tu GitHub: es una sola vez."
      : !donde ? "Elige dónde va a vivir tu app." : !E.subida ? "Espera: estoy revisando lo que se va a subir."
      : (E.subida.secretos || []).length ? "Hay secretos en tu app: sácalos y revisa de nuevo." : !subidaOk() ? "Confirma que los datos personales que encontré son de ejemplo."
      : "Todo revisado. Toca «Publicar».";
    return marcoPaso(principal, { lado, ahora, acciones: `<button type="button" class="pz-boton pz-principal" id="publicar"${donde && !faltan && !E.ocupado && subidaOk() ? "" : " disabled"}>Publicar</button>
      <button type="button" class="pz-boton pz-plano" id="atras"${E.ocupado ? " disabled" : ""}>Atrás</button>` });
  }
  // Proponer una pieza: abre un issue prellenado en pieza-app/pieza (en el navegador, con la cuenta de la persona).
  function proponerHTML() {
    const x = E.propuesta;
    return `<h3>¿Algo de tu app le sirve a otras?</h3>
      <p class="suave">Propónlo como pieza. Así la próxima app no gasta tokens en hacerlo de nuevo.</p>
      <label class="pz-campo"><span>Nombre de la pieza</span><input id="pz-nombre" maxlength="60" value="${esc(x.nombre)}"></label>
      <label class="pz-campo"><span>Qué resuelve</span><textarea id="pz-que" rows="2" maxlength="500">${esc(x.que)}</textarea></label>
      <label class="pz-campo"><span>Archivos de tu app que la forman</span><input id="pz-archivos" maxlength="300" value="${esc(x.archivos)}" placeholder="bin/recetas.py, ui/recetas.js"></label>
      <div class="pz-pie"><button type="button" class="pz-boton" id="proponer"${x.nombre.trim() && x.que.trim() ? "" : " disabled"}>Proponer en GitHub</button></div>`;
  }
  // En vivo: cuánto lleva, en qué fase va y qué archivos lee y escribe la IA (eventos de la acción, `pasoAvance`).
  function vivoHTML(n) {
    const v = E.vivos[n] || {};
    const min = Math.max(0, Math.floor((Date.now() - (v.inicio || Date.now())) / 60000));
    const fase = v.fase === "pruebas" ? Tp("Corriendo las pruebas…") : v.intento > 1 ? Tp("Segundo intento: tu IA arregla lo que falló…")
      : Tp("Tu IA está en este paso…");
    const escritos = [...(v.escritos || [])].slice(-6);
    return `<div class="vivo" role="status"><p class="trabajando"><span class="pz-giro" aria-hidden="true"></span>
      <span data-sin-traducir>${esc(fase)} · ${esc(Tp("{n} min", { n: min }))}</span></p>
      ${v.leyendo ? `<p class="suave" data-sin-traducir>${esc(Tp("Leyendo {ruta}", { ruta: v.leyendo }))}</p>` : ""}
      ${escritos.length ? `<p class="suave" data-sin-traducir>${esc(Tp("Escribió: {lista}", { lista: escritos.join(", ") }))}</p>` : ""}</div>`;
  }
  // La consola en vivo: lo que tu IA lee y escribe en el paso actual (o un resumen si no hay nada corriendo).
  function consolaHTML() {
    const vivos = E.ocupado === "paso" ? E.enCurso.map((n) => [n, E.vivos[n] || {}]) : [];
    if (!vivos.length) {
      // Sin nada corriendo: lo que hizo la última vez (el paso que falló o el último que corrió).
      const pasos = (E.proyecto && E.proyecto.pasos) || [];
      let i = pasos.findIndex((x) => x.estado === "fallo" && (x.registro || []).length);
      if (i < 0) for (let j = pasos.length - 1; j >= 0; j--) if ((pasos[j].registro || []).length) { i = j; break; }
      if (i < 0) return `<div class="consola"><p class="consola-titulo">En vivo</p><p class="consola-linea">${esc("Aquí ves lo que lee y escribe tu IA mientras trabaja.")}</p></div>`;
      return `<div class="consola" role="log"><p class="consola-titulo" data-sin-traducir>${esc(Tp("La última vez · paso {n}", { n: i + 1 }))}</p>${pasos[i].registro.slice(-12).map((r) =>
        `<p class="consola-linea"><span class="consola-${esc(r.t)}">${esc(QUE_HIZO[r.t] || r.t)}</span><span data-sin-traducir>${esc(r.ruta)}</span></p>`).join("")}</div>`;
    }
    const lineas = [];
    for (const [n, v] of vivos) {
      const quien = vivos.length > 1 ? Tp("paso {n}", { n: n + 1 }) + " · " : "";
      if (v.leyendo) lineas.push(["lee", quien + v.leyendo]);
      for (const r of [...(v.escritos || [])].slice(-8 / vivos.length)) lineas.push(["escribe", quien + r]);
      if (v.fase === "pruebas") lineas.push(["prueba", Tp("Corriendo las pruebas…")]);
    }
    return `<div class="consola" role="log"><p class="consola-titulo" data-sin-traducir>${esc(vivos.length > 1 ? Tp("En vivo · {n} pasos a la vez", { n: vivos.length }) : Tp("En vivo"))}</p>${lineas.map(([t, x]) =>
      `<p class="consola-linea"><span class="consola-${t}">${QUE_HIZO[t]}</span><span data-sin-traducir>${esc(x)}</span></p>`).join("")}</div>`;
  }
  function trabajando(texto) {
    return `<p class="trabajando" role="status"><span class="pz-giro" aria-hidden="true"></span> <span>${esc(texto)}</span></p>`;
  }
  function errorHTML() {
    return E.error ? `<p class="pz-error-texto" role="alert" data-sin-traducir>${esc(E.error)}</p>` : "";
  }
  function sinIA() {
    return E.config.ia ? "" : `<p class="aviso-ia">${esc("Para este paso necesitas tu IA (Claude Code, Codex o Gemini).")}
      <button type="button" class="pz-boton" id="elegir-ia">Elegir mi IA</button></p>`;
  }
  // Un paso del plan, colapsado: número, título y tokens; al abrirlo, qué hace, qué deja listo y de qué depende.
  function filaPlan(p, x, i) {
    const dep = depende(p, i);
    return `<li><details data-abierto="plan:${i}"${E.abiertos.has(`plan:${i}`) ? " open" : ""}><summary>
      <span class="fila-n">${String(i + 1).padStart(2, "0")}</span><span class="fila-titulo" data-sin-traducir>${esc(x.titulo)}</span>
      ${dep.length ? `<span class="fila-usa" data-sin-traducir>${esc(Tp("usa {lista}", { lista: dep.map((d) => d + 1).join(", ") }))}</span>` : ""}
      <span class="fila-meta" data-sin-traducir>${esc(Tp("~{n} tokens", { n: miles(x.tokens) }))}</span></summary>
      <div class="fila-cuerpo"><p data-sin-traducir>${esc(x.que)}</p>
      ${x.entrega ? `<p class="suave"><span class="etiqueta">Deja listo</span> <span data-sin-traducir>${esc(x.entrega)}</span></p>` : ""}
      ${(x.archivos || []).length ? `<p class="archivos" data-sin-traducir>${esc(x.archivos.join(", "))}</p>` : ""}</div></details></li>`;
  }
  // El plan se mejora solo: 1) tu IA arma el plan, 2) tres revisores nuevos lo leen a ciegas, 3) Pieza aplica lo grave e importante
  // y rehace el plan. Se ve como tres etapas; al final, qué se corrigió y lo menor, para sumarlo si la persona quiere.
  const FASES_MEJORA = [["plan", "Tu IA arma el plan"], ["revisar", "3 revisores lo revisan a ciegas"], ["corregir", "Pieza corrige y lo mejora"]];
  function mejoraHTML() {
    const m = E.mejora;
    if (!m) return "";
    const i = m.fase === "listo" ? 3 : FASES_MEJORA.findIndex(([f]) => f === m.fase);
    return `<ol class="mejora" aria-label="${esc("Cómo se mejora el plan")}">${FASES_MEJORA.map(([, t], j) =>
      `<li class="${j < i ? "hecha" : j === i ? "actual" : ""}"><span class="mejora-n">${j < i ? "✓" : j === i && E.ocupado ? `<span class="pz-giro" aria-hidden="true"></span>` : j + 1}</span><span>${esc(t)}</span></li>`).join("")}</ol>`;
  }
  function mejoradoHTML(p) {
    const m = E.mejora, acuerdos = p.acuerdos || [];
    if (m && m.fase !== "listo") return "";
    const opcionales = (m && m.opcionales) || [];
    const elegidos = E.aceptados || [];
    return `<section class="plan-mejorado"><p class="plan-mejorado-titulo" data-sin-traducir>${esc(acuerdos.length ? Tp("Plan mejorado: {n} correcciones aplicadas", { n: acuerdos.length }) : Tp("Plan revisado: los revisores no encontraron nada grave"))}</p>
      ${acuerdos.length ? `<details data-cerrable="corregido"${E.cerrados.has("corregido") ? "" : " open"}><summary>${esc("Qué se corrigió")}</summary><ul class="corregido">${acuerdos.map((a) => `<li data-sin-traducir>${esc(a)}</li>`).join("")}</ul></details>` : ""}
      ${opcionales.length ? `<details data-abierto="opcionales:0"${E.abiertos.has("opcionales:0") ? " open" : ""}><summary data-sin-traducir>${esc(Tp("{n} sugerencias menores (opcionales)", { n: opcionales.length }))}</summary><ul class="hallazgos">${opcionales.map((h) =>
        `<li><label><input type="checkbox" data-hallazgo="${esc(h.id)}"${elegidos.includes(h.id) ? " checked" : ""}${E.ocupado ? " disabled" : ""}><span><b data-sin-traducir>${esc(h.problema)}</b><span class="suave" data-sin-traducir>${esc(h.propuesta)}</span></span></label></li>`).join("")}</ul>
        <button type="button" class="pz-boton" id="sumar-opcionales"${E.ocupado || !elegidos.length ? " disabled" : ""}>${esc("Sumarlas y mejorar el plan")}</button></details>` : ""}</section>`;
  }
  function pasoPlan() {
    const p = E.proyecto;
    const listo = p && p.pasos && p.pasos.length;
    const mejorando = E.mejora && E.mejora.fase !== "listo" && E.ocupado;
    const principal = mejoraHTML() + (listo && !mejorando ? mejoradoHTML(p) : "")
      + (listo ? `<div class="lista-cabeza"><p class="suave" data-sin-traducir>${esc(Tp("{n} pasos · toca uno para ver qué hace", { n: p.pasos.length }))}</p>
        <button type="button" class="pz-plano" id="abrir-todo" data-que="plan">${esc(abiertos("plan") ? "Cerrar todos" : "Abrir todos")}</button></div>
        ${E.mejora ? "" : revisionHTML(p)}<ol class="filas plan${mejorando ? " atenuado" : ""}">${p.pasos.map((x, i) => filaPlan(p, x, i)).join("")}</ol>`
      : E.ocupado ? "" : `<div class="vacio-paso"><p>${esc("Tu IA divide lo propio de tu app en pasos chicos. Después, tres revisores nuevos lo leen a ciegas y Pieza corrige lo que encuentren. Las piezas ya hechas no entran al plan.")}</p></div>`);
    const ahora = mejorando ? "Espera un momento: Pieza está armando y mejorando el plan." : !listo ? "Toca «Hacer el plan». Tu IA lo arma y Pieza lo revisa y lo corrige sola."
      : creada() ? "Revisa el plan y toca «Ir a construir»." : "Revisa el plan mejorado y toca Siguiente.";
    const acciones = (listo ? `<button type="button" class="pz-boton pz-principal" id="siguiente"${E.ocupado ? " disabled" : ""}>${esc(creada() ? "Ir a construir" : "Siguiente")}</button>` : "")
      + `<button type="button" class="pz-boton${listo ? "" : " pz-principal"}" id="hacer-plan"${E.ocupado || !E.config.ia ? " disabled" : ""}>${
        esc(!listo ? "Hacer el plan" : creada() ? "Rehacer lo que falta" : "Rehacer el plan")}</button>
      ${listo ? `<button type="button" class="pz-boton" id="revisar"${E.ocupado || !E.config.ia ? " disabled" : ""}>${esc("Revisar de nuevo")}</button>` : ""}
      <button type="button" class="pz-boton pz-plano" id="atras"${E.ocupado ? " disabled" : ""}>Atrás</button>`;
    const lado = listo ? medidor(p) + (creada() ? `<p class="panel-nota">${esc("La app ya está creada. «Rehacer lo que falta» deja los pasos listos y planifica de nuevo el resto, con pasos más chicos.")}</p>` : "") : "";
    return marcoPaso(sinIA() + errorHTML() + principal, { acciones, lado, ahora });
  }
  // Revisar a ciegas (elefante y pez dorado): 3 sesiones nuevas de tu IA leen solo la idea y el plan, y buscan fallas.
  const ENFOQUES = { riesgos: "Riesgos y seguridad", uso: "Uso", pasos: "Plan" };
  const GRAVEDAD = { alta: "Grave", media: "Importante", baja: "Menor" };
  function revisionHTML(p) {
    const r = p.revision;
    if (!r) return "";
    if (!r.hallazgos.length) return `<section class="revision"><p class="suave">${esc("Los revisores no encontraron fallas.")}</p></section>`;
    const elegidos = E.aceptados || [];
    const filas = r.hallazgos.map((h) => `<li class="gravedad-${esc(h.gravedad)}"><label>
      <input type="checkbox" data-hallazgo="${esc(h.id)}"${elegidos.includes(h.id) ? " checked" : ""}${E.ocupado ? " disabled" : ""}>
      <span><small class="chip-estado">${esc(GRAVEDAD[h.gravedad] || h.gravedad)} · ${esc(ENFOQUES[h.enfoque] || h.enfoque)}</small>
      <b data-sin-traducir>${esc(h.problema)}</b><span class="suave" data-sin-traducir>${esc(h.propuesta)}</span></span></label></li>`).join("");
    const n = elegidos.length;
    return `<details class="revision" data-cerrable="revision"${E.cerrados.has("revision") ? "" : " open"}>
      <summary><span class="fila-titulo" data-sin-traducir>${esc(Tp("Revisión a ciegas: {n} hallazgos", { n: r.hallazgos.length }))}</span></summary>
      <p class="suave">${esc("Marca los cambios que quieres y rehaz el plan con ellos.")}</p><ul class="hallazgos">${filas}</ul>
      <button type="button" class="pz-boton pz-principal" id="rehacer-con"${E.ocupado || !n ? " disabled" : ""} data-sin-traducir>${
        esc(Tp("Rehacer el plan con {n} cambios", { n }))}</button></details>`;
  }
  // La app ya tiene su carpeta (se creó): sus piezas ya están, el plan solo cambia lo que falta.
  function creada() { return !!(E.proyecto && E.proyecto.carpeta && ["creado", "pasos"].includes(E.proyecto.estado)); }
  function pasoCrear() {
    const p = E.proyecto;
    if (creada()) return marcoPaso(`<div class="vacio-paso"><p data-sin-traducir>${esc(Tp("La app «{nombre}» ya está creada en tu carpeta. Sigue con sus pasos.", { nombre: p.nombre }))}</p>
      <p><code data-sin-traducir>${esc(p.carpeta)}</code></p></div>`, { lado: medidor(p), acciones: `<button type="button" class="pz-boton pz-principal" id="ir-construir">Ir a construir</button>
      <button type="button" class="pz-boton pz-plano" id="atras">Atrás</button>` });
    const principal = `<div class="vacio-paso"><p data-sin-traducir>${esc(Tp("Pieza arma la app «{nombre}» con {n} piezas ya hechas, en la carpeta Pieza de tu usuario. No gasta tokens.",
      { nombre: p.nombre, n: (E.ficha && E.ficha.hechas) || 0 }))}</p></div>` + errorHTML() + (E.ocupado === "crear" ? trabajando("Armando la app…") : "");
    return marcoPaso(principal, { ahora: "Toca «Crear la app». Pieza copia las piezas: no gasta tokens.", lado: medidor(p), acciones: `<button type="button" class="pz-boton pz-principal" id="crear"${E.ocupado ? " disabled" : ""}>Crear la app</button>
      <button type="button" class="pz-boton pz-plano" id="atras">Atrás</button>` });
  }
  // Por qué no quedó un paso, en palabras de persona (la causa la anota proyectos.py; el error técnico va aparte).
  const CAUSAS = {
    pruebas: "Las pruebas de la app no pasaron en ninguno de los dos intentos.",
    ia: "Tu IA no terminó el paso: se cortó, llegó a su límite o no está lista.",
    respuesta: "La respuesta de tu IA no se pudo usar.",
    acciones: "Las acciones nuevas de app.json no se pudieron armar.",
    gasto: "Este paso ya gastó más de 3 veces lo estimado. Me detuve para que tú decidas: arreglarlo, dividirlo o saltarlo.",
  };
  const QUE_HIZO = { lee: "lee", escribe: "escribe", prueba: "prueba" };
  // El próximo paso por hacer: el primero que no está listo y que la persona no saltó.
  function proximo(p) { return p.pasos.findIndex((x, i) => x.estado !== "listo" && !E.saltados.has(i)); }
  // De qué pasos depende uno (un plan de antes no lo dice: del anterior). Igual que proyectos.dependencias.
  function depende(p, i) {
    const d = p.pasos[i].depende;
    return Array.isArray(d) ? d.filter((j) => Number.isInteger(j) && j >= 0 && j < i) : i > 0 ? [i - 1] : [];
  }
  const SIN_CONTAR = ["ui/idiomas/", "CHANGELOG.md", "AGENTS.md", "README.md", "pruebas/"];
  // Los pasos que se pueden hacer ahora y a la vez (como proyectos.listos_para_lote): todo lo que usan está listo y no comparten
  // archivos propios. Solo con una IA que edita la carpeta (Claude o Codex).
  function paraLote(p) {
    const elegidos = [], tocados = new Set();
    p.pasos.forEach((x, i) => {
      if (elegidos.length >= 3 || x.estado === "listo" || E.saltados.has(i)) return;
      if (depende(p, i).some((d) => p.pasos[d].estado !== "listo")) return;
      const propios = (x.archivos || []).filter((a) => !SIN_CONTAR.some((s) => a.startsWith(s)));
      if (propios.some((a) => tocados.has(a)) || (!propios.length && elegidos.length)) return;
      elegidos.push(i); propios.forEach((a) => tocados.add(a));
    });
    return elegidos;
  }
  const EDITAN = ["claude", "codex"];
  // Todo automático: el próximo trabajo. Varios pasos a la vez si se puede; si no, el próximo paso.
  function seguirAuto() {
    const p = E.proyecto;
    if (p.gastado >= E.tope) { E.error = Tp("Me detuve: llegaste al tope de {n} tokens.", { n: miles(E.tope) }); return false; }
    const lote = EDITAN.includes(E.config.ia) ? paraLote(p).filter((i) => p.pasos[i].estado !== "fallo") : [];
    if (lote.length > 1) { hacerLote(lote); return true; }
    const sig = proximo(p);
    if (sig < 0) return false;
    hacerPaso(sig);
    return true;
  }
  function detallePaso(x) {
    const intentos = (x.historial || []).map((h) => `<li data-sin-traducir>${esc(h.causa
      ? Tp("Intento {n}: no quedó ({causa})", { n: h.intento, causa: Tp(CAUSAS[h.causa] || "") || h.causa })
      : Tp("Intento {n}: quedó", { n: h.intento }))}</li>`).join("");
    const registro = (x.registro || []).slice(-40).map((r) =>
      `<p class="consola-linea"><span class="consola-${esc(r.t)}">${esc(QUE_HIZO[r.t] || r.t)}</span><span data-sin-traducir>${esc(r.ruta)}</span></p>`).join("");
    if (!x.resumen && !intentos && !registro && !(x.escritos || []).length) return "";
    return `<details class="detalle-paso"><summary>Ver lo que hizo</summary>
      ${x.resumen ? `<p class="resumen-completo" data-sin-traducir>${esc(x.resumen)}</p>` : ""}
      ${(x.escritos || []).length ? `<p class="etiqueta">Archivos que cambió</p><p class="archivos" data-sin-traducir>${esc(x.escritos.join(", "))}</p>` : ""}
      ${intentos ? `<p class="etiqueta">Intentos</p><ul class="intentos">${intentos}</ul>` : ""}
      ${registro ? `<p class="etiqueta">Lo que leyó y escribió</p><div class="consola registro">${registro}</div>` : ""}</details>`;
  }
  function falloHTML(x, i) {
    const corre = !!E.ocupado;
    return `<div class="por-que" role="group" aria-label="Por qué no quedó"><p class="etiqueta">Por qué no quedó</p>
      <p data-sin-traducir>${esc(Tp(CAUSAS[x.causa] || "El paso no quedó."))}</p>
      ${x.error ? `<details><summary>Ver el error</summary><pre data-sin-traducir>${esc(x.error)}</pre></details>` : ""}
      <p class="suave">«Arreglarlo» le pasa este error a tu IA para que lo corrija. Si el paso es muy grande, divídelo. Para seguir con los demás, sáltalo por ahora.</p>
      <div class="acciones-fallo"><button type="button" class="pz-boton pz-principal" data-arreglar="${i}"${corre || !E.config.ia ? " disabled" : ""}>Arreglarlo con mi IA</button>
      <button type="button" class="pz-boton" data-dividir="${i}"${corre || !E.config.ia ? " disabled" : ""}>Dividirlo en pasos más chicos</button>
      ${E.saltados.has(i) ? "" : `<button type="button" class="pz-boton" data-saltar="${i}"${corre ? " disabled" : ""}>Saltarlo por ahora</button>`}</div></div>`;
  }
  // Un paso al construir, colapsado: estado, número, título y tokens. Se abre solo el que corre o el que falló.
  const ICONO_ESTADO = { listo: "✓", fallo: "!", pendiente: "" };
  function filaPaso(p, x, i) {
    const corre = E.ocupado === "paso" && E.enCurso.includes(i);
    const dep = depende(p, i);
    const abierto = corre || x.estado === "fallo" || E.abiertos.has(`paso:${i}`);
    const saltado = E.saltados.has(i) && x.estado !== "listo";
    const tokens = x.gastado ? (x.medido ? Tp("{n} tokens gastados", { n: miles(x.gastado) }) : Tp("~{n} tokens gastados", { n: miles(x.gastado) }))
      : Tp("~{n} tokens estimados", { n: miles(x.tokens) });
    return `<li class="estado-${esc(x.estado)}${saltado ? " saltado" : ""}${corre ? " corriendo" : ""}" id="paso-${i}"><details data-abierto="paso:${i}"${abierto ? " open" : ""}><summary>
      <span class="fila-n">${corre ? `<span class="pz-giro" aria-hidden="true"></span>` : esc(ICONO_ESTADO[x.estado] || "") || String(i + 1).padStart(2, "0")}</span>
      <span class="fila-titulo" data-sin-traducir>${esc(x.titulo)}</span>
      ${dep.length ? `<span class="fila-usa usa" data-sin-traducir>${esc(Tp("usa {lista}", { lista: dep.map((d) => d + 1).join(", ") }))}</span>` : ""}
      ${saltado || corre || x.estado !== "pendiente" ? `<span class="chip-estado">${esc(saltado ? "Saltado" : corre ? "En curso" : ESTADOS[x.estado] || x.estado)}</span>` : ""}
      <span class="fila-meta" data-sin-traducir>${esc(tokens)}</span></summary>
      <div class="fila-cuerpo"><p class="suave" data-sin-traducir>${esc(x.que || "")}</p>
      ${x.resumen && !corre ? `<p class="resumen-paso" data-sin-traducir>${esc(x.resumen)}</p>` : ""}
      ${corre ? vivoHTML(i) : x.estado === "fallo" ? falloHTML(x, i) : ""}
      ${corre ? "" : detallePaso(x)}</div></details></li>`;
  }
  function pasoPasos() {
    const p = E.proyecto;
    const siguiente = proximo(p);
    const faltan = p.pasos.filter((x) => x.estado !== "listo").length;
    const hechos = p.pasos.length - faltan;
    const modos = [["paso", "Paso a paso"], ["auto", "Todo automático"]].map(([m, n]) =>
      `<button type="button" data-modo="${m}" aria-pressed="${E.modo === m}"${E.ocupado ? " disabled" : ""}>${esc(n)}</button>`).join("");
    const fin = faltan === 0;
    // Paso a paso, cuando hay varios pasos que no dependen entre sí: se ofrece hacerlos a la vez (y, aparte, solo el próximo).
    const juntos = E.modo === "paso" && siguiente >= 0 && p.pasos[siguiente].estado !== "fallo" && EDITAN.includes(E.config.ia)
      ? paraLote(p).filter((i) => p.pasos[i].estado !== "fallo") : [];
    const puede = E.config.ia && !E.ocupado ? "" : " disabled";
    const accion = siguiente < 0 ? "" : E.ocupado === "paso"
      ? (E.modo === "auto" ? `<button type="button" class="pz-boton" id="parar"${E.parar ? " disabled" : ""}>${esc(E.parar ? "Se detiene al terminar este paso" : "Detener")}</button>` : "")
      : juntos.length > 1
        ? `<button type="button" class="pz-boton pz-principal" id="hacer-juntos" data-ns="${juntos.join(",")}" data-sin-traducir${puede}>${
          esc(Tp("Hacer los pasos {lista} a la vez", { lista: juntos.map((i) => i + 1).join(", ") }))}</button>
          <button type="button" class="pz-boton" id="hacer-paso" data-n="${siguiente}" data-sin-traducir${puede}>${esc(Tp("Solo el paso {n}", { n: siguiente + 1 }))}</button>`
        : `<button type="button" class="pz-boton pz-principal" id="hacer-paso" data-n="${siguiente}" data-sin-traducir${puede}>${
        esc(p.pasos[siguiente].estado === "fallo" ? Tp("Arreglar el paso {n}", { n: siguiente + 1 })
          : E.modo === "auto" ? Tp("Hacer todo desde el paso {n}", { n: siguiente + 1 }) : Tp("Hacer el paso {n}", { n: siguiente + 1 }))}</button>`;
    // Un plan donde cada paso usa el anterior no deja hacer nada a la vez: se dice, con el camino para cambiarlo.
    const enFila = EDITAN.includes(E.config.ia) && faltan > 2 && p.pasos.every((x, i) => i === 0 || (depende(p, i).length === 1 && depende(p, i)[0] === i - 1));
    const quedan = !fin && siguiente < 0
      ? `<p class="aviso-pasos">${esc(Tp("Quedan {n} pasos sin terminar. Arréglalos para que tu app quede lista.", { n: faltan }))}</p>` : "";
    const principal = sinIA() + errorHTML() + quedan + (E.ocupado === "dividir" ? trabajando("Tu IA está dividiendo el paso en pasos más chicos…") : "")
      + (fin ? `<div class="listo"><h3>Tu app está lista</h3><p class="suave">Está en tu carpeta:</p><p><code data-sin-traducir>${esc(p.carpeta || "")}</code></p>
        <p class="suave">«Ver mi app» la abre en tu navegador, con datos de ejemplo.</p>
        <p class="suave">Para instalarla como app y compartirla, publícala: GitHub arma la página y las descargas para Mac, Windows y Linux.</p></div>` : "")
      + `<div class="lista-cabeza"><p class="suave" data-sin-traducir>${esc(Tp("{h} de {n} pasos listos", { h: hechos, n: p.pasos.length }))}</p>
        <button type="button" class="pz-plano" id="abrir-todo" data-que="paso">${esc(abiertos("paso") ? "Cerrar todos" : "Abrir todos")}</button></div>
        <progress class="barra-avance" max="${p.pasos.length}" value="${hechos}" aria-hidden="true"></progress>
        <ol class="filas pasos">${p.pasos.map((x, i) => filaPaso(p, x, i)).join("")}</ol>`
      ;
    const lado = medidor(p) + `<div class="panel-bloque"><p class="etiqueta">Modo</p><div class="pz-seg" role="group" aria-label="Modo">${modos}</div>
        <label class="tope"><span>Tope de la app (tokens)</span><input id="tope" type="number" min="1000" step="1000" value="${E.tope}"></label>
        ${enFila ? `<p class="panel-nota">${esc("En este plan cada paso usa el anterior, así que van uno a uno. «Rehacer lo que falta» (en el plan) lo arma con pasos que se pueden hacer a la vez.")}</p>` : ""}
        <p class="panel-nota">${esc(E.modo === "auto" ? "Pieza hace todos los pasos sola, varios a la vez cuando no dependen entre sí. Si uno falla, lo arregla o lo divide; si sigue fallando, se detiene y te dice por qué." : "Tú apruebas cada paso. Después de cada uno ves lo que gastó tu IA.")}</p></div>`
      + (E.aisladas === undefined ? "" : `<p class="panel-nota aislamiento${E.aisladas ? "" : " sin"}">${esc(E.aisladas
        ? "Las pruebas corren aisladas: sin internet y sin acceso a tus llaves ni a tus carpetas privadas."
        : "En este computador las pruebas corren sin aislar: revisa lo que hace tu app antes de publicarla.")}</p>`)
      + consolaHTML();
    const acciones = (fin ? `<button type="button" class="pz-boton pz-principal" id="siguiente">${esc(p.repo ? "Ver dónde está publicada" : "Siguiente: publicarla")}</button>` : "")
      + accion + `<button type="button" class="pz-boton" id="ver-app">Ver mi app</button>
      <button type="button" class="pz-boton pz-plano" id="inicio"${E.ocupado ? " disabled" : ""}>Volver al inicio</button>`;
    const fallo = p.pasos.some((x) => x.estado === "fallo");
    const ahora = fin ? "Tu app está lista. Toca «Siguiente: publicarla»." : E.ocupado === "paso" ? "Tu IA está trabajando. Puedes mirar cómo avanza o detenerla."
      : E.ocupado === "dividir" ? "Espera: tu IA está dividiendo el paso." : fallo ? "Un paso no quedó. Abajo ves por qué: arréglalo, divídelo o sáltalo."
      : "Toca el botón para hacer el próximo paso.";
    return marcoPaso(principal, { acciones, lado, ahora });
  }
  // Las etapas que ve la persona: los 8 pasos del asistente, agrupados en 5.
  const ETAPAS = [["Tu idea", [1, 2]], ["Piezas", [3, 4]], ["Plan", [5, 6]], ["Construir", [7]], ["Publicar", [8]]];
  function etapas() {
    const actual = ETAPAS.findIndex(([, ps]) => ps.includes(E.paso));
    return `<ol class="etapas" aria-label="Etapas">${ETAPAS.map(([n], i) =>
      `<li class="${i < actual ? "hecha" : i === actual ? "actual" : ""}"${i === actual ? ' aria-current="step"' : ""}><span class="etapa-n">${i < actual ? "✓" : i + 1}</span>${esc(n)}</li>`).join("")}</ol>`;
  }
  function cabeza() {
    return etapas() + `<p class="paso-n" data-sin-traducir>${esc(Tp("Paso {n} de {total}", { n: E.paso, total: PASOS.length }))}</p><h2>${esc(PASOS[E.paso - 1])}</h2>`;
  }
  // Los botones de un paso del asistente (van en el panel de control): Siguiente arriba y ancho, Atrás plano.
  function pie({ puede = true, siguiente = "Siguiente" } = {}) {
    return `<button type="button" class="pz-boton pz-principal" id="siguiente"${puede ? "" : " disabled"}>${esc(siguiente)}</button>
      <button type="button" class="pz-boton pz-plano" id="atras">Atrás</button>`;
  }
  // Todo paso del asistente: lo principal a la izquierda y el panel de control a la derecha (fijo al bajar), con los botones
  // arriba y lo que ayuda a decidir abajo. En el celular, el panel va arriba y sus botones quedan fijos abajo.
  // Lo que la persona abrió o cerró (los pasos se pintan de nuevo a menudo: así no se cierran solos).
  const abiertos = (que) => [...E.abiertos].some((k) => k.startsWith(que + ":"));
  // «Ahora» = lo único que la persona tiene que hacer en esta pantalla, arriba del panel, en una frase.
  function marcoPaso(principal, { acciones = "", lado = "", ahora = "" } = {}) {
    return cabeza() + `<div class="paso-grilla"><div class="paso-principal">${principal}</div>
      <aside class="panel-control" aria-label="Panel de control">${ahora ? `<p class="panel-ahora"><span>${esc("Ahora")}</span>${esc(ahora)}</p>` : ""}
      <div class="panel-acciones">${acciones}</div>${lado}</aside></div>`;
  }
  function pasoSistemas() {
    const n = E.nueva;
    const grupos = SISTEMAS.map((g) => `<fieldset class="grupo"><legend>${esc(g.grupo)}</legend>${g.ids.map(([id, nombre]) =>
      `<label class="opcion"><input type="checkbox" data-sistema="${id}"${n.plataformas.includes(id) ? " checked" : ""}> <span>${esc(nombre)}</span>${
        id === "android" ? `<small class="suave">${esc("Por hacer: su pieza todavía no existe")}</small>` : ""}</label>`).join("")}</fieldset>`).join("");
    return marcoPaso(grupos, { ahora: "Marca dónde quieres usar tu app y toca Siguiente.", acciones: pie({ puede: n.plataformas.length > 0 }),
      lado: `<p class="panel-nota">${esc("El sistema decide qué piezas sirven. Por eso va primero.")}</p>` });
  }
  function pasoIdea() {
    const n = E.nueva;
    return marcoPaso(`<label class="pz-campo"><span>Nombre</span><input id="nombre" maxlength="40" value="${esc(n.nombre)}" autocomplete="off"></label>
      <label class="pz-campo"><span>En una frase: qué hace y para quién</span><textarea id="frase" rows="3" maxlength="400">${esc(n.frase)}</textarea></label>
      <div class="caja-detalle"><div class="caja-detalle-cabeza"><label for="detalle">La idea completa</label><span class="chip-estado">Opcional</span>
        <span class="contador" id="contador-detalle" data-sin-traducir>${esc(miles((n.detalle || "").length))} / 12.000</span></div>
        <textarea id="detalle" rows="10" maxlength="12000" placeholder="Cómo funciona, reglas, pantallas y datos. Va al plan y a cada paso.">${esc(n.detalle || "")}</textarea></div>`,
      { ahora: "Ponle nombre y cuenta en una frase qué hace. Si quieres, cuenta más en «La idea completa».",
        acciones: pie({ puede: n.nombre.trim().length > 0 && n.frase.trim().length > 0 }), lado: `<div id="piezas-vivo">${piezasVivo()}</div>` });
  }
  // Mientras se escribe la frase: las piezas ya hechas que calzan y lo que se ahorra (bytes ÷ 4, como la ficha).
  function piezasVivo() {
    const n = E.nueva;
    const ids = new Set([...sugeridas(n.frase + " " + (n.detalle || "")), ...E.catalogo.filter((p) => p.recomendar.siempre).map((p) => p.id)]);
    const listas = E.catalogo.filter((p) => ids.has(p.id) && p.estado === "lista" && (!n.plataformas.length || sirve(p, n.plataformas)));
    const ahorro = Math.floor(listas.reduce((s, p) => s + (p.bytes || 0), 0) / 4);
    const propias = E.catalogo.filter((p) => ids.has(p.id) && !p.recomendar.siempre);
    return `<div class="ahorro-vivo"><small>${esc("Te ahorras con piezas")}</small><b data-sin-traducir>~${esc(miles(ahorro))}</b><small data-sin-traducir>${esc(Tp("tokens · {n} piezas ya hechas", { n: listas.length }))}</small></div>
      ${propias.length ? `<div class="calzan"><p class="etiqueta">Calzan con tu idea</p><ul>${propias.map((p) =>
        `<li class="${p.estado === "lista" ? "" : "falta"}"><span data-sin-traducir>${esc(enIdioma(p, "nombre"))}</span><small>${esc(p.estado === "lista" ? "Ya hecha" : "Por hacer")}</small></li>`).join("")}</ul></div>` : `<p class="suave">${esc(n.frase.trim() ? "Ninguna pieza más calza todavía. Cuenta un poco más en la idea completa." : "Escribe tu idea y aquí aparecen las piezas que ya están hechas.")}</p>`}`;
  }
  function filaPieza(p, marcada, fija) {
    const lista = p.estado === "lista";
    const etiqueta = fija ? "Va siempre" : lista ? "0 tokens: ya está hecha" : "Por hacer: la escribe tu IA";
    return `<label class="pieza${lista ? " hecha" : " por-hacer"}"><input type="checkbox" data-pieza="${esc(p.id)}"${marcada ? " checked" : ""}${fija ? " disabled" : ""}>
      <span class="pieza-texto"><b data-sin-traducir>${esc(enIdioma(p, "nombre"))}</b><small data-sin-traducir>${esc(enIdioma(p, "descripcion"))}</small></span>
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
    return marcoPaso(bloques, { ahora: "Ya marqué las piezas que calzan con tu idea. Revisa y toca Siguiente.", acciones: pie(), lado: `<dl class="panel-cifras"><div><dt>${esc("ya hechas: 0 tokens")}</dt><dd class="resumen" data-sin-traducir>${esc(String(hechas))}</dd></div></dl>
      <p class="panel-nota">${ICONO} ${esc("Las piezas con este ícono ya están hechas: no gastan tokens. Marcamos las que calzan con tu frase.")}</p>` });
  }
  function pasoFicha() {
    const f = E.ficha;
    if (!f) return cabeza() + `<p class="suave">Armando la ficha…</p>`;
    if (!f.ok) return cabeza() + `<p class="pz-error-texto" data-sin-traducir>${esc(f.error || "")}</p>` + pie({ puede: false });
    const nombres = Object.fromEntries(E.catalogo.map((p) => [p.id, enIdioma(p, "nombre")]));
    const lista = (xs) => `<ul>${xs.map((x) => `<li data-sin-traducir>${x}</li>`).join("")}</ul>`;
    const permisos = Object.entries(f.permisos);
    const cifras = `<dl class="panel-cifras cifras">
        <div><dt>${esc("piezas ya hechas")}</dt><dd>${esc(String(f.hechas))}</dd></div>
        <div><dt>${esc("por hacer")}</dt><dd>${esc(String(f.por_hacer.length))}</dd></div>
        <div class="ahorro"><dt>${esc("tokens que no gastas")}</dt><dd data-sin-traducir>~${esc(f.tokens_ahorrados.toLocaleString(i18n.idioma))}</dd></div></dl>`;
    return marcoPaso(`${f.por_hacer.length ? `<h3>Por hacer</h3>${lista(f.por_hacer.map((id) => esc(nombres[id] || id)))}` : ""}
      <h3>Pantallas</h3>${lista(f.pantallas.map((x) => `<b>${esc(x.donde)} · ${esc(x.nombre)}</b>: ${esc(x.que)}`))}
      <h3>Permisos</h3>${permisos.length ? permisos.map(([plat, filas]) => `<p class="plataforma" data-sin-traducir>${esc(plat)}</p>${
        lista(filas.map((x) => `<b>${esc(x.clave)}</b>: ${esc(x.por)}`))}`).join("") : `<p class="suave">No pide permisos del sistema.</p>`}
      <h3>Internet</h3>${f.red.length ? lista(f.red.map(esc)) : `<p class="suave">Funciona sin internet.</p>`}
      <h3>Lo que te toca</h3>${lista(f.tareas.map(esc))}`, { ahora: "Mira lo que va a tener tu app y sigue al plan.", acciones: pie({ siguiente: "Siguiente: el plan" }), lado: cifras });
  }
  function principal() {
    const pasos = [inicio, pasoSistemas, pasoIdea, pasoPiezas, pasoFicha, pasoPlan, pasoCrear, pasoPasos, pasoPublicar];
    return `<div class="marco">${lateral()}<main class="contenido">${E.vista === "explorar" ? explorar() : pasos[E.paso]()}</main></div>`;
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
  // Abrir o cerrar un paso queda anotado (toggle no burbujea: se escucha en captura).
  document.addEventListener("toggle", (ev) => {
    const d = ev.target;
    if (!d.dataset) return;
    if (d.dataset.abierto) d.open ? E.abiertos.add(d.dataset.abierto) : E.abiertos.delete(d.dataset.abierto);
    if (d.dataset.cerrable) d.open ? E.cerrados.delete(d.dataset.cerrable) : E.cerrados.add(d.dataset.cerrable);
  }, true);
  document.addEventListener("click", async (ev) => {
    if (bv.manejarClic(ev) || ui.manejarClic(ev)) return;
    if (tema.manejarClic(ev)) return pintar();
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.menuApp) { E.menuApp = E.menuApp === b.dataset.menuApp ? "" : b.dataset.menuApp; pintar(); return; }
    if (E.menuApp && !b.closest(".menu-app")) E.menuApp = "";
    if (b.id === "abrir-ajustes" || b.id === "elegir-ia" || b.id === "ia-lateral") { E.ajustes = true; pintar(); }
    else if (b.dataset.quitar) { E.menuApp = ""; host.enviar("proyectoBorrar", { id: b.dataset.quitar, carpeta: "no" }); }
    else if (b.dataset.borrar) {
      const p = E.proyectos.find((x) => x.id === b.dataset.borrar);
      E.menuApp = "";
      if (!p) return;
      const si = await ui.confirmar({ titulo: "¿Borrar «{app}»?", valores: { app: p.nombre }, peligro: true, si: "Borrar",
        texto: p.carpeta ? "Se borran su plan y su carpeta en tu computador. Lo que ya publicaste en GitHub queda allá." : "Se borra su plan." });
      if (si) host.enviar("proyectoBorrar", { id: p.id, carpeta: "si" });
    }
    else if (b.dataset.idioma) {
      E.config.idioma_ui = b.dataset.idioma;
      host.enviar("config", { idioma_ui: b.dataset.idioma });
      await cargarIdioma(b.dataset.idioma);
      pintar();
    } else if (b.id === "nueva" || b.id === "app-nueva") {
      E.nueva = nuevaApp(); E.ficha = null; E.proyecto = null; E.vista = "";
      if (b.id === "nueva") E.nueva.frase = (E.fraseRapida || "").trim();
      irA(1);
    }
    else if (b.id === "atras") irA(E.paso - 1);
    // Una app ya creada no se crea de nuevo: del plan va directo a construir.
    else if (b.id === "siguiente") irA(E.paso === 5 && creada() ? 7 : E.paso + 1);
    else if (b.id === "ir-construir") irA(7);
    else if (b.id === "hacer-juntos") hacerLote(b.dataset.ns.split(",").map(Number));
    else if (b.id === "inicio" || b.id === "ir-inicio") { E.proyecto = null; E.vista = ""; E.gh = null; irA(0); host.enviar("proyectosLista"); }
    else if (b.id === "explorar" || b.id === "explorar-lateral") { E.vista = "explorar"; E.apps = null; E.error = ""; pintar(); host.enviar("publicarExplorar"); }
    else if (b.dataset.abrir) { if (/^https:\/\//.test(b.dataset.abrir)) host.enviar("abrirEnlace", { url: b.dataset.abrir }); }
    else if (b.id === "revisar-subida") pedirRevisionSubida(), pintar();
    else if (b.id === "instalar-gh") { ocupar("instalar"); host.enviar("publicarInstalar", { id: E.proyecto.id }); }
    else if (b.id === "conectar-gh") { E.codigoGH = null; ocupar("conectar"); host.enviar("publicarConectar", { id: E.proyecto.id }); }
    else if (b.id === "copiar-codigo") { try { await navigator.clipboard.writeText(E.codigoGH.codigo); toast("Copié el código."); } catch { toast("No pude copiarlo: escríbelo a mano.", { error: true }); } }
    else if (b.id === "revisar-publicar") { ocupar("revisar"); host.enviar("publicarRevisar", { id: E.proyecto.id }); }
    else if (b.id === "publicar") {
      ocupar("publicar");
      host.enviar("publicarSubir", { id: E.proyecto.id, dueno: E.pub.dueno, visibilidad: E.pub.visibilidad,
        explorador: E.pub.visibilidad === "publico" && E.pub.explorador ? "si" : "no", datos_ok: E.pub.datosOk ? "si" : "no" });
    } else if (b.id === "proponer") host.enviar("abrirEnlace", { url: urlPropuesta() });
    else if (b.dataset.seguir) seguir(b.dataset.seguir);
    else if (b.id === "hacer-plan") {
      const n = E.nueva;
      E.mejora = { fase: "plan", opcionales: [] }; E.aceptados = [];
      ocupar("plan");
      host.enviar("proyectoPlan", { nombre: n.nombre.trim(), frase: n.frase.trim(), detalle: (n.detalle || "").trim(),
        acuerdos: (E.proyecto && E.proyecto.acuerdos) || [], plataformas: n.plataformas, piezas: n.piezas });
    } else if (b.id === "revisar") { E.aceptados = []; E.mejora = { fase: "revisar", opcionales: [] }; ocupar("revisar"); host.enviar("proyectoRevisar", { id: E.proyecto.id }); }
    else if (b.id === "sumar-opcionales") {
      const elegidas = ((E.mejora && E.mejora.opcionales) || []).filter((h) => (E.aceptados || []).includes(h.id));
      E.mejora = { fase: "corregir", opcionales: [] };
      replanear(elegidas.map((h) => h.propuesta));
    }
    else if (b.id === "rehacer-con") {
      const n = E.nueva, p = E.proyecto;
      const nuevos = p.revision.hallazgos.filter((h) => (E.aceptados || []).includes(h.id)).map((h) => h.propuesta);
      const acuerdos = [...(p.acuerdos || []), ...nuevos].slice(-20);
      E.aceptados = [];
      ocupar("plan");
      host.enviar("proyectoPlan", { nombre: n.nombre.trim(), frase: n.frase.trim(), detalle: (n.detalle || "").trim(), acuerdos,
        plataformas: n.plataformas, piezas: n.piezas });
    } else if (b.id === "crear") { ocupar("crear"); host.enviar("proyectoCrear", { id: E.proyecto.id }); }
    else if (b.id === "hacer-paso") { if (E.modo !== "auto" || E.proyecto.pasos[Number(b.dataset.n)].estado === "fallo" || !seguirAuto()) hacerPaso(Number(b.dataset.n)); }
    else if (b.id === "ver-app") host.enviar("proyectoVista", { id: E.proyecto.id });
    else if (b.id === "parar") { E.parar = true; pintar(); }
    else if (b.id === "abrir-todo") {
      const que = b.dataset.que, total = E.proyecto ? E.proyecto.pasos.length : 0;
      if (abiertos(que)) E.abiertos = new Set([...E.abiertos].filter((k) => !k.startsWith(que + ":")));
      else for (let i = 0; i < total; i++) E.abiertos.add(`${que}:${i}`);
      pintar();
    }
    else if (b.dataset.dividir) dividirPaso(Number(b.dataset.dividir));
    else if (b.dataset.arreglar) { const n = Number(b.dataset.arreglar); E.saltados.delete(n); hacerPaso(n); }
    else if (b.dataset.saltar) {
      E.saltados.add(Number(b.dataset.saltar)); E.error = "";
      if (!(E.modo === "auto" && seguirAuto())) pintar();
    }
    else if (b.dataset.modo) { E.modo = b.dataset.modo; pintar(); }
  });
  function urlPropuesta() {
    const x = E.propuesta, p = E.proyecto || {};
    const cuerpo = [`## ${Tp("Qué resuelve")}`, x.que.trim(), "", `## ${Tp("Archivos")}`, x.archivos.trim() || "-", "",
      `## ${Tp("App")}`, p.repo ? `https://github.com/${p.repo}` : p.nombre || "-", "", Tp("Propuesta desde el programa Pieza.")].join("\n");
    return "https://github.com/pieza-app/pieza/issues/new?labels=pieza-nueva&title=" + encodeURIComponent(Tp("Pieza nueva: {x}", { x: x.nombre.trim() }))
      + "&body=" + encodeURIComponent(cuerpo);
  }
  // Rehace el plan con correcciones nuevas (se suman a las de antes; van a cada pedido de la IA).
  function replanear(nuevas) {
    const n = E.nueva, p = E.proyecto;
    E.aceptados = [];
    ocupar("plan");
    host.enviar("proyectoPlan", { nombre: n.nombre.trim(), frase: n.frase.trim(), detalle: (n.detalle || "").trim(),
      acuerdos: [...((p && p.acuerdos) || []), ...nuevas].slice(-20), plataformas: n.plataformas, piezas: n.piezas });
  }
  function ocupar(que) { E.ocupado = que; E.error = ""; E.parar = false; pintar(); }
  // Todo automático, cuando un paso no queda: primero tu IA lo arregla con el error; si sigue sin quedar, se divide en pasos más
  // chicos (una vez). Si la IA misma no respondió, o se llegó al tope, se detiene. Devuelve si siguió trabajando.
  function autoReparar(n, x) {
    if (x.causa === "ia" || x.causa === "gasto" || E.proyecto.gastado >= E.tope) return false;
    if (!E.reparados[n]) {
      E.reparados[n] = true;
      toast(Tp("El paso {n} no quedó. Le pido a tu IA que lo arregle.", { n: n + 1 }));
      hacerPaso(n);
      return true;
    }
    if (!E.divididos[x.titulo]) {
      E.divididos[x.titulo] = true;
      toast(Tp("El paso {n} sigue sin quedar. Lo divido en pasos más chicos.", { n: n + 1 }));
      dividirPaso(n);
      return true;
    }
    return false;
  }
  const nuevoVivo = () => ({ inicio: Date.now(), fase: "ia", intento: 1, escritos: new Set(), leyendo: "" });
  // El tope vale en los dos modos: sin espacio, no se empieza nada (la persona lo sube en el panel si quiere seguir).
  function sinTope() {
    if (E.proyecto.gastado < E.tope) return false;
    E.error = Tp("Llegaste al tope de {n} tokens. Para seguir, súbelo en el panel.", { n: miles(E.tope) });
    pintar();
    return true;
  }
  function hacerPaso(n) {
    if (sinTope()) return;
    E.enCurso = [n];
    E.vivos = { [n]: nuevoVivo() };
    ocupar("paso");
    host.enviar("proyectoPaso", { id: E.proyecto.id, n });
  }
  function hacerLote(ns) {
    if (sinTope()) return;
    E.enCurso = ns;
    E.vivos = Object.fromEntries(ns.map((n) => [n, nuevoVivo()]));
    ocupar("paso");
    host.enviar("proyectoLote", { id: E.proyecto.id, ns });
  }
  function dividirPaso(n) {
    E.enCurso = [];
    ocupar("dividir");
    host.enviar("proyectoDividir", { id: E.proyecto.id, n });
  }
  // Mientras corre un paso, el reloj se pinta cada 20 s (sin tocar nada más).
  setInterval(() => { if (E.ocupado === "paso" && E.paso === 7) pintar(); }, 20000);
  // Una app que ya se empezó: vuelve al paso donde quedó.
  function seguir(id) {
    const p = E.proyectos.find((x) => x.id === id);
    if (!p) return;
    E.proyecto = p;
    E.saltados = new Set(); E.reparados = {}; E.divididos = {}; E.abiertos = new Set(); E.mejora = null;
    E.nueva = { plataformas: p.plataformas, nombre: p.nombre, frase: p.frase, detalle: p.detalle || "", piezas: p.piezas, tocadas: p.piezas };
    irA(p.estado === "plan" ? 5 : p.estado === "nuevo" ? 5 : 7);
  }
  function irA(paso) {
    const n = E.nueva;
    if (paso === 3 && !n.tocadas.length) n.piezas = sugeridas(n.frase);   // hasta que la persona toque una, las sugeridas
    E.paso = Math.max(0, Math.min(PASOS.length, paso));
    E.error = "";
    // El plan nace de la idea: si la persona vuelve y la cambia, el plan de antes no sirve.
    if (E.paso === 5 && E.proyecto && E.proyecto.estado === "plan" && (E.proyecto.nombre !== n.nombre.trim() || E.proyecto.frase !== n.frase.trim() || (E.proyecto.detalle || "") !== (n.detalle || "").trim()))
      E.proyecto = null;
    if (E.paso === 8 && E.proyecto && !E.proyecto.repo && !E.gh && E.ocupado !== "revisar") { E.ocupado = "revisar"; host.enviar("publicarRevisar", { id: E.proyecto.id }); }
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
    } else if (t.dataset.dueno) { E.pub.dueno = t.dataset.dueno; pintar(); }
    else if (t.dataset.vis) { E.pub.visibilidad = t.dataset.vis; pintar(); }
    else if (t.id === "explorador") { E.pub.explorador = t.checked; }
    else if (t.id === "datos-ok") { E.pub.datosOk = t.checked; pintar(); }
    else if (t.dataset.hallazgo) {
      const id = t.dataset.hallazgo, a = E.aceptados || [];
      E.aceptados = t.checked ? [...new Set([...a, id])] : a.filter((x) => x !== id);
      pintar();
    }
    else if (t.dataset.pieza) {
      n.tocadas = [...new Set([...n.tocadas, t.dataset.pieza])];
      n.piezas = t.checked ? [...new Set([...n.piezas, t.dataset.pieza])] : n.piezas.filter((x) => x !== t.dataset.pieza);
      pintar();
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && E.menuApp) { E.menuApp = ""; pintar(); return; }
    if (ui.manejarTecla(ev)) return; bv.manejarTecla(ev);
  });
  // Solo el panel de piezas (no toda la pantalla: el campo donde se escribe no pierde el cursor). Con un pequeño respiro.
  let piezasEspera = 0;
  function refrescarPiezasVivo() {
    clearTimeout(piezasEspera);
    piezasEspera = setTimeout(() => {
      const caja = document.getElementById("piezas-vivo");
      if (!caja) return;
      caja.innerHTML = piezasVivo();
      i18n.traducirDOM(caja);
    }, 250);
  }
  document.addEventListener("input", (ev) => {
    const id = ev.target.id;
    if (id === "tope") { E.tope = Math.max(1000, Number(ev.target.value) || 0); return; }
    if (id === "pz-nombre" || id === "pz-que" || id === "pz-archivos") {
      const x = E.propuesta, antes = !!(x.nombre.trim() && x.que.trim());
      x[{ "pz-nombre": "nombre", "pz-que": "que", "pz-archivos": "archivos" }[id]] = ev.target.value;
      if (antes !== !!(x.nombre.trim() && x.que.trim())) pintar();
      return;
    }
    if (id === "frase-rapida") { E.fraseRapida = ev.target.value; return; }
    if (id === "detalle") {
      E.nueva.detalle = ev.target.value;
      const c = document.getElementById("contador-detalle");
      if (c) c.textContent = `${miles(E.nueva.detalle.length)} / 12.000`;
      refrescarPiezasVivo();
      return;
    }
    if (id === "org-nueva") { E.pub.orgNueva = ev.target.value.trim(); return; }
    if (id !== "nombre" && id !== "frase") return;
    const antes = !!(E.nueva.nombre.trim() && E.nueva.frase.trim());
    E.nueva[id] = ev.target.value;
    if (id === "frase") refrescarPiezasVivo();
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
        host.enviar("proyectosLista");
      }
      pintar();
    },
    piezasListas(r) {
      if (r && r.ok) E.catalogo = r.piezas || [];
      else toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
    fichaLista(r) { E.ficha = r || { ok: false }; if (E.paso === 4) pintar(); },
    pasoAvance(eventos) {
      if (!Array.isArray(eventos)) return;
      for (const e of eventos) {
        if (!e || typeof e !== "object") continue;
        const v = E.vivos[e.n] || E.vivos[E.enCurso[0]];
        if (!v) continue;
        if (e.t === "fase" && e.fase === "pruebas") Object.values(E.vivos).forEach((w) => { w.fase = "pruebas"; });
        if (e.t === "fase") { v.fase = e.fase; v.intento = e.intento || 1; }
        else if (e.t === "lee" && typeof e.ruta === "string") v.leyendo = e.ruta;
        else if (e.t === "escribe" && typeof e.ruta === "string") { v.escritos.delete(e.ruta); v.escritos.add(e.ruta); v.leyendo = ""; }
      }
      if (E.paso === 7) pintar();
    },
    vistaAbierta(r) { if (r && r.ok) toast("Abrí tu app en el navegador."); else toast(Tp((r && r.error) || "No se pudo.")); },
    explorarListo(r) { if (r && r.ok) E.apps = r.apps || []; else { E.apps = []; E.error = (r && r.error) || Tp("No se pudo."); } pintar(); },
    publicarRevisado(r) {
      E.ocupado = "";
      if (r && r.ok) {
        E.gh = r;
        const org = E.pub.dueno === "__nueva__" ? (E.pub.orgNueva || `${E.proyecto.id}-app`) : "";
        if (org && (r.duenos || []).includes(org)) { E.pub.dueno = org; toast("Encontré tu organización. Ya puedes publicar."); }
        else if (org) E.error = Tp("Todavía no veo la organización «{org}». Revisa que la creaste con ese nombre.", { org });
        else if (r.duenos && !E.pub.dueno) E.pub.dueno = r.duenos[0];
      } else E.error = (r && r.error) || Tp("No se pudo.");
      pintar();
    },
    ghInstalado(r) {
      E.ocupado = "";
      if (r && (r.ok || r.guia)) E.gh = Object.assign({}, E.gh, r);
      if (r && r.ok && r.instalado) toast("Instalé GitHub CLI.");
      else if (r && !r.ok) E.error = r.error || Tp("No se pudo.");
      pintar();
    },
    publicarAvance(eventos) {
      for (const e of Array.isArray(eventos) ? eventos : []) {
        if (e && e.t === "codigo" && typeof e.codigo === "string" && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(e.codigo)) {
          E.codigoGH = { codigo: e.codigo };
          host.enviar("abrirEnlace", { url: "https://github.com/login/device" });  // GitHub en el navegador, listo para pegar el código
        }
      }
      if (E.paso === 8) pintar();
    },
    ghConectado(r) {
      E.ocupado = ""; E.codigoGH = null;
      if (r && r.ok) { E.gh = r; if (r.duenos && !E.pub.dueno) E.pub.dueno = r.duenos[0]; toast("GitHub conectado como @{usuario}.", { valores: { usuario: r.usuario || "" } }); }
      else E.error = (r && r.error) || Tp("No se pudo.");
      pintar();
    },
    subidaRevisada(r) {
      E.ocupado = "";
      if (r && r.ok) E.subida = r; else E.error = (r && r.error) || Tp("No se pudo.");
      pintar();
    },
    publicado(r) {
      E.ocupado = "";
      if (r && r.ok) { E.proyecto = r.proyecto; toast("Tu app está en GitHub."); }
      else { E.error = (r && r.error) || Tp("No se pudo."); if (r && r.revision) E.subida = r.revision; }
      pintar();
    },
    proyectoBorrado(r) {
      if (r && r.ok) { E.proyectos = E.proyectos.filter((x) => x.id !== r.id); toast(r.carpeta ? "Borré la app y su carpeta." : "La quité de la lista."); }
      else toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
    proyectosListos(r) { if (r && r.ok) { E.proyectos = r.proyectos || []; E.aisladas = r.aisladas; if (E.paso === 0) pintar(); } },
    revisionLista(r) {
      E.ocupado = "";
      if (r && r.ok) {
        E.proyecto = r.proyecto;
        const hs = r.proyecto.revision.hallazgos;
        if (E.mejora) {
          // Lo grave e importante se aplica solo; lo menor queda para que la persona lo sume si quiere.
          const aplicar = hs.filter((h) => h.gravedad !== "baja").map((h) => h.propuesta);
          const opcionales = hs.filter((h) => h.gravedad === "baja");
          if (!aplicar.length) { E.mejora = { fase: "listo", opcionales }; return pintar(); }
          E.mejora = { fase: "corregir", opcionales };
          return replanear(aplicar);
        }
        E.aceptados = hs.filter((h) => h.gravedad === "alta").map((h) => h.id);
      } else { E.error = (r && r.error) || Tp("No se pudo."); if (E.mejora) E.mejora.fase = "listo"; }
      pintar();
    },
    planListo(r) {
      E.ocupado = "";
      if (r && r.ok) {
        E.proyecto = r.proyecto;
        // Primer plan: sigue solo con la revisión a ciegas. Plan corregido: listo.
        if (E.mejora && E.mejora.fase === "plan") { E.mejora.fase = "revisar"; ocupar("revisar"); return host.enviar("proyectoRevisar", { id: E.proyecto.id }); }
        if (E.mejora) E.mejora.fase = "listo";
      } else { E.error = (r && r.error) || Tp("No se pudo."); if (E.mejora) E.mejora = null; }
      pintar();
    },
    proyectoCreado(r) {
      E.ocupado = "";
      if (r && r.ok) { E.proyecto = r.proyecto; irA(7); } else { E.error = (r && r.error) || Tp("No se pudo."); pintar(); }
    },
    pasoListo(r) {
      E.ocupado = "";
      if (r && r.proyecto) E.proyecto = r.proyecto;
      const p = E.proyecto;
      if (!r || !r.proyecto) E.error = (r && r.error) || Tp("No se pudo.");
      else if (!r.ok) {
        const x = p.pasos[r.n];
        if (E.modo === "auto" && !E.parar && autoReparar(r.n, x)) return;
        E.error = Tp("El paso {n} no quedó. Abajo ves por qué y puedes arreglarlo.", { n: r.n + 1 });
      } else delete E.reparados[r.n];
      // Todo automático: sigue mientras no falle, no se pida parar y no se pase del tope.
      if (E.modo === "auto" && r && r.ok && !E.parar && seguirAuto()) return;
      E.parar = false;
      pintar();
      if (r && !r.ok && E.paso === 7) { const el = document.getElementById(`paso-${r.n}`); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" }); }
      if (p && p.pasos.every((x) => x.estado === "listo") && E.paso === 7) toast("Tu app está lista.");
    },
    loteListo(r) {
      E.ocupado = "";
      if (r && r.proyecto) E.proyecto = r.proyecto;
      const p = E.proyecto;
      if (!r || !r.proyecto) { E.error = (r && r.error) || Tp("No se pudo."); E.parar = false; return pintar(); }
      if ((r.aplazados || []).length) toast(Tp("Algunos pasos tocaban lo mismo: los hago después, uno a uno."));
      const fallados = (r.ns || []).filter((n) => p.pasos[n].estado === "fallo");
      for (const n of r.ns || []) if (p.pasos[n].estado === "listo") delete E.reparados[n];
      if (E.modo === "auto" && !E.parar) {
        if (fallados.length && autoReparar(fallados[0], p.pasos[fallados[0]])) return;
        if (!fallados.length && seguirAuto()) return;
      }
      if (fallados.length) E.error = Tp("El paso {n} no quedó. Abajo ves por qué y puedes arreglarlo.", { n: fallados[0] + 1 });
      E.parar = false;
      pintar();
      if (p.pasos.every((x) => x.estado === "listo") && E.paso === 7) toast("Tu app está lista.");
    },
    pasoDividido(r) {
      E.ocupado = "";
      if (r && r.ok) {
        E.proyecto = r.proyecto;
        E.saltados = new Set(); E.reparados = {}; E.divididos = {};  // los números de los pasos cambiaron
        toast(Tp("Dividí el paso {n} en {k} pasos más chicos.", { n: r.n + 1, k: r.nuevos }));
        if (E.modo === "auto" && !E.parar && seguirAuto()) return;
      } else E.error = (r && r.error) || Tp("No se pudo.");
      E.parar = false;
      pintar();
    },
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
  // Proyectos en la vista previa: un plan de ejemplo (la IA de verdad lo arma con la frase de la persona).
  const SIM = { proyectos: [] };
  function planSimulado(d) {
    const id = d.nombre.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(0, 30);
    const ficha = fichaSimulada(d);
    const pasos = [
      ["Lo que se guarda", "El formato de los datos y el script que los lee y escribe, con sus pruebas.", 6000, ["bin/datos.py"], []],
      ["La pantalla principal", "La lista y el formulario, con sus textos en inglés.", 9000, ["ui/app.js"], [0]],
      ["Buscar y ordenar", "Filtrar y ordenar lo guardado, con pruebas de interfaz.", 5000, ["bin/buscar.py"], [0]],
      ["La página y el README", "Contar qué hace la app, con capturas de datos ficticios.", 3000, ["docs/index.html"], [1, 2]],
    ].map(([titulo, que, tokens, archivos, dep]) => ({ titulo: Tp(titulo), que: Tp(que), archivos, tokens, depende: dep, estado: "pendiente", gastado: 0 }));
    const p = { id, nombre: d.nombre, frase: d.frase, detalle: d.detalle || "", acuerdos: d.acuerdos || [], revision: null, plataformas: d.plataformas, piezas: d.piezas || [], estado: "plan", pasos,
      ahorro: ficha.tokens_ahorrados, gastado_plan: 2400, gastado: 2400 };
    SIM.proyectos = [...SIM.proyectos.filter((x) => x.id !== id), p];
    return { ok: true, proyecto: p };
  }
  function revisionSimulada(d) {
    const p = SIM.proyectos.find((x) => x.id === d.id);
    if (!p) return { ok: false, error: Tp("No se pudo.") };
    const hallazgos = [
      ["riesgos", "alta", "No dice qué pasa si se corta la luz a mitad de un guardado.", "Guardar en un archivo temporal y renombrarlo al terminar."],
      ["uso", "media", "La primera pantalla no explica qué hacer si la lista está vacía.", "Mostrar un ejemplo y un botón para agregar el primero."],
      ["pasos", "baja", "La página y el README quedan para el final.", "Escribir el README junto con el primer paso."],
    ].map(([enfoque, gravedad, problema, propuesta], i) => ({ id: `h${i + 1}`, enfoque, gravedad, problema: Tp(problema), propuesta: Tp(propuesta) }));
    p.revision = { hallazgos, gastado: 4200, enfoques: ["riesgos", "uso", "pasos"] };
    p.gastado_plan += 4200; p.gastado = p.gastado_plan;
    return { ok: true, proyecto: p };
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
      case "proyectoVista": return c.luego(200, () => c.responder("vistaAbierta", { ok: true, url: "http://127.0.0.1:8765/" }));
      case "publicarExplorar": return c.luego(400, () => c.responder("explorarListo", { ok: true, apps: [
        { nombre: "Recetas de Ana", repo: "ana-perez/recetas", descripcion: Tp("Guarda recetas y arma la lista de compras."), pagina: "https://ana-perez.github.io/recetas/", revisada: true },
        { nombre: "Gastos de la casa", repo: "matias-soto/gastos", descripcion: Tp("Cuentas compartidas, sin servidores."), pagina: "", revisada: false }] }));
      case "publicarRevisar": return c.luego(300, () => c.responder("publicarRevisado", SIM.gh ? { ok: true, gh: true, sesion: true, usuario: "ana-perez", duenos: ["ana-perez", "ana-app"] } : { ok: true, gh: true, sesion: false }));
      case "publicarPreparar": return c.luego(300, () => c.responder("subidaRevisada", { ok: true, archivos: ["app.json", "bin/recetas.py", "ui/app.js"],
        secretos: [], personales: [{ archivo: "ui/demo.json", linea: 3, tipo: "correo", muestra: "ana@correo.cl" }], dominios: [], comandos: [] }));
      case "publicarInstalar": return c.luego(300, () => c.responder("ghInstalado", { ok: true, gh: true, sesion: false, instalado: true }));
      case "publicarConectar":
        c.luego(200, () => c.responder("publicarAvance", [{ t: "codigo", codigo: "AB12-CD34", url: "https://github.com/login/device" }]));
        return c.luego(700, () => { SIM.gh = true; c.responder("ghConectado", { ok: true, gh: true, sesion: true, usuario: "ana-perez", duenos: ["ana-perez", "ana-app"] }); });
      case "publicarSubir": return c.luego(800, () => {
        const p = SIM.proyectos.find((x) => x.id === d.id);
        Object.assign(p, { repo: `${d.dueno}/${p.id}`, publicado: d.visibilidad, explorador: d.explorador === "si",
          pagina: d.visibilidad === "publico" ? `https://${d.dueno}.github.io/${p.id}/` : "" });
        c.responder("publicado", { ok: true, proyecto: p, url: `https://github.com/${p.repo}` });
      });
      case "proyectosLista": return c.responder("proyectosListos", { ok: true, proyectos: SIM.proyectos, aisladas: true });
      case "proyectoBorrar": SIM.proyectos = SIM.proyectos.filter((x) => x.id !== d.id);
        return c.luego(150, () => c.responder("proyectoBorrado", { ok: true, id: d.id, carpeta: d.carpeta === "si" }));
      case "proyectoPlan": return c.luego(900, () => c.responder("planListo", planSimulado(d)));
      case "proyectoRevisar": return c.luego(1200, () => c.responder("revisionLista", revisionSimulada(d)));
      case "proyectoCrear": return c.luego(700, () => {
        const p = SIM.proyectos.find((x) => x.id === d.id);
        Object.assign(p, { estado: "creado", carpeta: `~/Pieza/${p.nombre}` });
        c.responder("proyectoCreado", { ok: true, proyecto: p });
      });
      case "proyectoPaso":
        c.luego(250, () => c.responder("pasoAvance", [{ t: "fase", fase: "ia", n: d.n, intento: 1 }, { t: "lee", ruta: "AGENTS.md" }]));
        c.luego(500, () => c.responder("pasoAvance", [{ t: "escribe", ruta: "bin/recetas.py" }, { t: "escribe", ruta: "ui/app.js" }]));
        c.luego(700, () => c.responder("pasoAvance", [{ t: "fase", fase: "pruebas", n: d.n, intento: 1 }]));
        return c.luego(900, () => {
        const p = SIM.proyectos.find((x) => x.id === d.id), x = p.pasos[d.n];
        Object.assign(x, { estado: "listo", intentos: 1, gastado: Math.round(x.tokens * 0.9), resumen: Tp("Listo: las pruebas quedaron en verde.") });
        p.estado = "pasos";
        p.gastado = p.gastado_plan + p.pasos.reduce((s, y) => s + (y.gastado || 0), 0);
        c.responder("pasoListo", { ok: true, proyecto: p, n: d.n });
      });
      case "proyectoLote":
        for (const n of d.ns) c.luego(200, () => c.responder("pasoAvance", [{ t: "fase", fase: "ia", n, intento: 1 }, { t: "escribe", ruta: `bin/paso${n + 1}.py`, n }]));
        c.luego(600, () => c.responder("pasoAvance", [{ t: "fase", fase: "pruebas", n: d.ns[0], intento: 1 }]));
        return c.luego(900, () => {
          const p = SIM.proyectos.find((x) => x.id === d.id);
          for (const n of d.ns) Object.assign(p.pasos[n], { estado: "listo", intentos: 1, gastado: Math.round(p.pasos[n].tokens * 0.9), resumen: Tp("Listo: las pruebas quedaron en verde.") });
          p.estado = "pasos";
          p.gastado = p.gastado_plan + p.pasos.reduce((s, y) => s + (y.gastado || 0), 0);
          c.responder("loteListo", { ok: true, proyecto: p, ns: d.ns, aplicados: d.ns, aplazados: [] });
        });
      case "proyectoDividir": return c.luego(600, () => {
        const p = SIM.proyectos.find((x) => x.id === d.id), x = p.pasos[d.n];
        const mitad = (sufijo, dep) => ({ ...x, titulo: `${x.titulo} (${sufijo})`, tokens: Math.round(x.tokens / 2), estado: "pendiente", gastado: 0,
          error: "", causa: undefined, historial: [], registro: [], resumen: "", depende: dep, dividido_de: x.titulo });
        const k = 2, correr = (j) => (j < d.n ? j : j === d.n ? d.n + k - 1 : j + k - 1);
        const despues = p.pasos.slice(d.n + 1).map((y, j) => ({ ...y, depende: depende(p, d.n + 1 + j).map(correr) }));
        p.pasos = [...p.pasos.slice(0, d.n), mitad("1", depende(p, d.n)), mitad("2", [d.n]), ...despues];
        c.responder("pasoDividido", { ok: true, proyecto: p, n: d.n, nuevos: k });
      });
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
