use tauri::{
    CustomMenuItem, GlobalShortcutManager, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu,
    SystemTrayMenuItem,
};

mod commands;

pub use commands::*;

pub fn run() {
    env_logger::init();

    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("open", "Open QuickAI"))
        .add_item(CustomMenuItem::new("coding_agent", "Coding Agent (Ctrl+Shift+C)"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "Quit"));

    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "open" => {
                    if let Some(window) = app.get_window("main") {
                        window.show().unwrap_or_default();
                        window.set_focus().unwrap_or_default();
                    }
                }
                "coding_agent" => {
                    if let Some(window) = app.get_window("main") {
                        window.show().unwrap_or_default();
                        window.set_focus().unwrap_or_default();
                        window.emit("open-coding-agent", ()).unwrap_or_default();
                    }
                }
                "quit" => std::process::exit(0),
                _ => {}
            },
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        window.hide().unwrap_or_default();
                    } else {
                        window.show().unwrap_or_default();
                        window.set_focus().unwrap_or_default();
                    }
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_clipboard,
            commands::write_clipboard,
            commands::get_system_info,
            commands::show_window,
            commands::hide_window,
            commands::ensure_app_dirs,
        ])
        .setup(|app| {
            let app_handle = app.handle();

            // Register global hotkey Ctrl+Shift+C for Coding Agent
            let mut shortcut_manager = app_handle.global_shortcut_manager();
            let app_handle_clone = app_handle.clone();
            shortcut_manager
                .register("Ctrl+Shift+C", move || {
                    if let Some(window) = app_handle_clone.get_window("main") {
                        window.show().unwrap_or_default();
                        window.set_focus().unwrap_or_default();
                        window.emit("open-coding-agent", ()).unwrap_or_default();
                    }
                })
                .unwrap_or_else(|e| {
                    log::warn!("Failed to register global shortcut Ctrl+Shift+C: {e}");
                });

            // Ensure app directories exist at startup
            let home = dirs_home();
            for subdir in &["QuickAI/logs", "QuickAI/sessions", "QuickAI/agents"] {
                let path = format!("{}/{}", home, subdir);
                std::fs::create_dir_all(&path).unwrap_or_default();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn dirs_home() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| String::from("."))
}
