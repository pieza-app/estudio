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
    proyectos: [], proyecto: null, ocupado: "", error: "", modo: "paso", tope: 200000, parar: false,
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
  const PASOS = ["¿Para qué sistemas?", "¿Qué hace tu app?", "Las piezas", "La ficha", "El plan", "Crear la app", "Paso a paso"];
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
    return `<div class="cifras medidor">
      <p><b data-sin-traducir>~${esc(miles(p.gastado))}</b> <span>${esc("tokens gastados")}</span></p>
      <p><b data-sin-traducir>~${esc(miles(estimado))}</b> <span>${esc("estimado del plan")}</span></p>
      <p class="ahorro"><b data-sin-traducir>${ICONO}~${esc(miles(p.ahorro))}</b> <span>${esc("ahorrados con piezas")}</span></p></div>`;
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
  function publicarHTML(p) {
    if (p.repo) return `<div class="listo"><h3>Publicada</h3><p><button type="button" class="pz-enlace" data-abrir="https://github.com/${esc(p.repo)}" data-sin-traducir>github.com/${esc(p.repo)}</button></p>
      <p class="suave">${esc(p.explorador ? "Aparece en el explorador de Pieza." : "No aparece en el explorador de Pieza.")}</p></div>`;
    const g = E.gh;
    if (!g) return `<h3>Publicar en GitHub</h3><p class="suave">Con tu cuenta de GitHub. Pieza no guarda tu clave ni pide permisos.</p>
      <div class="pz-pie"><button type="button" class="pz-boton" id="revisar-publicar"${E.ocupado ? " disabled" : ""}>Publicar en GitHub</button></div>`;
    if (!g.gh || !g.sesion) return `<h3>Publicar en GitHub</h3><p class="suave">Para publicar necesitas GitHub CLI con tu sesión iniciada.</p>
      <ol class="suave"><li>Instálalo desde cli.github.com.</li><li>En la terminal, corre este comando:</li><li><code data-sin-traducir>gh auth login</code></li><li>Vuelve aquí y toca «Revisar de nuevo».</li></ol>
      <div class="pz-pie"><button type="button" class="pz-boton" data-abrir="https://cli.github.com/">Abrir cli.github.com</button>
      <button type="button" class="pz-boton pz-principal" id="revisar-publicar">Revisar de nuevo</button></div>`;
    const pub = E.pub;
    const org = pub.orgNueva || `${p.id}-app`;
    const nueva = pub.dueno === "__nueva__";
    const duenos = g.duenos.map((d) => `<label class="opcion"><input type="radio" name="dueno" data-dueno="${esc(d)}"${pub.dueno === d ? " checked" : ""}> <span data-sin-traducir>${esc(d)}/${esc(p.id)}</span></label>`).join("")
      + `<label class="opcion"><input type="radio" name="dueno" data-dueno="__nueva__"${nueva ? " checked" : ""}> <span>${esc("En una organización nueva")}</span></label>`
      + (nueva ? `<div class="guia-org">
        <label class="pz-campo"><span>Nombre de la organización</span><input id="org-nueva" maxlength="39" value="${esc(org)}" autocomplete="off"></label>
        <ol><li>${esc("Toca «Abrir GitHub» y escribe ese nombre.")}</li><li>${esc("Elige el plan gratis y toca «Create organization».")}</li><li>${esc("Vuelve aquí y toca «Ya la creé: revisar».")}</li></ol>
        <div class="pz-pie pz-izq"><button type="button" class="pz-boton" data-abrir="https://github.com/account/organizations/new?plan=free">Abrir GitHub</button>
        <button type="button" class="pz-boton pz-principal" id="revisar-publicar">Ya la creé: revisar</button></div></div>` : "");
    const vis = [["publico", "Pública: cualquiera la ve y la puede usar"], ["privado", "Privada: solo tú"]].map(([v, n]) =>
      `<label class="opcion"><input type="radio" name="vis" data-vis="${v}"${pub.visibilidad === v ? " checked" : ""}> <span>${esc(n)}</span></label>`).join("");
    return `<h3>Publicar en GitHub</h3>
      <fieldset class="grupo"><legend>Dónde</legend>${duenos}</fieldset>
      <fieldset class="grupo"><legend>Cómo</legend>${vis}
        <label class="opcion"><input type="checkbox" id="explorador"${pub.explorador && pub.visibilidad === "publico" ? " checked" : ""}${pub.visibilidad === "publico" ? "" : " disabled"}> <span>${esc("Sumarla al explorador de Pieza (topic «hecho-con-pieza»)")}</span></label></fieldset>
      <p class="suave">Antes de subir, Pieza revisa que no vayan nombres, correos ni rutas reales.</p>
      ${E.ocupado === "publicar" ? trabajando("Publicando…") : ""}
      <div class="pz-pie"><button type="button" class="pz-boton pz-principal" id="publicar"${pub.dueno && pub.dueno !== "__nueva__" && !E.ocupado ? "" : " disabled"}>Publicar</button></div>`;
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
  function vivoHTML() {
    const v = E.vivo || {};
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
    const v = E.ocupado === "paso" ? E.vivo || {} : null;
    if (!v) return `<div class="consola"><p class="consola-titulo">En vivo</p><p class="consola-linea">${esc("Aquí ves lo que lee y escribe tu IA mientras trabaja.")}</p></div>`;
    const lineas = [];
    if (v.leyendo) lineas.push(["lee", v.leyendo]);
    for (const r of [...(v.escritos || [])].slice(-8)) lineas.push(["escribe", r]);
    if (v.fase === "pruebas") lineas.push(["prueba", Tp("Corriendo las pruebas…")]);
    return `<div class="consola" role="log"><p class="consola-titulo">En vivo</p>${lineas.map(([t, x]) =>
      `<p class="consola-linea"><span class="consola-${t}">${t}</span><span data-sin-traducir>${esc(x)}</span></p>`).join("")}</div>`;
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
  function pasoPlan() {
    const p = E.proyecto;
    const listo = p && p.pasos && p.pasos.length;
    const filas = listo ? `<ol class="plan">${p.pasos.map((x) => `<li><b data-sin-traducir>${esc(x.titulo)}</b>
      <span class="suave" data-sin-traducir>${esc(x.que)}</span>
      <small class="suave" data-sin-traducir>${esc(Tp("~{n} tokens", { n: miles(x.tokens) }))}</small></li>`).join("")}</ol>` : "";
    return cabeza() + `<p class="suave">Tu IA desglosa lo propio de tu app en pasos chicos. Las piezas ya hechas no entran al plan.</p>`
      + sinIA() + (listo ? medidor(p) + `<div class="dos-columnas"><div class="columna-principal">${filas}</div><aside class="columna-lado">${revisionHTML(p)}</aside></div>` : "") + errorHTML()
      + (E.ocupado === "plan" ? trabajando("Tu IA está armando el plan…") : "")
      + (E.ocupado === "revisar" ? trabajando("Tres revisores nuevos están leyendo tu idea…") : "")
      + `<div class="pz-pie"><button type="button" class="pz-boton" id="atras">Atrás</button>
        <button type="button" class="pz-boton${listo ? "" : " pz-principal"}" id="hacer-plan"${E.ocupado || !E.config.ia ? " disabled" : ""}>${
          esc(listo ? "Rehacer el plan" : "Hacer el plan con mi IA")}</button>
        ${listo ? `<button type="button" class="pz-boton pz-principal" id="siguiente"${E.ocupado ? " disabled" : ""}>Siguiente</button>` : ""}</div>`;
  }
  // Revisar a ciegas (elefante y pez dorado): 3 sesiones nuevas de tu IA leen solo la idea y el plan, y buscan fallas.
  const ENFOQUES = { riesgos: "Riesgos y seguridad", uso: "Uso", pasos: "Plan" };
  const GRAVEDAD = { alta: "Grave", media: "Importante", baja: "Menor" };
  function revisionHTML(p) {
    const r = p.revision;
    const boton = `<button type="button" class="pz-boton" id="revisar"${E.ocupado || !E.config.ia ? " disabled" : ""}>${esc(r ? "Revisar de nuevo" : "Revisar a ciegas")}</button>`;
    if (!r) return `<section class="revision"><h3>${esc("Revisión a ciegas")}</h3>
      <p class="suave">${esc("Tres sesiones nuevas de tu IA leen solo tu idea y el plan, sin saber cómo se armó, y buscan fallas: riesgos, uso y pasos.")}</p>${boton}</section>`;
    if (!r.hallazgos.length) return `<section class="revision"><h3>${esc("Revisión a ciegas")}</h3><p class="suave">${esc("Los revisores no encontraron fallas.")}</p>${boton}</section>`;
    const elegidos = E.aceptados || [];
    const filas = r.hallazgos.map((h) => `<li class="gravedad-${esc(h.gravedad)}"><label>
      <input type="checkbox" data-hallazgo="${esc(h.id)}"${elegidos.includes(h.id) ? " checked" : ""}${E.ocupado ? " disabled" : ""}>
      <span><small class="chip-estado">${esc(GRAVEDAD[h.gravedad] || h.gravedad)} · ${esc(ENFOQUES[h.enfoque] || h.enfoque)}</small>
      <b data-sin-traducir>${esc(h.problema)}</b><span class="suave" data-sin-traducir>${esc(h.propuesta)}</span></span></label></li>`).join("");
    const n = elegidos.length;
    return `<section class="revision"><h3>${esc("Revisión a ciegas")}</h3>
      <p class="suave">${esc("Marca los cambios que quieres y rehaz el plan con ellos.")}</p><ul class="hallazgos">${filas}</ul>
      <div class="pz-pie pz-izq">${boton}<button type="button" class="pz-boton pz-principal" id="rehacer-con"${E.ocupado || !n ? " disabled" : ""} data-sin-traducir>${
        esc(Tp("Rehacer el plan con {n} cambios", { n }))}</button></div></section>`;
  }
  function pasoCrear() {
    const p = E.proyecto;
    return cabeza() + `<p class="suave" data-sin-traducir>${esc(Tp("Pieza arma la app «{nombre}» con {n} piezas ya hechas, en la carpeta Pieza de tu usuario. No gasta tokens.",
      { nombre: p.nombre, n: (E.ficha && E.ficha.hechas) || 0 }))}</p>` + medidor(p) + errorHTML()
      + (E.ocupado === "crear" ? trabajando("Armando la app…") : "")
      + `<div class="pz-pie"><button type="button" class="pz-boton" id="atras">Atrás</button>
        <button type="button" class="pz-boton pz-principal" id="crear"${E.ocupado ? " disabled" : ""}>Crear la app</button></div>`;
  }
  function pasoPasos() {
    const p = E.proyecto;
    const siguiente = p.pasos.findIndex((x) => x.estado !== "listo");
    const filas = p.pasos.map((x, i) => `<li class="estado-${esc(x.estado)}">
      <span class="chip-estado">${esc(ESTADOS[x.estado] || x.estado)}</span>
      <b data-sin-traducir>${esc(x.titulo)}</b>
      <small class="suave" data-sin-traducir>${esc(x.gastado ? (x.medido ? Tp("{n} tokens gastados", { n: miles(x.gastado) }) : Tp("~{n} tokens gastados", { n: miles(x.gastado) })) : Tp("~{n} tokens estimados", { n: miles(x.tokens) }))}</small>
      ${x.resumen ? `<span class="suave" data-sin-traducir>${esc(x.resumen)}</span>` : ""}
      ${x.estado === "fallo" && x.error ? `<details><summary>Ver el error</summary><pre data-sin-traducir>${esc(x.error)}</pre></details>` : ""}
      ${E.ocupado === "paso" && E.enCurso === i ? vivoHTML() : ""}</li>`).join("");
    const modos = [["paso", "Paso a paso"], ["auto", "Todo automático"]].map(([m, n]) =>
      `<button type="button" data-modo="${m}" aria-pressed="${E.modo === m}"${E.ocupado ? " disabled" : ""}>${esc(n)}</button>`).join("");
    const fin = siguiente < 0;
    const accion = fin ? "" : E.ocupado === "paso"
      ? (E.modo === "auto" ? `<button type="button" class="pz-boton" id="parar"${E.parar ? " disabled" : ""}>${esc(E.parar ? "Se detiene al terminar este paso" : "Detener")}</button>` : "")
      : `<button type="button" class="pz-boton pz-principal" id="hacer-paso" data-n="${siguiente}" data-sin-traducir${E.config.ia ? "" : " disabled"}>${
        esc(E.modo === "auto" ? Tp("Hacer todo desde el paso {n}", { n: siguiente + 1 }) : Tp("Hacer el paso {n}", { n: siguiente + 1 }))}</button>`;
    return cabeza() + medidor(p)
      + `<div class="modo"><div class="pz-seg" role="group" aria-label="Modo">${modos}</div>
        ${E.modo === "auto" ? `<label class="pz-campo tope"><span>Detener al llegar a (tokens)</span><input id="tope" type="number" min="1000" step="1000" value="${E.tope}"></label>` : ""}</div>
      <p class="suave">${esc(E.modo === "auto" ? "Pieza hace todos los pasos sola. Se detiene si un paso falla dos veces o al llegar al tope." : "Tú apruebas cada paso. Después de cada uno ves lo que gastó tu IA.")}</p>`
      + sinIA() + errorHTML() + `<div class="dos-columnas"><div class="columna-principal"><ol class="pasos">${filas}</ol></div>
        <aside class="columna-lado">${consolaHTML()}</aside></div>`
      + (fin ? `<div class="listo"><h3>Tu app está lista</h3><p class="suave">Está en tu carpeta:</p><p><code data-sin-traducir>${esc(p.carpeta || "")}</code></p>
        <p class="suave">«Ver mi app» la abre en tu navegador, con datos de ejemplo.</p>
        <p class="suave">Para instalarla como app: publícala en GitHub (abajo). GitHub la arma para Mac, Windows y Linux en unos 15 minutos y la deja en «Releases» para descargar.</p></div>
        <section class="publicar">${publicarHTML(p)}</section><section class="proponer">${proponerHTML()}</section>` : "")
      + `<div class="pz-pie"><button type="button" class="pz-boton" id="inicio"${E.ocupado ? " disabled" : ""}>Volver al inicio</button>
        <button type="button" class="pz-boton" id="ver-app">Ver mi app</button>${accion}</div>`;
  }
  // Las etapas que ve la persona: los 7 pasos del asistente, agrupados en 4.
  const ETAPAS = [["Tu idea", [1, 2]], ["Piezas", [3, 4]], ["Plan", [5, 6]], ["Construir", [7]]];
  function etapas() {
    const actual = ETAPAS.findIndex(([, ps]) => ps.includes(E.paso));
    return `<ol class="etapas" aria-label="Etapas">${ETAPAS.map(([n], i) =>
      `<li class="${i < actual ? "hecha" : i === actual ? "actual" : ""}"${i === actual ? ' aria-current="step"' : ""}><span class="etapa-n">${i < actual ? "✓" : i + 1}</span>${esc(n)}</li>`).join("")}</ol>`;
  }
  function cabeza() {
    return etapas() + `<p class="paso-n" data-sin-traducir>${esc(Tp("Paso {n} de {total}", { n: E.paso, total: PASOS.length }))}</p><h2>${esc(PASOS[E.paso - 1])}</h2>`;
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
    return cabeza() + `<div class="dos-columnas"><div class="columna-principal">
      <label class="pz-campo"><span>Nombre</span><input id="nombre" maxlength="40" value="${esc(n.nombre)}" autocomplete="off"></label>
      <label class="pz-campo"><span>En una frase: qué hace y para quién</span><textarea id="frase" rows="3" maxlength="400">${esc(n.frase)}</textarea></label>
      <div class="caja-detalle"><div class="caja-detalle-cabeza"><label for="detalle">La idea completa</label><span class="chip-estado">Opcional</span>
        <span class="contador" id="contador-detalle" data-sin-traducir>${esc(miles((n.detalle || "").length))} / 12.000</span></div>
        <textarea id="detalle" rows="10" maxlength="12000" placeholder="Cómo funciona, reglas, pantallas y datos. Va al plan y a cada paso.">${esc(n.detalle || "")}</textarea></div>
      </div><aside class="columna-lado" id="piezas-vivo">${piezasVivo()}</aside></div>`
      + pie({ puede: n.nombre.trim().length > 0 && n.frase.trim().length > 0 });
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
    return cabeza() + `<p class="suave">${ICONO} ${esc("Las piezas con este ícono ya están hechas: no gastan tokens. Marcamos las que calzan con tu frase.")}</p>
      <p class="resumen" data-sin-traducir>${esc(Tp("{n} piezas ya hechas", { n: hechas }))}</p>${bloques}` + pie();
  }
  function pasoFicha() {
    const f = E.ficha;
    if (!f) return cabeza() + `<p class="suave">Armando la ficha…</p>`;
    if (!f.ok) return cabeza() + `<p class="pz-error-texto" data-sin-traducir>${esc(f.error || "")}</p>` + pie({ puede: false });
    const nombres = Object.fromEntries(E.catalogo.map((p) => [p.id, enIdioma(p, "nombre")]));
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
      <h3>Lo que te toca</h3>${lista(f.tareas.map(esc))}`
      + pie({ siguiente: "Siguiente: el plan" });
  }
  function principal() {
    const pasos = [inicio, pasoSistemas, pasoIdea, pasoPiezas, pasoFicha, pasoPlan, pasoCrear, pasoPasos];
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
    else if (b.id === "siguiente") irA(E.paso + 1);
    else if (b.id === "inicio" || b.id === "ir-inicio") { E.proyecto = null; E.vista = ""; E.gh = null; irA(0); host.enviar("proyectosLista"); }
    else if (b.id === "explorar" || b.id === "explorar-lateral") { E.vista = "explorar"; E.apps = null; E.error = ""; pintar(); host.enviar("publicarExplorar"); }
    else if (b.dataset.abrir) { if (/^https:\/\//.test(b.dataset.abrir)) host.enviar("abrirEnlace", { url: b.dataset.abrir }); }
    else if (b.id === "revisar-publicar") { ocupar("revisar"); host.enviar("publicarRevisar", { id: E.proyecto.id }); }
    else if (b.id === "publicar") {
      ocupar("publicar");
      host.enviar("publicarSubir", { id: E.proyecto.id, dueno: E.pub.dueno, visibilidad: E.pub.visibilidad,
        explorador: E.pub.visibilidad === "publico" && E.pub.explorador ? "si" : "no" });
    } else if (b.id === "proponer") host.enviar("abrirEnlace", { url: urlPropuesta() });
    else if (b.dataset.seguir) seguir(b.dataset.seguir);
    else if (b.id === "hacer-plan") {
      const n = E.nueva;
      ocupar("plan");
      host.enviar("proyectoPlan", { nombre: n.nombre.trim(), frase: n.frase.trim(), detalle: (n.detalle || "").trim(),
        acuerdos: (E.proyecto && E.proyecto.acuerdos) || [], plataformas: n.plataformas, piezas: n.piezas });
    } else if (b.id === "revisar") { E.aceptados = []; ocupar("revisar"); host.enviar("proyectoRevisar", { id: E.proyecto.id }); }
    else if (b.id === "rehacer-con") {
      const n = E.nueva, p = E.proyecto;
      const nuevos = p.revision.hallazgos.filter((h) => (E.aceptados || []).includes(h.id)).map((h) => h.propuesta);
      const acuerdos = [...(p.acuerdos || []), ...nuevos].slice(-20);
      E.aceptados = [];
      ocupar("plan");
      host.enviar("proyectoPlan", { nombre: n.nombre.trim(), frase: n.frase.trim(), detalle: (n.detalle || "").trim(), acuerdos,
        plataformas: n.plataformas, piezas: n.piezas });
    } else if (b.id === "crear") { ocupar("crear"); host.enviar("proyectoCrear", { id: E.proyecto.id }); }
    else if (b.id === "hacer-paso") hacerPaso(Number(b.dataset.n));
    else if (b.id === "ver-app") host.enviar("proyectoVista", { id: E.proyecto.id });
    else if (b.id === "parar") { E.parar = true; pintar(); }
    else if (b.dataset.modo) { E.modo = b.dataset.modo; pintar(); }
  });
  function urlPropuesta() {
    const x = E.propuesta, p = E.proyecto || {};
    const cuerpo = [`## ${Tp("Qué resuelve")}`, x.que.trim(), "", `## ${Tp("Archivos")}`, x.archivos.trim() || "-", "",
      `## ${Tp("App")}`, p.repo ? `https://github.com/${p.repo}` : p.nombre || "-", "", Tp("Propuesta desde el programa Pieza.")].join("\n");
    return "https://github.com/pieza-app/pieza/issues/new?labels=pieza-nueva&title=" + encodeURIComponent(Tp("Pieza nueva: {x}", { x: x.nombre.trim() }))
      + "&body=" + encodeURIComponent(cuerpo);
  }
  function ocupar(que) { E.ocupado = que; E.error = ""; E.parar = false; pintar(); }
  function hacerPaso(n) {
    E.enCurso = n;
    E.vivo = { inicio: Date.now(), fase: "ia", intento: 1, escritos: new Set(), leyendo: "" };
    ocupar("paso");
    host.enviar("proyectoPaso", { id: E.proyecto.id, n });
  }
  // Mientras corre un paso, el reloj se pinta cada 20 s (sin tocar nada más).
  setInterval(() => { if (E.ocupado === "paso" && E.paso === 7) pintar(); }, 20000);
  // Una app que ya se empezó: vuelve al paso donde quedó.
  function seguir(id) {
    const p = E.proyectos.find((x) => x.id === id);
    if (!p) return;
    E.proyecto = p;
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
      const v = E.vivo;
      if (!v || !Array.isArray(eventos)) return;
      for (const e of eventos) {
        if (!e || typeof e !== "object") continue;
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
    publicado(r) {
      E.ocupado = "";
      if (r && r.ok) { E.proyecto = r.proyecto; toast("Tu app está en GitHub."); } else E.error = (r && r.error) || Tp("No se pudo.");
      pintar();
    },
    proyectoBorrado(r) {
      if (r && r.ok) { E.proyectos = E.proyectos.filter((x) => x.id !== r.id); toast(r.carpeta ? "Borré la app y su carpeta." : "La quité de la lista."); }
      else toast((r && r.error) || "No se pudo.", { error: true });
      pintar();
    },
    proyectosListos(r) { if (r && r.ok) { E.proyectos = r.proyectos || []; if (E.paso === 0) pintar(); } },
    revisionLista(r) {
      E.ocupado = "";
      if (r && r.ok) {
        E.proyecto = r.proyecto;
        E.aceptados = r.proyecto.revision.hallazgos.filter((h) => h.gravedad === "alta").map((h) => h.id);  // lo grave, marcado
      } else E.error = (r && r.error) || Tp("No se pudo.");
      pintar();
    },
    planListo(r) {
      E.ocupado = "";
      if (r && r.ok) E.proyecto = r.proyecto; else E.error = (r && r.error) || Tp("No se pudo.");
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
      else if (!r.ok) E.error = Tp("El paso {n} no quedó: revisa el error. Puedes intentarlo de nuevo.", { n: r.n + 1 });
      // Todo automático: sigue con el próximo mientras no falle, no se pida parar y no se pase del tope.
      const sig = p ? p.pasos.findIndex((x) => x.estado !== "listo") : -1;
      if (E.modo === "auto" && r && r.ok && !E.parar && sig >= 0) {
        if (p.gastado >= E.tope) E.error = Tp("Me detuve: llegaste al tope de {n} tokens.", { n: miles(E.tope) });
        else return hacerPaso(sig);
      }
      E.parar = false;
      pintar();
      if (sig < 0 && E.paso === 7) toast("Tu app está lista.");
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
      ["Lo que se guarda", "El formato de los datos y el script que los lee y escribe, con sus pruebas.", 6000],
      ["La pantalla principal", "La lista y el formulario, con sus textos en inglés.", 9000],
      ["Buscar y ordenar", "Filtrar y ordenar lo guardado, con pruebas de interfaz.", 5000],
      ["La página y el README", "Contar qué hace la app, con capturas de datos ficticios.", 3000],
    ].map(([titulo, que, tokens]) => ({ titulo: Tp(titulo), que: Tp(que), archivos: [], tokens, estado: "pendiente", gastado: 0 }));
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
      case "publicarRevisar": return c.luego(300, () => c.responder("publicarRevisado", { ok: true, gh: true, sesion: true, usuario: "ana-perez", duenos: ["ana-perez", "ana-app"] }));
      case "publicarSubir": return c.luego(800, () => {
        const p = SIM.proyectos.find((x) => x.id === d.id);
        Object.assign(p, { repo: `${d.dueno}/${p.id}`, publicado: d.visibilidad, explorador: d.explorador === "si" });
        c.responder("publicado", { ok: true, proyecto: p, url: `https://github.com/${p.repo}` });
      });
      case "proyectosLista": return c.responder("proyectosListos", { ok: true, proyectos: SIM.proyectos });
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
