#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

struct Sidecar(Mutex<Option<Child>>);

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("bind ephemeral port")
        .local_addr()
        .expect("local addr")
        .port()
}

fn wait_ready(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

fn auth_secret(data_dir: &Path) -> String {
    let path = data_dir.join("auth.secret");
    if let Ok(existing) = fs::read_to_string(&path) {
        if existing.trim().len() >= 32 {
            return existing.trim().to_string();
        }
    }
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("generate session secret");
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    let _ = fs::write(&path, &hex);
    hex
}

fn main() {
    tauri::Builder::default()
        .manage(Sidecar(Mutex::new(None)))
        .setup(|app| {
            let res = app.path().resource_dir()?;
            let data = app.path().app_data_dir()?;
            fs::create_dir_all(&data)?;

            let db = data.join("forge.db");
            if !db.exists() {
                fs::copy(res.join("template").join("forge.db"), &db)?;
            }

            let port = free_port();
            let server_dir = res.join("server");
            let mut cmd = Command::new(res.join("node").join("node.exe"));
            cmd.arg("server.js")
                .current_dir(&server_dir)
                .env("PORT", port.to_string())
                .env("HOSTNAME", "127.0.0.1")
                .env("NODE_ENV", "production")
                .env(
                    "DATABASE_URL",
                    format!("file:{}", db.to_string_lossy().replace('\\', "/")),
                )
                .env("AUTH_SECRET", auth_secret(&data))
                // The sidecar is plain HTTP on loopback; a Secure cookie would be
                // silently dropped and every login would bounce back to /login.
                .env("FORGE_ALLOW_INSECURE_COOKIE", "1");
            if let Ok(log) = fs::File::create(data.join("server.log")) {
                if let Ok(err) = log.try_clone() {
                    cmd.stdout(Stdio::from(log)).stderr(Stdio::from(err));
                }
            }
            let child = cmd.spawn()?;
            *app.state::<Sidecar>().0.lock().unwrap() = Some(child);

            if !wait_ready(port, Duration::from_secs(30)) {
                return Err("Forge server did not become ready; see server.log".into());
            }

            let url = format!("http://127.0.0.1:{port}");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse()?))
                .title("Forge")
                .inner_size(1280.0, 800.0)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Forge")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(mut child) = app.state::<Sidecar>().0.lock().unwrap().take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}