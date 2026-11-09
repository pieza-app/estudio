# Pieza

Pieza te ayuda a crear tu propia app de escritorio o de celular, paso a paso. Usa piezas ya hechas y probadas: cada pieza ya hecha no gasta tokens de tu IA.

**[Descargar](https://github.com/pieza-app/estudio/releases/latest) · [Página](https://pieza-app.github.io/pieza/) · [Probar en el navegador](https://pieza-app.github.io/pieza/app/) ·
[Cómo aportar](CONTRIBUTING.md)**

- **Mac** (Apple Silicon, macOS 15): `curl -fsSL https://raw.githubusercontent.com/pieza-app/estudio/main/instalar.sh | bash`
- **Linux**: `curl -fsSL https://raw.githubusercontent.com/pieza-app/estudio/main/instalar.sh | bash`
- **Windows**: `irm https://raw.githubusercontent.com/pieza-app/estudio/main/instalar.ps1 | iex`

Cada instalador baja la última versión de los Releases de este repo y revisa su huella SHA-256 antes de instalar.

## Qué hace hoy

1. Eliges para qué sistemas es tu app (Mac, Windows, Linux, iPhone, Android).
2. Escribes el nombre de la app y lo que hace, en una frase.
3. Eliges las piezas. Pieza sugiere las piezas que calzan con tu frase.
4. Ves la ficha: qué piezas ya están hechas, qué falta hacer, qué permisos pide y cuántos tokens ahorras.
5. Tu IA arma el plan: lo propio de tu app, en pasos chicos, con un estimado de tokens por paso.
6. Pieza crea la app en `~/Pieza/<Nombre>` con las piezas ya hechas. Este paso no gasta tokens.
7. Tu IA hace cada paso. Después de cada uno, Pieza corre las pruebas. Eliges «Paso a paso» (apruebas cada uno) o «Todo
   automático» (con un tope de tokens).

Tu IA (Claude Code, Codex o Gemini) usa tu cuenta. Solo lee la carpeta de tu app: Pieza revisa y escribe los archivos. El plan
completo está en [El programa Pieza](https://github.com/pieza-app/pieza/blob/main/docs/programa.md).

## Cómo está hecha

Una sola interfaz web (`ui/`) para todas las plataformas, la app de escritorio en `escritorio/` (Rust + Tauri,
pieza «host-tauri») y los scripts en `bin/` (Python, solo biblioteca estándar). El catálogo de piezas está en
`datos/catalogo.json`. Para ponerlo al día, usa `python3 herramientas/catalogo_de_pieza.py <carpeta de pieza>`. Lo común viene de
[Pieza](https://github.com/pieza-app/pieza): ver `AGENTS.md` (la guía para personas y para cualquier IA) y `piezas.json`.

```bash
bash pruebas/correr.sh                       # todas las pruebas (contrato, Python, interfaz con Playwright, privacidad)
cd ui && python3 -m http.server 8765         # la vista previa: http://localhost:8765/?bienvenida · ?idioma=en · ?tema=oscuro
```

## Pieza in English

Pieza helps you build your own desktop or phone app, step by step. It uses pieces that are already made and tested: a ready piece costs your AI no tokens.

Free and open source (AGPL-3.0). [Download](https://github.com/pieza-app/estudio/releases/latest) · [Website](https://pieza-app.github.io/pieza/).

[![Hecho con Pieza](https://pieza-app.github.io/pieza/sello.svg)](https://pieza-app.github.io/pieza/)
