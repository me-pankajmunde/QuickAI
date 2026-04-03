use std::path::PathBuf;

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
    let home_dir = home_dir().to_string_lossy().into_owned();

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
    let base = home_dir().join("QuickAI");
    let dirs = vec![
        base.join("logs"),
        base.join("sessions"),
        base.join("agents"),
    ];

    for dir in &dirs {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create {}: {e}", dir.display()))?;
    }

    Ok(dirs
        .into_iter()
        .map(|dir| dir.to_string_lossy().into_owned())
        .collect())
}

fn home_dir() -> PathBuf {
    tauri::api::path::home_dir().unwrap_or_else(|| PathBuf::from("."))
}
