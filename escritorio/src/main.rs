// Pieza: la app nativa (pieza «host-tauri»). Desde aquí es de la app: registra lo propio (acciones que no son un
// script, medios, menús) y deja lo demás al host. Lo que solo corre un script se declara en app.json → acciones.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod pieza;
#[path = "pieza/progreso.rs"]
mod progreso;
#[path = "pieza/actualizaciones.rs"]
mod actualizaciones;

use pieza::host::{arrancar, Opciones};
#[allow(unused_imports)]
use std::sync::Arc;

fn main() {
    let op = Opciones {
        global: Some("Pieza".into()),
        sitio: Some("https://pieza-app.github.io/estudio/".into()),
        codigo: Some("https://github.com/pieza-app/estudio".into()),
        lector_progreso: Some(Arc::new(progreso::Lector)),
        actualizaciones: actualizaciones::Actualizaciones::nuevas("pieza-app/estudio", "Pieza").ok().map(|a| Arc::new(a) as _),
        ..Default::default()
    };
    arrancar(tauri::generate_context!(), op, |_host| {
        // _host.registrar("exportar", |datos, host, ctx| { … host.llamar("exportado", serde_json::json!({"ok": true}), ctx.destino()); });
    });
}
