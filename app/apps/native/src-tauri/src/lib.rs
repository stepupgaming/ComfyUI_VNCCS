mod runtime;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(runtime::RuntimeState::default())
    .invoke_handler(tauri::generate_handler![
      runtime::runtime_status,
      runtime::runtime_start,
      runtime::runtime_stop,
      runtime::runtime_logs
    ])
    .build(tauri::generate_context!())
    .expect("error while building VNCCS Studio")
    .run(|app, event| {
      if let tauri::RunEvent::Exit = event {
        runtime::stop(&app.state::<runtime::RuntimeState>());
      }
    });
}
