# Reglas para la IA (Pieza)

Estas reglas van en cada pedido. Son cortas a propósito: cada pedido es un solo paso.

## Lo que no se negocia
1. **Las piezas no se tocan.** Los archivos que lista `piezas.json` vienen de Pieza. Nunca los cambies. Si una pieza no alcanza,
   dilo en `resumen`. `piezas.json` y `acciones.json` los arma `pieza.py`: tampoco los escribas. `pruebas/correr.sh` tampoco:
   si una prueba falla, arregla el código o la prueba, nunca el que las corre.
2. **Una acción nueva va en `app.json` → `acciones`** (script en `bin/`, `args`, `entrada: "archivo"`, `datos` con su regla y
   `responde`). Pieza arma `acciones.json` sola, antes de cada prueba: si el contrato dice «acciones.json no está al día», no lo escribas; revisa la acción en `app.json`. No cambies `id`, `nombre`, `repo`, `datos`, `plataformas` ni `version`.
   Una carpeta nueva en la raíz va también en `.gitignore` (es una lista blanca).
3. **Solo lo propio de la app.** Escribe lo que pide el paso y nada más.
4. **Los datos son de la persona.** Viven en su computador. Nada de servidores propios ni telemetría.
5. **Lo que viene de afuera se valida y se escapa.** En la interfaz, el contenido de la persona va con `esc()`.
6. **Sin dependencias nuevas.** Python solo con la biblioteca estándar. La interfaz sin npm ni CDN, y sin scripts en línea.
7. **Todo texto visible tiene su inglés** en `ui/idiomas/en.json`, como frase completa con marcadores.
8. **Datos ficticios** en ejemplos y pruebas (Ana Pérez, Matías Soto).

## Cómo trabajar (rápido y barato: cada archivo que lees se vuelve a leer en cada vuelta)
1. **Parte por lo que ya trae este pedido**: el mapa de archivos, el **índice** (qué función o sección hay en cada archivo y en qué
   línea), lo que dejaron los pasos anteriores y las reglas. Con el índice vas directo a la línea: no explores. De `AGENTS.md`
   lee solo la sección que necesitas (búscala con Grep), no el archivo entero.
2. **Busca antes de leer.** Ubica con Grep o Glob y lee solo esa parte (Read con `offset` y `limit`). No leas entero un archivo de
   más de 300 líneas y no vuelvas a leer lo que ya leíste. El mapa marca los archivos grandes.
3. **Cambia solo lo que cambia** (Edit). Write solo para archivos nuevos. (Si respondes en JSON, como con Gemini, van completos.)
4. **Archivos chicos.** Si un archivo propio pasa de 800 líneas, lo nuevo va en un archivo nuevo del mismo tema: pruebas en
   `pruebas/test_<tema>.py` (se corren solas), lógica en `bin/lib_<tema>.py`. `AGENTS.md` queda corto: el detalle va en `docs/`.
5. Sigue la forma de lo que ya está (`ui/app.js`, `bin/`, `pruebas/`). Suma o cambia las pruebas del paso.
6. Después de tu respuesta, Pieza corre `bash pruebas/correr.sh`. Si falla, recibes el error y tienes un intento más.
