# Pieza — guía para trabajar en el proyecto

> Para personas y para cualquier IA de programación (Claude Code, Codex, Gemini/Antigravity…). `CLAUDE.md` y `GEMINI.md` solo
> importan este archivo: la guía es una sola.

Pieza es el programa de escritorio para crear apps paso a paso, como un asistente «siguiente, siguiente». Es para personas que
quieren su propia app y no saben programar, o que quieren gastar menos en su IA. Tiene siete pasos: los sistemas, la idea, las
piezas, la ficha, el plan, crear la app y lo propio paso a paso. Las piezas de [Pieza](https://github.com/pieza-app/pieza) ya están
hechas y no gastan tokens. La IA de la persona solo hace lo propio de la app (plan en `docs/programa.md` de Pieza).

**Principios que no se negocian**

1. **Lo ya hecho no se vuelve a hacer.** Una pieza que existe se copia, no se le pide a la IA. Así cada app nueva cuesta menos.
2. **Un paso a la vez.** Cada paso muestra lo que hace y lo que cuesta antes de hacerlo. La persona puede revisar y parar.
3. **La IA es la de la persona**, con su cuenta, sin herramientas ni memoria. Recibe una guía por paso, no todo el proyecto.
4. **Los proyectos son de la persona.** Viven en su computador. Publicar es opcional y lo decide ella.
5. **Lo que viene de afuera se valida y se escapa** (catálogo, respuestas de la IA, piezas de otras personas).
6. **Gratis y abierto** (AGPL-3.0), sin cuentas ni publicidad. **Nada personal en el código** (Ana Pérez, Matías Soto).

## Mapa del repo

| Ruta | Qué es |
|---|---|
| `bin/` | Python **solo biblioteca estándar**: lo que corren las apps. El último argumento siempre es el JSON de salida; lo que escribe la persona llega en un JSON de entrada, nunca como argumento. |
| `ui/` | La interfaz única (`index.html` con CSP, `app.js`, `app.css`), las piezas de interfaz (ver «Piezas») e `idiomas/en.json`. |
| `escritorio/` | App de escritorio para Mac, Windows y Linux (Rust + Tauri): `src/main.rs` es lo propio; `src/pieza/` es de la pieza «host-tauri». `Cargo.toml`, `tauri.conf.json` y `pruebas/arranque.sh` los genera la pieza. |
| `docs/` | `favicon.svg` (el logo de Pieza: de ahí salen los íconos con `herramientas/iconos.mjs`) y `wiki/`. La página es una sola, la de [Pieza](https://pieza-app.github.io/pieza/): ahí va la vista previa (`/app/`). |
| `pruebas/` | `correr.sh` (todo lo que revisa GitHub en cada cambio) y las pruebas. |
| `herramientas/` | `revisar_privacidad.sh` (antes de cada commit), `empaquetar.sh` (arma la app de Mac), `subir_version.py` (sube la versión en app.json, tauri.conf.json, Cargo.toml, Cargo.lock y el CHANGELOG). |
| `app.json`, `piezas.json`, `acciones.json` | **Pieza** (ver «Piezas»): `app.json` describe la app (id, nombre, versión, datos, plataformas, config y sus acciones); `piezas.json` y `acciones.json` los escribe `pieza.py`. |
| `CHANGELOG.md` | Lo que cambia para quien usa la app, en palabras simples (ver «Lo que rodea a un cambio»). |
| `bin/piezas.py` | `lista` (el catálogo) y `ficha {plataformas, piezas}`: suma las piezas que van siempre, el host de cada sistema y lo que cada pieza requiere; devuelve lo hecho, lo que falta, pantallas, permisos, red, tareas y tokens ahorrados (bytes ÷ 4). |
| `datos/catalogo.json` | El catálogo de piezas (solo datos). Lo arma `herramientas/catalogo_de_pieza.py <carpeta de pieza>`, que también escribe `ui/demo-catalogo.json` para la vista previa. «Catálogo al día» (`.github/workflows/catalogo-al-dia.yml`) lo hace cada día: si cambió y las pruebas pasan, sube la versión con `herramientas/subir_version.py`, lo deja en main y lanza «Publicar versión». |
| `ui/pieza.svg` | El ícono de Pieza que marca las piezas ya hechas («0 tokens»). |
| `bin/proyectos.py` | Crear una app: `plan` (la IA desglosa lo propio en pasos, JSON validado), `crear` (`pieza.py crear`, sin IA), `paso` (la IA lee la carpeta y devuelve archivos; Pieza los revisa, los escribe y corre las pruebas; dos intentos) y `lista`. Registro en `<datos>/proyectos/<id>.json`; la app en `~/Pieza/<Nombre>`. |
| `datos/pieza/` | Una copia de Pieza (`pieza.py`, `piezas/`, la guía para la IA): con ella se crean las apps sin internet. La pone al día `herramientas/catalogo_de_pieza.py`; `VERSION` dice el commit. No se edita aquí. |
| `bin/publicar.py` | `explorar` (las apps con el topic «hecho-con-pieza», de la página de Pieza, pieza «red»), `revisar` (`gh` y su sesión, dueños posibles) y `subir` (con el `gh` de la persona: repo en `app.json` + `pieza.py generar`, revisión de privacidad, primer commit, `gh repo create`, Pages y el topic si elige el explorador). |
| `bin/vista.py` | «Ver mi app»: sirve la carpeta `ui/` de la app creada en `127.0.0.1` (un servidor aparte que se apaga a los 30 minutos) y abre el navegador. |
| `datos/guias/reglas.md` | Las reglas que van en cada pedido a la IA (cortas: un paso por pedido). |

## Cómo funciona
- **El asistente** (`ui/app.js`, `E.paso`): `inicio` → `sistemas` → `idea` → `piezas` → `ficha` → `plan` → `crear` → `pasos`. Cada
  paso tiene su función (`pasoSistemas` … `pasoPasos`) y se cambia con `irA()`. El inicio
  (`inicio()`) tiene la caja «Tu idea» (`#frase-rapida`, pasa a `E.nueva.frase`) y las apps empezadas en tarjetas con su avance y
  el menú «⋯» (`data-quitar`: solo el registro; `data-borrar`: también la carpeta, con `ui.confirmar`). La barra lateral
  (`lateral()`, dentro de `.marco`) va en todas las pantallas; en el celular queda arriba. Las cuatro etapas (`ETAPAS`, `etapas()`)
  van sobre cada paso. Idea, plan y pasos usan dos columnas (`.dos-columnas`): al lado, las piezas que calzan en vivo
  (`piezasVivo`) o la consola de la IA (`consolaHTML`).
- **Borrar una app** (`proyectos.py borrar`, acción `proyectoBorrar` {id, carpeta si/no} → `proyectoBorrado`): borra el registro y,
  con `carpeta: "si"`, la carpeta, solo si está dentro de la carpeta Pieza y su `app.json` tiene el mismo `id`.
- **Sugerencias:** una pieza se sugiere si la frase trae una de sus `recomendar.palabras`. Las de `recomendar.siempre` van siempre.
- **La ficha** la calcula `bin/piezas.py ficha` (acción `piezasFicha` → `fichaLista`). En el navegador la calcula `fichaSimulada`
  con la misma regla: si cambias la regla, cambia los dos lados y `pruebas/test_app.py` (clase `Piezas`).
- **Acciones** (`app.json` → `acciones`): `piezasLista` → `piezasListas`, `piezasFicha` → `fichaLista`, `proyectosLista` →
  `proyectosListos`, `proyectoPlan` → `planListo`, `proyectoCrear` → `proyectoCreado`, `proyectoPaso` → `pasoListo`,
  `proyectoVista` → `vistaAbierta`, `publicarExplorar` → `explorarListo`, `publicarRevisar` → `publicarRevisado`, `publicarSubir` → `publicado` y `proyectoBorrar` → `proyectoBorrado`. Lo que
  escribe la persona llega en el archivo de entrada, nunca como argumento. En el navegador las simula `simular()` (`planSimulado`).
- **Cómo escribe la IA.** Con Claude o Codex (`ia.puede_escribir()`), edita la carpeta de la app directamente
  (`ia.preguntar(..., escribir=carpeta)`: solo ahí, sin terminal ni internet). Antes del paso Pieza saca una foto (`_foto`) y
  después `_cuidar` devuelve los archivos de piezas, `piezas.json`, `acciones.json`, `pruebas/correr.sh` y lo que identifica a la app en `app.json`.
  Con Gemini, lee la carpeta y responde JSON. `validar_archivos` rechaza rutas que salen de la carpeta, `.git/`, los archivos de piezas, `piezas.json` y `acciones.json`. En
  `app.json` puede sumar acciones y config, pero no cambiar `id`, `nombre`, `repo`, `datos`, `plataformas`, `privado` ni
  `version`; después Pieza corre `pieza.py acciones`. También puede pedir `borrar` archivos propios (nunca de piezas). Si cambias esas reglas, cambia la prueba `Proyectos` de `pruebas/test_app.py`.
- **Publicar y proponer:** al terminar, «Publicar en GitHub» usa el `gh` de la persona (Pieza no guarda claves ni pide permisos).
  «En una organización nueva» (`__nueva__`) muestra la guía (`.guia-org`): abre GitHub para crearla y «Ya la creé: revisar» vuelve
  a `publicarRevisar`; si la encuentra, la elige. «Publicar» espera hasta entonces.
  «Proponer en GitHub» abre en el navegador un issue prellenado en `pieza-app/pieza` (etiqueta `pieza-nueva`).
- **En vivo:** `proyectoPaso` tiene `"progreso": "pasoAvance"`: `proyectos.py` emite (`trabajos.emitir`) la fase (`ia`,
  `pruebas`) y lo que la IA lee y escribe; la interfaz lo muestra con el tiempo que lleva (`vivoHTML`).
- **Revisión a ciegas** (`proyectos.py revisar`, acción `proyectoRevisar`): el patrón «elefante y pez dorado». Tres sesiones nuevas de la IA (`ENFOQUES`: riesgos, uso, pasos) leen solo la idea y el plan, en paralelo, y devuelven hallazgos validados (`validar_revision`). Lo que la persona acepta vuelve a `plan` como `acuerdos` y va a cada pedido (`_detalle`).
- **Pasos chicos y conectados:** el plan trae por paso `entrega` (lo que deja listo para otros, con nombres exactos) y `depende`
  (índices de pasos anteriores; sin él, del anterior). `validar_plan` rechaza un paso de más de `TOPE_PASO` tokens o
  `MAX_ARCHIVOS_PASO` archivos propios (sin contar `SIN_CONTAR`) y se pide de nuevo. Cada paso recibe primero lo que dejaron
  listo los pasos de los que depende (`_historia`) y lo que él debe dejar (`_entrega`).
- **Varios pasos a la vez** (`proyectos.py lote`, acción `proyectoLote` → `loteListo`, solo con Claude o Codex): los pasos que
  `listos_para_lote` elige (todo lo que usan listo, sin archivos propios en común, hasta `MAX_LOTE`) corren en paralelo, cada uno
  en una copia de la carpeta. Después se juntan (`_juntar`: JSON clave por clave, texto por líneas); lo que choca queda
  pendiente para hacerlo solo. Las pruebas corren una vez. La interfaz lo replica en `paraLote`.
- **Dividir** (`proyectos.py dividir`, acción `proyectoDividir` → `pasoDividido`): cambia un paso por 2 a 4 más chicos; los que
  dependían de él pasan a depender del último. En «Todo automático», un paso que falla se arregla una vez y, si sigue, se divide
  una vez (`autoReparar`).
- **Cuando un paso no queda:** `paso` guarda en cada paso `historial` (cada intento: resumen, archivos, `causa` —`pruebas`, `ia`,
  `respuesta`, `acciones`— y el error), `registro` (lo que leyó y escribió la última vez) y `causa`. Sin cambios no es un fallo:
  mandan las pruebas (lo del paso puede estar hecho de antes). Al reintentar, el error anterior va desde el primer intento
  («Arreglarlo con mi IA»). En «Todo automático», un paso que falla se reintenta solo una vez antes de detenerse; la persona puede
  saltarlo por ahora (`E.saltados`). La barra con el modo y el botón del próximo paso queda fija arriba (`.barra-pasos`).
- **Tokens:** los reales que da la IA (`{"t": "uso"}` de la pieza «ia»: Claude y Codex); con Gemini se estiman con el largo del pedido, de la respuesta y de lo que cambió (÷ 4). Cada paso lleva el mapa de archivos (`_mapa`), lo que hicieron los pasos anteriores (`_historia`) y `no_leer=NO_LEER`. «Todo automático» sigue mientras cada paso quede bien,
  la persona no pida «Detener» y lo gastado no pase el tope (`E.tope`).

## Piezas (de [Pieza](https://github.com/pieza-app/pieza))
Pieza usa piezas de Pieza, la base de la familia de apps: código probado que se copia a la app (modelo «copiar y adueñarse»).

| Pieza | Versión | Archivos | Qué usa Pieza |
|---|---|---|---|
| `actualizaciones` | 0.5.0 | `escritorio/src/pieza/actualizaciones.rs` | Revisa los Releases de `pieza-app/estudio` al abrir y cada 6 h. Exige la firma Ed25519 (`app.json` → `actualizaciones.llaves`; la privada está en el entorno «publicar»). |
| `bienvenida` | 0.4.1 | `ui/bienvenida.css`, `ui/bienvenida.js` | El primer uso: idioma → `hola` → `ia`. |
| `componentes` | 0.3.0 | `ui/componentes.css`, `ui/componentes.js` | Botones, diálogos, avisos y «Tu IA» en Ajustes. |
| `contrato` | 0.1.3 | `pruebas/contrato.py` | Revisa que cada acción tenga quien la atienda. |
| `empaquetado` | 0.2.2 | `herramientas/python.lock` | Arma la app con su Python portátil (`carpetas`: `datos`). |
| `esqueleto` | 0.2.0 |  | El punto de partida (`pieza.py crear`). Ya no se actualiza. |
| `github` | 0.3.1 |  | Workflows, plantillas de issues, Dependabot y la wiki. |
| `host-tauri` | 0.1.1 | `escritorio/iconos/128x128.png`, `escritorio/iconos/128x128@2x.png`, `escritorio/iconos/32x32.png`, `escritorio/iconos/icon.icns`, `escritorio/iconos/icon.ico`, `escritorio/iconos/icono.png`, `escritorio/src/pieza/enchufe.rs`, `escritorio/src/pieza/host.rs`, `escritorio/src/pieza/mod.rs`, `escritorio/src/pieza/procesador.rs`, `escritorio/src/pieza/protocolo.rs`, `escritorio/src/pieza/sistema.rs`, `escritorio/src/pieza/vigilante.rs` | La ventana, el puente y las acciones declaradas. |
| `host-ui` | 0.3.0 | `ui/host.js` | `host.enviar` y `host.responder`. |
| `i18n` | 0.3.1 | `ui/i18n.js` | `T`, `Tp`, `traducirDOM` y `idiomas/en.json`. |
| `ia` | 0.7.1 | `bin/ia.py` | La IA de la persona: el plan y cada paso (`preguntar`, con `escribir` = la carpeta de la app; con Gemini, `leer`). |
| `nucleo` | 0.7.1 | `bin/nucleo.py` | `app.json`, la carpeta de datos y la config. |
| `red` | 0.2.0 | `bin/red.py` | El explorador: solo `pieza-app.github.io`, sin redirecciones y con tope. |
| `tema` | 0.2.1 | `ui/tema.css`, `ui/tema.js` | Claro y oscuro. |
| `trabajos` | 0.2.2 | `bin/trabajos.py`, `escritorio/src/pieza/progreso.rs` | Todavía no se usa: los pasos corren con su límite de tiempo (`limite` en `app.json`). |

- **No edites a mano los archivos de una pieza.** Se actualizan con «Pieza al día» (`.github/workflows/pieza-al-dia.yml`, una vez por
  semana abre un PR o un issue) o con `python3 <pieza>/herramientas/pieza.py actualizar .`. Si hay que cambiar algo, el cambio va
  primero a Pieza (`pieza.py diferencias . <pieza>` lo muestra) y vuelve desde allá; `pieza.py estado .` dice si algo quedó distinto.
- Lo que **generan** las piezas desde `app.json` (el empaquetado, los workflows, las plantillas de GitHub) se vuelve a generar con
  `pieza.py generar .` después de cambiar `app.json`; si lo cambias a mano, desde ahí es de la app y Pieza ya no lo toca.
- `app.json` y `acciones.json` van dentro de las apps (los empaqueta `herramientas/empaquetar.sh` y `extraResources`). Después de
  cambiar una acción de `app.json`: `python3 <pieza>/herramientas/pieza.py acciones .`.
- `.gitignore` es una lista blanca: un archivo o carpeta nueva de la raíz se agrega ahí.
- Al agregar o actualizar una pieza, pon al día esta tabla (`pieza.py estado .` dice las versiones).

## Reglas al cambiar cosas
- Código, comentarios, commits y textos en **español** (de Chile neutro). Todo texto nuevo visible va con su traducción en
  `ui/idiomas/en.json` en el mismo cambio, como frase completa con marcadores (`T("Llevas {n}…", {n})`), nunca pedazos pegados.
- Contenido de la persona con `esc()` y `data-sin-traducir`. Lo que escribe la persona **nunca** va como argumento de un proceso.
- Archivos de piezas: no se editan aquí (ver «Piezas»). Colores con los tokens de «tema» y botones y diálogos de «componentes».
- Antes de cerrar un cambio: `bash pruebas/correr.sh` y mirar la interfaz (`cd ui && python3 -m http.server 8765`, `?idioma=en`,
  `?bienvenida`), también a 390 px y en claro y oscuro.
- Seguridad (detalle en `SECURITY.md`): CSP sin scripts ni manejadores en línea; todo dato externo validado y escapado; la IA sin
  herramientas ni MCP. Workflows: actions fijadas por SHA con su versión en un comentario, `permissions` mínimos,
  `persist-credentials: false`, nunca `pull_request_target` ni `${{ github.event.* }}` dentro de `run:`.
- Privacidad: `bash herramientas/revisar_privacidad.sh` antes de cada commit (usa `.terminos-privados`, local y nunca versionado).
  Jamás subas datos reales, ni siquiera "para probar".
- Commits con autor `@users.noreply.github.com`. El repo es público: cada commit se ve al tiro.
- Rust: `cd escritorio && cargo test` y `cargo clippy -- -D warnings`. GitHub corre la app en Mac y Linux.
- El catálogo es solo datos: nunca ejecutes nada que venga de él. Para cambiarlo, cambia la pieza en Pieza y vuelve a armarlo.

## Lo que rodea a un cambio
Un cambio está listo cuando la app **y lo que la cuenta** dicen lo mismo. Antes de empezar, anota qué tipo de cambio es; al terminar,
revisa cada fila ("no aplica" se decide, no se supone):

| Si el cambio… | Deja al día |
|---|---|
| agrega o cambia una función | la página de Pieza (`docs/` de pieza-app/pieza: el programa, «cómo funciona», comparación, preguntas frecuentes), el README y la guía si la hay |
| cambia lo que se ve | capturas de la página y del README (datos ficticios, español e inglés, normal y celular) e imagen para compartir si sale esa vista |
| cambia un flujo o un paso | instrucciones paso a paso, preguntas frecuentes, textos de la bienvenida e instalación si la toca |
| quita algo | bórralo de la página, el README y las guías: nada que prometa lo que ya no hace |
| cambia el formato de datos o el puente | la documentación del formato, `ejemplos/` si existe y esta guía |
| cambia carpetas, reglas o pruebas | esta guía (`AGENTS.md`) y `CONTRIBUTING.md` |
| actualiza o agrega una pieza | `piezas.json` (lo escribe `pieza.py`), la tabla «Piezas» de esta guía y `app.json` si pide config |
| resuelve un issue | ciérralo con «Resuelto en …» dando crédito y abre issues para lo que quedó pendiente |
| lo nota quien usa Pieza | `CHANGELOG.md`: una línea en «Sin publicar», en lenguaje de persona («Ahora puedes…»), en español e inglés |

Todo texto nuevo de la página y del README va en los dos idiomas, sin nada inventado. Antes de cerrar, busca con `grep` en `docs/` y el
README el nombre o el texto viejo de lo que cambió. Al publicar una versión (se sube `version` en `app.json`), las líneas de «Sin
publicar» pasan a su número. Los issues que abrimos para una tarea traen una sección «Qué actualizar alrededor» con las filas de
esta tabla que le tocan.

## Revisar aportes
Todo entra por pull request y lo junta quien mantiene el proyecto, solo con su aprobación. Leer todo el diff antes de correr nada
(alerta roja: workflows, scripts de instalación o empaquetado, la CSP, `innerHTML` sin `esc()`, red nueva, dependencias nuevas,
binarios, cómo se arma el comando o el pedido de la IA). Agentes: `.claude/agents/pieza-revisor.md` y `pieza-privacidad.md`.
Detalle en `CONTRIBUTING.md`.
