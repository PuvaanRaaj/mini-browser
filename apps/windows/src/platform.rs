use std::{mem::size_of, ptr::null_mut};

use minimal_core::resolve_navigation;
use webview2_com::{
    CoTaskMemPWSTR, CreateCoreWebView2ControllerCompletedHandler,
    CreateCoreWebView2EnvironmentCompletedHandler, Microsoft::Web::WebView2::Win32::*,
    NavigationStartingEventHandler, PermissionRequestedEventHandler,
};
use windows::{
    Win32::{
        Foundation::{E_POINTER, HINSTANCE, HWND, LPARAM, LRESULT, RECT, WPARAM},
        Graphics::Gdi::UpdateWindow,
        System::{
            Com::{COINIT_APARTMENTTHREADED, CoInitializeEx, CoUninitialize},
            LibraryLoader::GetModuleHandleW,
        },
        UI::WindowsAndMessaging::*,
    },
    core::{Error, HSTRING, PCWSTR, PWSTR, Result, w},
};

const WINDOW_CLASS: PCWSTR = w!("MinimalNativeWindow");
const TOOLBAR_HEIGHT: i32 = 48;
const CONTROL_HEIGHT: i32 = 30;
const CONTROL_TOP: i32 = 9;
const BUTTON_WIDTH: i32 = 42;
const CONTROL_GAP: i32 = 6;
const ID_BACK: usize = 1001;
const ID_FORWARD: usize = 1002;
const ID_RELOAD: usize = 1003;
const ID_OMNIBOX: usize = 1004;
const ID_GO: usize = 1005;

struct AppState {
    back: HWND,
    forward: HWND,
    reload: HWND,
    omnibox: HWND,
    go: HWND,
    new_tab: HWND,
    controller: Option<ICoreWebView2Controller>,
    webview: Option<ICoreWebView2>,
    pending_url: Option<String>,
    engine_initializing: bool,
}

impl AppState {
    const fn empty() -> Self {
        Self {
            back: HWND(null_mut()),
            forward: HWND(null_mut()),
            reload: HWND(null_mut()),
            omnibox: HWND(null_mut()),
            go: HWND(null_mut()),
            new_tab: HWND(null_mut()),
            controller: None,
            webview: None,
            pending_url: None,
            engine_initializing: false,
        }
    }
}

struct ComApartment;

impl Drop for ComApartment {
    fn drop(&mut self) {
        // SAFETY: `run` initializes COM on this same thread and this guard is dropped there.
        unsafe { CoUninitialize() };
    }
}

pub fn run() -> Result<()> {
    // SAFETY: the process owns this UI thread and initializes one STA before WebView2 use.
    unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()? };
    let _com = ComApartment;

    // SAFETY: registration and the message loop are confined to the initialized UI thread.
    unsafe {
        let module = GetModuleHandleW(None)?;
        let instance = HINSTANCE(module.0);
        let cursor = LoadCursorW(None, IDC_ARROW)?;
        let window_class = WNDCLASSEXW {
            cbSize: size_of::<WNDCLASSEXW>() as u32,
            lpfnWndProc: Some(window_proc),
            hInstance: instance,
            hCursor: cursor,
            lpszClassName: WINDOW_CLASS,
            ..Default::default()
        };
        if RegisterClassExW(&window_class) == 0 {
            return Err(Error::from_thread());
        }

        let window = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            WINDOW_CLASS,
            w!("Minimal"),
            WS_OVERLAPPEDWINDOW | WS_VISIBLE,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            1180,
            760,
            None,
            None,
            Some(instance),
            None,
        )?;

        // WM_CREATE has synchronously installed native chrome. The page engine is still absent.
        let _ = ShowWindow(window, SW_SHOW);
        let _ = UpdateWindow(window);

        let mut message = MSG::default();
        loop {
            let status = GetMessageW(&mut message, None, 0, 0).0;
            if status == -1 {
                return Err(Error::from_thread());
            }
            if status == 0 {
                break;
            }
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
    Ok(())
}

