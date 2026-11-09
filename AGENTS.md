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
| `herramientas/` | `revisar_privacidad.sh` (antes de cada commit), `empaquetar.sh` (arma la app de Mac). |
| `app.json`, `piezas.json`, `acciones.json` | **Pieza** (ver «Piezas»): `app.json` describe la app (id, nombre, versión, datos, plataformas, config y sus acciones); `piezas.json` y `acciones.json` los escribe `pieza.py`. |
| `CHANGELOG.md` | Lo que cambia para quien usa la app, en palabras simples (ver «Lo que rodea a un cambio»). |
| `bin/piezas.py` | `lista` (el catálogo) y `ficha {plataformas, piezas}`: suma las piezas que van siempre, el host de cada sistema y lo que cada pieza requiere; devuelve lo hecho, lo que falta, pantallas, permisos, red, tareas y tokens ahorrados (bytes ÷ 4). |
| `datos/catalogo.json` | El catálogo de piezas (solo datos). Lo arma `herramientas/catalogo_de_pieza.py <carpeta de pieza>`, que también escribe `ui/demo-catalogo.json` para la vista previa. |
| `ui/pieza.svg` | El ícono de Pieza que marca las piezas ya hechas («0 tokens»). |
| `bin/proyectos.py` | Crear una app: `plan` (la IA desglosa lo propio en pasos, JSON validado), `crear` (`pieza.py crear`, sin IA), `paso` (la IA lee la carpeta y devuelve archivos; Pieza los revisa, los escribe y corre las pruebas; dos intentos) y `lista`. Registro en `<datos>/proyectos/<id>.json`; la app en `~/Pieza/<Nombre>`. |
| `datos/pieza/` | Una copia de Pieza (`pieza.py`, `piezas/`, la guía para la IA): con ella se crean las apps sin internet. La pone al día `herramientas/catalogo_de_pieza.py`; `VERSION` dice el commit. No se edita aquí. |
| `datos/guias/reglas.md` | Las reglas que van en cada pedido a la IA (cortas: un paso por pedido). |

## Cómo funciona
- **El asistente** (`ui/app.js`, `E.paso`): `inicio` → `sistemas` → `idea` → `piezas` → `ficha` → `plan` → `crear` → `pasos`. Cada
  paso tiene su función (`pasoSistemas` … `pasoPasos`) y se cambia con `irA()`. El inicio lista las apps empezadas («Seguir»).
- **Sugerencias:** una pieza se sugiere si la frase trae una de sus `recomendar.palabras`. Las de `recomendar.siempre` van siempre.
- **La ficha** la calcula `bin/piezas.py ficha` (acción `piezasFicha` → `fichaLista`). En el navegador la calcula `fichaSimulada`
  con la misma regla: si cambias la regla, cambia los dos lados y `pruebas/test_app.py` (clase `Piezas`).
- **Acciones** (`app.json` → `acciones`): `piezasLista` → `piezasListas`, `piezasFicha` → `fichaLista`, `proyectosLista` →
  `proyectosListos`, `proyectoPlan` → `planListo`, `proyectoCrear` → `proyectoCreado` y `proyectoPaso` → `pasoListo`. Lo que
  escribe la persona llega en el archivo de entrada, nunca como argumento. En el navegador las simula `simular()` (`planSimulado`).
- **La IA nunca escribe por su cuenta.** Lee la carpeta de la app (solo leer, `ia.preguntar(..., leer=carpeta)`) y responde JSON.
  `validar_archivos` rechaza rutas que salen de la carpeta, `.git/`, los archivos de piezas (`piezas.json`) y `app.json`,
  `acciones.json`, `piezas.json` y `.gitignore`. Si cambias esas reglas, cambia la prueba `Proyectos` de `pruebas/test_app.py`.
- **Tokens:** se estiman con el largo del pedido y de la respuesta (÷ 4). «Todo automático» sigue mientras cada paso quede bien,
  la persona no pida «Detener» y lo gastado no pase el tope (`E.tope`).

## Piezas (de [Pieza](https://github.com/pieza-app/pieza))
Pieza usa piezas de Pieza, la base de la familia de apps: código probado que se copia a la app (modelo «copiar y adueñarse»).

| Pieza | Versión | Archivos | Qué usa Pieza |
|---|---|---|---|
| `actualizaciones` | 0.4.0 | `escritorio/src/pieza/actualizaciones.rs` | Revisa los Releases de `pieza-app/estudio` al abrir y cada 6 h. |
| `bienvenida` | 0.4.1 | `ui/bienvenida.css`, `ui/bienvenida.js` | El primer uso: idioma → `hola` → `ia`. |
| `componentes` | 0.3.0 | `ui/componentes.css`, `ui/componentes.js` | Botones, diálogos, avisos y «Tu IA» en Ajustes. |
| `contrato` | 0.1.3 | `pruebas/contrato.py` | Revisa que cada acción tenga quien la atienda. |
| `empaquetado` | 0.2.1 | `herramientas/python.lock` | Arma la app con su Python portátil (`carpetas`: `datos`). |
| `esqueleto` | 0.2.0 |  | El punto de partida (`pieza.py crear`). Ya no se actualiza. |
| `github` | 0.3.0 |  | Workflows, plantillas de issues, Dependabot y la wiki. |
| `host-tauri` | 0.1.1 | `escritorio/iconos/128x128.png`, `escritorio/iconos/128x128@2x.png`, `escritorio/iconos/32x32.png`, `escritorio/iconos/icon.icns`, `escritorio/iconos/icon.ico`, `escritorio/iconos/icono.png`, `escritorio/src/pieza/enchufe.rs`, `escritorio/src/pieza/host.rs`, `escritorio/src/pieza/mod.rs`, `escritorio/src/pieza/procesador.rs`, `escritorio/src/pieza/protocolo.rs`, `escritorio/src/pieza/sistema.rs`, `escritorio/src/pieza/vigilante.rs` | La ventana, el puente y las acciones declaradas. |
| `host-ui` | 0.3.0 | `ui/host.js` | `host.enviar` y `host.responder`. |
| `i18n` | 0.3.1 | `ui/i18n.js` | `T`, `Tp`, `traducirDOM` y `idiomas/en.json`. |
| `ia` | 0.6.3 | `bin/ia.py` | La IA de la persona: el plan y cada paso (`preguntar`, con `leer` = la carpeta de la app). |
| `nucleo` | 0.7.1 | `bin/nucleo.py` | `app.json`, la carpeta de datos y la config. |
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
