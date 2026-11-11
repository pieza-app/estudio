// Pieza: la app nativa (pieza «host-tauri»). Desde aquí es de la app: registra lo propio (acciones que no son un
// script, medios, menús) y deja lo demás al host. Lo que solo corre un script se declara en app.json → acciones.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod pieza;
#[path = "pieza/progreso.rs"]
mod progreso;
#[path = "pieza/actualizaciones.rs"]
mod actualizaciones;
mod requisitos;
// Piezas en Rust que la lógica de Pieza va a usar al pasar de Python a Rust (docs/rust.md de Pieza).
#[path = "pieza/ia.rs"]
#[allow(dead_code)]
mod ia;
#[path = "pieza/red.rs"]
#[allow(dead_code)]
mod red;
#[path = "pieza/trabajos.rs"]
#[allow(dead_code)]
mod trabajos;

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
    arrancar(tauri::generate_context!(), op, |host| {
        // Acciones en Rust («rust»: true en app.json): el host valida sus datos igual que para un script (docs/rust.md de Pieza).
        host.funcion("requisitosLista", |_, _| requisitos::lista());
        host.funcion("requisitoInstalar", |d, avance| requisitos::instalar(&d, &|e| avance.emitir(e)));
    });
}

#[cfg(test)]
mod pruebas {
    // Lo que manda la interfaz tiene que pasar las reglas de app.json tal como las aplica el host (la vista previa no las aplica).
    use crate::pieza::enchufe;
    use serde_json::json;

    #[test]
    fn lo_que_manda_la_interfaz_pasa_las_reglas() {
        let recursos = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
        let (acciones, errores) = enchufe::cargar_acciones(&recursos);
        assert!(errores.is_empty(), "{errores:?}");
        for (accion, datos) in [
            ("proyectoPaso", json!({"id": "pilota", "n": 10, "tope": 2_500_000})),
            ("proyectoLote", json!({"id": "pilota", "ns": [10, 11], "tope": 2_500_000})),
            ("proyectoDividir", json!({"id": "pilota", "n": 10, "tope": 250_000})),
            ("proyectoReprobar", json!({"id": "pilota", "n": 3})),
            ("proyectoIndicar", json!({"id": "pilota", "texto": "Usa solo velas de 1 h."})),
            ("proyectoIndicar", json!({"id": "pilota", "quitar": 0})),
            ("requisitoInstalar", json!({"id": "rust"})),
        ] {
            let def = acciones.get(accion).unwrap_or_else(|| panic!("falta {accion}"));
            assert!(enchufe::validar_datos(def, &datos).is_ok(), "{accion} rechaza {datos}");
        }
    }
}