unsafe extern "system" fn window_proc(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        WM_CREATE => {
            // SAFETY: this allocation is stored once and reclaimed at WM_NCDESTROY.
            let state_ptr = Box::into_raw(Box::new(AppState::empty()));
            unsafe { SetWindowLongPtrW(window, GWLP_USERDATA, state_ptr as isize) };
            if unsafe { create_native_chrome(window, &mut *state_ptr) }.is_err() {
                return LRESULT(-1);
            }
            LRESULT(0)
        }
        WM_SIZE => {
            if let Some(state) = unsafe { state_mut(window) } {
                unsafe { layout(window, state) };
            }
            LRESULT(0)
        }
        WM_COMMAND => {
            if let Some(state) = unsafe { state_mut(window) } {
                unsafe { handle_command(window, state, wparam.0 & 0xffff) };
            }
            LRESULT(0)
        }
        WM_DESTROY => {
            unsafe { PostQuitMessage(0) };
            LRESULT(0)
        }
        WM_NCDESTROY => {
            let pointer = unsafe { GetWindowLongPtrW(window, GWLP_USERDATA) } as *mut AppState;
            if !pointer.is_null() {
                unsafe { SetWindowLongPtrW(window, GWLP_USERDATA, 0) };
                // SAFETY: pointer came from the single Box::into_raw call in WM_CREATE.
                drop(unsafe { Box::from_raw(pointer) });
            }
            unsafe { DefWindowProcW(window, message, wparam, lparam) }
        }
        _ => unsafe { DefWindowProcW(window, message, wparam, lparam) },
    }
}

unsafe fn create_native_chrome(window: HWND, state: &mut AppState) -> Result<()> {
    state.back = unsafe { create_control(window, w!("BUTTON"), w!("←"), ID_BACK) }?;
    state.forward = unsafe { create_control(window, w!("BUTTON"), w!("→"), ID_FORWARD) }?;
    state.reload = unsafe { create_control(window, w!("BUTTON"), w!("↻"), ID_RELOAD) }?;
    state.omnibox = unsafe { create_control(window, w!("EDIT"), w!(""), ID_OMNIBOX) }?;
    state.go = unsafe { create_control(window, w!("BUTTON"), w!("Go"), ID_GO) }?;
    state.new_tab = unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            w!("STATIC"),
            w!("Minimal\r\nType a web address or search above"),
            WS_CHILD | WS_VISIBLE,
            0,
            TOOLBAR_HEIGHT,
            0,
            0,
            Some(window),
            None,
            None,
            None,
        )?
    };
    unsafe { layout(window, state) };
    Ok(())
}

unsafe fn create_control(parent: HWND, class: PCWSTR, label: PCWSTR, id: usize) -> Result<HWND> {
    let mut style = WS_CHILD | WS_VISIBLE | WS_TABSTOP;
    if id == ID_OMNIBOX {
        style |= WINDOW_STYLE(ES_AUTOHSCROLL as u32) | WS_BORDER;
    }
    unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            class,
            label,
            style,
            0,
            0,
            0,
            0,
            Some(parent),
            Some(HMENU(id as *mut core::ffi::c_void)),
            None,
            None,
        )
    }
}

unsafe fn layout(window: HWND, state: &AppState) {
    let mut bounds = RECT::default();
    let _ = unsafe { GetClientRect(window, &mut bounds) };
    let width = bounds.right.max(0);
    let height = bounds.bottom.max(0);
    let mut x = CONTROL_GAP;
    for button in [state.back, state.forward, state.reload] {
        let _ = unsafe { MoveWindow(button, x, CONTROL_TOP, BUTTON_WIDTH, CONTROL_HEIGHT, true) };
        x += BUTTON_WIDTH + CONTROL_GAP;
    }
    let go_x = (width - CONTROL_GAP - BUTTON_WIDTH).max(x);
    let omnibox_width = (go_x - x - CONTROL_GAP).max(80);
    let _ = unsafe {
        MoveWindow(
            state.omnibox,
            x,
            CONTROL_TOP,
            omnibox_width,
            CONTROL_HEIGHT,
            true,
        )
    };
    let _ = unsafe {
        MoveWindow(
            state.go,
            go_x,
            CONTROL_TOP,
            BUTTON_WIDTH,
            CONTROL_HEIGHT,
            true,
        )
    };
    let content_height = (height - TOOLBAR_HEIGHT).max(0);
    let _ = unsafe {
        MoveWindow(
            state.new_tab,
            0,
            TOOLBAR_HEIGHT,
            width,
            content_height,
            true,
        )
    };
    if let Some(controller) = &state.controller {
        let _ = unsafe {
            controller.SetBounds(RECT {
                left: 0,
                top: TOOLBAR_HEIGHT,
                right: width,
                bottom: height,
            })
        };
    }
}

