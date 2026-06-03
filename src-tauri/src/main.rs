#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri::Manager;

#[derive(Clone, serde::Serialize)]
struct Payload {
  message: String,
}

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      #[cfg(debug_assertions)]
      {
        let window = app.get_window("main").unwrap();
        window.open_devtools();
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      greet,
      save_to_storage,
      read_from_storage
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
fn greet(name: &str) -> String {
  format!("Hello, {}! Welcome to TTS Copilot.", name)
}

#[tauri::command]
fn save_to_storage(key: String, value: String) -> Result<String, String> {
  // TODO: Implement secure storage using Tauri's app data directory
  // For now, frontend handles storage via localStorage
  Ok(format!("Saved {} successfully", key))
}

#[tauri::command]
fn read_from_storage(key: String) -> Result<String, String> {
  // TODO: Implement secure storage read from Tauri's app data directory
  // For now, frontend handles storage via localStorage
  Ok(format!("Read value for {}", key))
}
