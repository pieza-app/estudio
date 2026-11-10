//! requisitos — lo que el computador necesita para construir y publicar apps, y cómo instalar lo que falta (en Rust: fase 3 de
//! «todo en Rust», docs/rust.md de Pieza). Lo atienden las acciones `requisitosLista` y `requisitoInstalar` («rust»: true).
//!
//! - `lista`: cada herramienta con para qué sirve, si está (y su versión) y si Pieza la puede instalar sola en este sistema.
//! - `instalar`: con el instalador del sistema (Homebrew en Mac, winget en Windows). En Linux o sin instalador, `guia`: dónde
//!   bajarla. Nunca baja un binario ni corre un script de internet por su cuenta.

use regex::Regex;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

pub struct Herramienta {
    pub id: &'static str,
    pub nombre: &'static str,
    pub para: &'static str,
    pub necesaria: bool,
    pub ejecutable: &'static str,
    pub version: &'static [&'static str],
    pub brew: &'static str,
    pub winget: &'static str,
    pub guia: &'static str,
}

pub const HERRAMIENTAS: [Herramienta; 4] = [
    Herramienta { id: "git", nombre: "Git", para: "Guardar las versiones de tu app y publicarla", necesaria: true, ejecutable: "git",
        version: &["--version"], brew: "git", winget: "Git.Git", guia: "https://git-scm.com/downloads" },
    Herramienta { id: "node", nombre: "Node.js", para: "Probar la interfaz de tu app", necesaria: true, ejecutable: "node",
        version: &["--version"], brew: "node", winget: "OpenJS.NodeJS.LTS", guia: "https://nodejs.org/" },
    Herramienta { id: "rust", nombre: "Rust",
        para: "Armar y probar la parte nativa de tu app (Rust + Tauri). Sin Rust, las pruebas de cada paso no la revisan.",
        necesaria: true, ejecutable: "cargo", version: &["--version"], brew: "rust", winget: "Rustlang.Rustup", guia: "https://rustup.rs/" },
    Herramienta { id: "gh", nombre: "GitHub CLI", para: "Publicar tu app con tu cuenta de GitHub", necesaria: false, ejecutable: "gh",
        version: &["--version"], brew: "gh", winget: "GitHub.cli", guia: "https://cli.github.com/" },
];

/// Las apps no heredan el PATH de la terminal: suma donde suelen quedar estas herramientas (Homebrew, rustup).
pub fn preparar_path() {
    static LISTO: OnceLock<()> = OnceLock::new();
    LISTO.get_or_init(|| {
        let casa = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from).unwrap_or_default();
        let extra = [casa.join(".cargo").join("bin"), PathBuf::from("/opt/homebrew/bin"), PathBuf::from("/usr/local/bin")];
        let mut todas: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
        for d in extra {
            if d.is_dir() && !todas.contains(&d) {
                todas.push(d);
            }
        }
        if let Ok(p) = std::env::join_paths(todas) {
            std::env::set_var("PATH", p);
        }
    });
}

/// Un ejecutable en el PATH (con .exe en Windows).
pub fn buscar(nombre: &str) -> Option<PathBuf> {
    preparar_path();
    let exts: &[&str] = if cfg!(windows) { &[".exe", ".cmd", ""] } else { &[""] };
    std::env::split_paths(&std::env::var_os("PATH")?).flat_map(|d| exts.iter().map(move |e| d.join(format!("{nombre}{e}")))).find(|p| p.is_file())
}

/// Corre una orden con límite de tiempo: (salió bien, salida + errores).
fn correr(cmd: &PathBuf, args: &[&str], limite: Duration) -> (bool, String) {
    let Ok(mut p) = Command::new(cmd).args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn() else {
        return (false, String::new());
    };
    let fin = Instant::now() + limite;
    loop {
        match p.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < fin => std::thread::sleep(Duration::from_millis(100)),
            _ => {
                let _ = p.kill();
                let _ = p.wait();
                return (false, "La instalación tardó demasiado.".into());
            }
        }
    }
    match p.wait_with_output() {
        Ok(o) => (o.status.success(), format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr))),
        Err(_) => (false, String::new()),
    }
}

