//! UniOS desktop shell. The Rust side is intentionally thin: it owns the Workspace folder,
//! the SQLite connection, safe filesystem access and backups. Business logic lives in the
//! TypeScript application layer so it can be reused by a future mobile client.
pub mod backup;
pub mod commands;
pub mod db;
pub mod error;
pub mod fsops;
pub mod paths;
pub mod workspace;

use commands::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // A second launch focuses the running window instead of opening the
            // same workspace twice.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::pointer_read,
            commands::pointer_set_ui,
            commands::pointer_forget,
            commands::workspace_startup,
            commands::workspace_check,
            commands::workspace_open,
            commands::workspace_create,
            commands::workspace_init_database,
            commands::workspace_close,
            commands::workspace_info,
            commands::workspace_validate,
            commands::workspace_rename,
            commands::workspace_reveal,
            commands::path_is_dir_empty,
            commands::settings_read,
            commands::settings_write,
            commands::log_write,
            commands::log_read,
            commands::db_query,
            commands::db_execute,
            commands::db_batch,
            commands::fs_list_dir,
            commands::fs_import_files,
            commands::fs_create_dir,
            commands::fs_ensure_dir,
            commands::fs_rename,
            commands::fs_move,
            commands::fs_copy,
            commands::fs_trash,
            commands::fs_restore,
            commands::fs_delete_permanent,
            commands::fs_empty_trash,
            commands::fs_stat_many,
            commands::fs_hash,
            commands::fs_hash_external,
            commands::fs_write_text,
            commands::fs_read_text,
            commands::fs_read_external_text,
            commands::fs_folder_stats,
            commands::fs_absolute_path,
            commands::fs_open,
            commands::fs_reveal,
            commands::open_external_path,
            commands::open_url,
            commands::backup_create,
            commands::backup_list,
            commands::backup_list_at,
            commands::backup_inspect,
            commands::backup_restore_current,
            commands::backup_restore_new,
            commands::backup_restore_at,
            commands::backup_delete,
            commands::backup_prune,
        ])
        .build(tauri::generate_context!())
        .expect("error while building UniOS")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Close the database cleanly on exit.
                let state = app.state::<AppState>();
                let mut inner = state.0.lock().unwrap_or_else(|p| p.into_inner());
                if let Some(conn) = inner.conn.take() {
                    let _ = conn.execute_batch("PRAGMA optimize;");
                    drop(conn);
                }
            }
        });
}
