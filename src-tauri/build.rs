fn main() {
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "native_cancel", "computer_status", "computer_grant", "computer_tool",
            "model_pick", "model_configuration_pick", "open_external", "browser_tool", "browser_manage", "workspace_status",
            "workspace_choose", "workspace_current", "terminal_open", "terminal_read", "terminal_write",
            "terminal_resize", "terminal_close", "browser_select", "browser_open",
            "browser_status", "browser_navigate", "browser_action", "browser_bounds", "browser_close",
        ]),
    );
    tauri_build::try_build(attributes).expect("Failed to configure desktop command permissions");
}
