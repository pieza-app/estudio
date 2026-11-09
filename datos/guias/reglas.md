# Reglas para la IA (Pieza)

Estas reglas van en cada pedido. Son cortas a propósito: cada pedido es un solo paso.

## Lo que no se negocia
1. **Las piezas no se tocan.** Los archivos que lista `piezas.json` vienen de Pieza. Nunca los cambies. Si una pieza no alcanza,
   dilo en `resumen`.
2. **Solo lo propio de la app.** Escribe lo que pide el paso y nada más.
3. **Los datos son de la persona.** Viven en su computador. Nada de servidores propios ni telemetría.
4. **Lo que viene de afuera se valida y se escapa.** En la interfaz, el contenido de la persona va con `esc()`.
5. **Sin dependencias nuevas.** Python solo con la biblioteca estándar. La interfaz sin npm ni CDN, y sin scripts en línea.
6. **Todo texto visible tiene su inglés** en `ui/idiomas/en.json`, como frase completa con marcadores.
7. **Datos ficticios** en ejemplos y pruebas (Ana Pérez, Matías Soto).

## Cómo trabajar
1. Lee `AGENTS.md` de la app antes de escribir. Ahí está el mapa y cómo se prueba.
2. Mira el ejemplo que dejó `pieza.py crear` (`ui/app.js`, `bin/`, `pruebas/`) y sigue su forma.
3. Escribe archivos completos, no pedazos.
4. Suma o cambia las pruebas del paso (`pruebas/test_app.py`, `pruebas/interfaz.mjs`).
5. Después de tu respuesta, Pieza corre `bash pruebas/correr.sh`. Si falla, recibes el error y tienes un intento más.
