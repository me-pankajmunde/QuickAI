use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub home_dir: String,
}

#[tauri::command]
pub fn read_clipboard(app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri::ClipboardManager;
    app_handle
        .clipboard_manager()
        .read_text()
        .map_err(|e| e.to_string())
        .map(|v| v.unwrap_or_default())
}

#[tauri::command]
pub fn write_clipboard(app_handle: tauri::AppHandle, text: String) -> Result<(), String> {
    use tauri::ClipboardManager;
    app_handle
        .clipboard_manager()
        .write_text(text)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    let home_dir = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| String::from("."));

    SystemInfo { os, arch, home_dir }
}

#[tauri::command]
pub fn show_window(window: tauri::Window) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hide_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ensure_app_dirs() -> Result<Vec<String>, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| String::from("."));

    let dirs = vec![
        format!("{}/QuickAI/logs", home),
        format!("{}/QuickAI/sessions", home),
        format!("{}/QuickAI/agents", home),
    ];

    for dir in &dirs {
        std::fs::create_dir_all(dir).map_err(|e| format!("Failed to create {dir}: {e}"))?;
    }

    Ok(dirs)
}
