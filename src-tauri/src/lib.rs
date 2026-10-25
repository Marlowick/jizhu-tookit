mod commands;
mod jq;
mod regex;
pub mod worker;

use tauri::menu::{Menu, PredefinedMenuItem, Submenu};

/// macOS 默认菜单里带 ⌘W「关闭窗口」，会抢走标签页的关闭快捷键。
/// 这里自建菜单：保留 App / 编辑 / 窗口，去掉关闭窗口。
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let app_menu = Submenu::with_items(
        app,
        "机杼",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "编辑",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "窗口",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
        ],
    )?;

    Menu::with_items(app, &[&app_menu, &edit_menu, &window_menu])
}

pub fn run() {
    tauri::Builder::default()
        .menu(build_menu)
        .on_page_load(|_window, payload| {
            #[cfg(debug_assertions)]
            eprintln!("[jizhu] page loaded: {}", payload.url());
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            commands::ui_ready,
            commands::json_analyze,
            commands::json_format,
            commands::json_minify,
            commands::open_text_file,
            commands::save_text_file,
            commands::save_binary_file,
            commands::copy_text,
            commands::diff_text,
            commands::diff_json,
            commands::diff_url,
            commands::regex_run,
            commands::jq_engines,
            commands::jq_run,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run jizhu");
}