unsafe fn handle_command(window: HWND, state: &mut AppState, command: usize) {
    match command {
        ID_GO => unsafe { submit_navigation(window, state) },
        ID_BACK => {
            if let Some(webview) = &state.webview {
                let _ = unsafe { webview.GoBack() };
            }
        }
        ID_FORWARD => {
            if let Some(webview) = &state.webview {
                let _ = unsafe { webview.GoForward() };
            }
        }
        ID_RELOAD => {
            if let Some(webview) = &state.webview {
                let _ = unsafe { webview.Reload() };
            }
        }
        _ => {}
    }
}

unsafe fn submit_navigation(window: HWND, state: &mut AppState) {
    let length = unsafe { GetWindowTextLengthW(state.omnibox) };
    let mut input = vec![0_u16; (length + 1) as usize];
    let copied = unsafe { GetWindowTextW(state.omnibox, &mut input) };
    let input = String::from_utf16_lossy(&input[..copied as usize]);
    let url = resolve_navigation(&input);
    if url.is_empty() {
        return;
    }
    if let Some(webview) = &state.webview {
        let _ = unsafe { webview.Navigate(&HSTRING::from(url)) };
    } else {
        state.pending_url = Some(url);
        if !state.engine_initializing {
            state.engine_initializing = true;
            unsafe { create_webview(window) };
        }
    }
}

unsafe fn create_webview(window: HWND) {
    let handler = CreateCoreWebView2EnvironmentCompletedHandler::create(Box::new(
        move |environment_result, environment| {
            environment_result?;
            let environment = environment.ok_or_else(|| Error::from(E_POINTER))?;
            let controller_handler = CreateCoreWebView2ControllerCompletedHandler::create(
                Box::new(move |controller_result, controller| {
                    controller_result?;
                    let controller = controller.ok_or_else(|| Error::from(E_POINTER))?;
                    // SAFETY: callbacks run on the owning UI thread while the HWND lives.
                    unsafe { attach_webview(window, controller) }
                }),
            );
            unsafe { environment.CreateCoreWebView2Controller(window, &controller_handler) }
        },
    ));
    // No wait or nested pump: native chrome remains responsive while the runtime starts.
    if unsafe { CreateCoreWebView2Environment(&handler) }.is_err()
        && let Some(state) = unsafe { state_mut(window) }
    {
        state.engine_initializing = false;
    }
}

unsafe fn attach_webview(window: HWND, controller: ICoreWebView2Controller) -> Result<()> {
    let webview = unsafe { controller.CoreWebView2()? };
    let settings = unsafe { webview.Settings()? };
    unsafe {
        settings.SetAreDevToolsEnabled(false)?;
        settings.SetIsWebMessageEnabled(false)?;
        settings.SetAreHostObjectsAllowed(false)?;
    }

    let permission_handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
        if let Some(args) = args {
            // Permissions are denied until the native permission UI is implemented.
            unsafe { args.SetState(COREWEBVIEW2_PERMISSION_STATE_DENY)? };
        }
        Ok(())
    }));
    let mut permission_token = 0_i64;
    unsafe { webview.add_PermissionRequested(&permission_handler, &mut permission_token)? };

    let navigation_handler = NavigationStartingEventHandler::create(Box::new(|_, args| {
        if let Some(args) = args {
            let mut uri = PWSTR(null_mut());
            unsafe { args.Uri(&mut uri)? };
            let uri = CoTaskMemPWSTR::from(uri).to_string().to_ascii_lowercase();
            if !uri.starts_with("https://")
                && !uri.starts_with("http://")
                && !uri.starts_with("about:")
            {
                unsafe { args.SetCancel(true)? };
            }
        }
        Ok(())
    }));
    let mut navigation_token = 0_i64;
    unsafe { webview.add_NavigationStarting(&navigation_handler, &mut navigation_token)? };

    let state = unsafe { state_mut(window) }.ok_or_else(Error::from_thread)?;
    state.controller = Some(controller);
    state.webview = Some(webview.clone());
    state.engine_initializing = false;
    let _ = unsafe { ShowWindow(state.new_tab, SW_HIDE) };
    unsafe { layout(window, state) };
    unsafe { state.controller.as_ref().unwrap().SetIsVisible(true)? };
    if let Some(url) = state.pending_url.take() {
        unsafe { webview.Navigate(&HSTRING::from(url))? };
    }
    Ok(())
}

unsafe fn state_mut(window: HWND) -> Option<&'static mut AppState> {
    let pointer = unsafe { GetWindowLongPtrW(window, GWLP_USERDATA) } as *mut AppState;
    // The pointer belongs to the HWND and is only accessed on its UI thread.
    unsafe { pointer.as_mut() }
}
