#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(windows)]
mod platform;

#[cfg(windows)]
fn main() -> windows::core::Result<()> {
    platform::run()
}

#[cfg(not(windows))]
fn main() {
    println!("minimal-windows is a native Windows application");
}

#[cfg(test)]
mod tests {
    use minimal_core::resolve_navigation;

    #[test]
    fn shell_uses_the_shared_navigation_contract() {
        assert_eq!(resolve_navigation("minimal.app"), "https://minimal.app");
        assert_eq!(
            resolve_navigation("fast private browser"),
            "https://duckduckgo.com/?q=fast%20private%20browser"
        );
    }
}