fn version(h: &Herramienta) -> String {
    let Some(cmd) = buscar(h.ejecutable) else { return String::new() };
    let (_, texto) = correr(&cmd, h.version, Duration::from_secs(20));
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\d+\.\d+(?:\.\d+)?").expect("regex")).find(&texto).map(|m| m.as_str().to_string()).unwrap_or_default()
}

pub fn instalador() -> &'static str {
    if cfg!(target_os = "macos") && buscar("brew").is_some() {
        "brew"
    } else if cfg!(windows) && buscar("winget").is_some() {
        "winget"
    } else {
        ""
    }
}

pub fn lista() -> Value {
    let inst = instalador();
    let herramientas: Vec<Value> = HERRAMIENTAS.iter().map(|h| {
        let v = version(h);
        json!({"id": h.id, "nombre": h.nombre, "para": h.para, "necesaria": h.necesaria, "hay": !v.is_empty(), "version": v,
               "puede_instalar": !inst.is_empty(), "guia": h.guia})
    }).collect();
    json!({"ok": true, "herramientas": herramientas, "instalador": inst})
}

fn con(mut base: Value, extra: Value) -> Value {
    if let (Some(b), Some(e)) = (base.as_object_mut(), extra.as_object()) {
        for (k, v) in e {
            b.insert(k.clone(), v.clone());
        }
    }
    base
}

/// Instala una herramienta (`entrada.id`, ya validado por app.json). Primero revisa de nuevo: si ya está, no instala nada.
pub fn instalar(entrada: &Map<String, Value>, emitir: &dyn Fn(Value)) -> Value {
    let Some(h) = HERRAMIENTAS.iter().find(|h| Some(h.id) == entrada.get("id").and_then(Value::as_str)) else {
        return json!({"ok": false, "error": "Herramienta desconocida."});
    };
    if !version(h).is_empty() {
        return con(lista(), json!({"instalada": h.id, "ya": true}));
    }
    let inst = instalador();
    let Some(cmd) = buscar(inst).filter(|_| !inst.is_empty()) else {
        return con(lista(), json!({"ok": false, "guia": h.guia, "error": "Pieza no puede instalarla sola en este computador: bájala desde su página."}));
    };
    let args: Vec<&str> = if inst == "brew" { vec!["install", h.brew] }
        else { vec!["install", "--id", h.winget, "-e", "--accept-source-agreements", "--accept-package-agreements"] };
    emitir(json!({"t": "fase", "fase": "instalar", "id": h.id}));
    let (ok, salida) = correr(&cmd, &args, Duration::from_secs(1500));
    if h.id == "rust" && inst == "winget" {
        if let Some(rustup) = buscar("rustup") {
            let _ = correr(&rustup, &["default", "stable"], Duration::from_secs(900));
        }
    }
    if !ok && buscar(h.ejecutable).is_none() {
        let error: String = Some(salida.trim().to_string()).filter(|s| !s.is_empty()).unwrap_or_else(|| "No se pudo instalar.".into());
        let corto: String = error.chars().rev().take(400).collect::<Vec<_>>().into_iter().rev().collect();
        return con(lista(), json!({"ok": false, "guia": h.guia, "error": corto}));
    }
    con(lista(), json!({"instalada": h.id}))
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn lista_trae_las_cuatro_con_rust_necesario() {
        let l = lista();
        let ids: Vec<&str> = l["herramientas"].as_array().unwrap().iter().filter_map(|h| h["id"].as_str()).collect();
        assert_eq!(ids, ["git", "node", "rust", "gh"]);
        assert_eq!(l["herramientas"][2]["necesaria"], true);
        assert!(l["herramientas"][0]["guia"].as_str().unwrap().starts_with("https://"));
    }

    #[test]
    fn lo_que_ya_esta_no_se_instala() {
        // git está en cualquier lugar donde corren estas pruebas.
        let r = instalar(json!({"id": "git"}).as_object().unwrap(), &|_| panic!("no debe instalar"));
        assert_eq!((r["instalada"].as_str(), r["ya"].as_bool()), (Some("git"), Some(true)));
        assert_eq!(instalar(json!({"id": "otra"}).as_object().unwrap(), &|_| {})["ok"], false);
    }
}
