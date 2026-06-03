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
      read_from_storage,
      encrypt_credential,
      decrypt_credential
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
  // Placeholder for secure storage operations
  Ok(format!("Saved {} with value {}", key, value))
}

#[tauri::command]
fn read_from_storage(key: String) -> Result<String, String> {
  // Placeholder for secure storage read operations
  Ok(format!("Read value for {}", key))
}

#[tauri::command]
fn encrypt_credential(plaintext: String) -> Result<String, String> {
  // Use bcrypt for password hashing
  match bcrypt::hash(&plaintext, 12) {
    Ok(hashed) => Ok(hashed),
    Err(_) => Err("Encryption failed".to_string())
  }
}

#[tauri::command]
fn decrypt_credential(hash: String, plaintext: String) -> Result<bool, String> {
  // Verify password hash
  match bcrypt::verify(&plaintext, &hash) {
    Ok(valid) => Ok(valid),
    Err(_) => Err("Verification failed".to_string())
  }
}
