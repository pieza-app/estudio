# Aprendizajes

Cada error que llegó a quien usa Pieza deja aquí su lección y, cuando se puede, una prueba que lo atrapa. Antes de cerrar un cambio,
quien programa (persona o IA) revisa el diff contra esta lista. El agente `.claude/agents/pieza-aprendiz.md` lo hace y suma una
lección nueva cada vez que se arregla un error.

Formato: **la lección** · qué pasó · cómo se evita (la prueba, si existe).

## Interfaz ↔ app de escritorio

1. **La vista previa no es el host.** «Hacer todo desde el paso…» respondía «No entendí lo que pediste»: `proyectoLote.ns` era una
   lista sin `"de"` y el host la validaba como lista de textos. La vista previa no validaba. · Prueba: `pruebas/interfaz.mjs`
   valida todo lo que manda la interfaz con las reglas de `acciones.json` (`revisarDatos`), y `escritorio/src/main.rs`
   (`lo_que_manda_la_interfaz_pasa_las_reglas`). Una lista de números lleva `"de": {"tipo": "entero", …}`.
2. **El avance llega como `{eventos: [...]}`**, no como lista. Un paso se quedaba en «Prepara» y no llegaba el código de GitHub.
   · `eventosDe()` acepta las dos formas; la vista previa manda la misma forma que el host.
3. **Una acción nueva necesita tres lados**: `app.json` (y `pieza.py acciones .`), quien la atiende (script o `host.funcion`) y
   `simular()`. · `pruebas/contrato.py`.

## Textos e idiomas

4. **`Tp()` dentro de un atributo, un `placeholder` o un `toast` se traduce dos veces** (después lo traduce `traducirDOM`). · En
   atributos va el texto en español tal cual; en avisos, `toast("frase {n}", {valores: {n}})`. La prueba de interfaz busca
   textos sin traducir en inglés.

## Pantalla

5. **Una grilla anidada sin `minmax(0, 1fr)` se sale de su columna** y queda debajo del panel. · `.paso-principal` y `.filas`
   usan `grid-template-columns: minmax(0, 1fr)`; revisar a 1219 px y a 390 px.
6. **Lo que la persona ve y lo que ve la IA deben ser lo mismo**: la persona veía 10.1 y 10.2 y la IA recibía 11 y 12.
   · `numeros()` en `proyectos.py` y en `ui/app.js` con la misma regla (prueba `test_numeros_e_indicaciones_en_el_pedido`).

## Cuánto gasta y cuándo se detiene

7. **Un freno que suma lo de antes bloquea para siempre.** El freno de gasto sumaba lo gastado otros días y cortaba «Arreglarlo»
   en el primer intento. · Se mide solo lo de esta vez (`gastado_antes`; prueba `test_el_freno_mira_solo_lo_de_esta_vez`).
8. **Un tope silencioso parece un error.** El tope de toda la app (2.000.000 por defecto) detenía Pieza sin decir por qué.
   · Opcional por defecto; al alcanzarlo, un aviso con «Quitar el tope y seguir».
9. **Lo que se puede arreglar solo, se arregla solo.** La persona no debería apretar «Arreglar»: la IA corrige con el error, después
   se divide el paso, y solo al final se pregunta. · `autoReparar` en los dos modos (prueba en `pruebas/interfaz.mjs`).

## El computador de la persona

10. **Las apps no heredan el PATH de la terminal.** Rust de rustup (`~/.cargo/bin`) no se encontraba e «Instalar» instalaba otro.
    · `preparar_path()` en Rust y `RUTAS_EXTRA` en Python; antes de instalar, revisar de nuevo.
11. **Para cortar un proceso, `TERM` al hijo y esperar**; matar su grupo (`kill -KILL -pid`) llegó a tumbar el entorno entero.
    · `matar()` en la pieza `ia` (Rust).

## Código y pruebas

12. **`acciones.json` se arma antes de las pruebas**, siempre: uno viejo hacía fallar cada paso. · `_armar_acciones`.
13. **Lo que usa `cfg(unix)` deja `mut` sin usar en Windows** y `clippy -D warnings` falla solo allá. · Variables por `cfg`.
14. **Otras pruebas cambian funciones del módulo** (`proyectos.probar = lambda …`). · Guarda la real al importar (`PROBAR_REAL`).
15. **Redondear a pocos decimales rompe comparaciones finas** (Pilota: `spread_relativo` a 8 decimales). · Redondea solo al mostrar.

## Velocidad

16. **Cada archivo que la IA lee se vuelve a leer en cada vuelta.** En Pilota, un paso estimado en 50 mil tokens gastaba 200 a 700
    mil y releía 15 a 18 millones de la caché: leía entero `pruebas/test_app.py` (3.000 líneas) y `AGENTS.md` varias veces, y
    reescribía archivos completos. · `reglas.md` y `_prompt_editar` piden Grep + leer solo la parte, Edit en vez de Write y
    archivos chicos por tema; el mapa marca los GRANDES; la interfaz avisa y ofrece ordenarlos; cada paso guarda cuánto tardó
    (prueba `test_archivos_grandes_se_marcan`).

