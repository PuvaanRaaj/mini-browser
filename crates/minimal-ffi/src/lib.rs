//! Narrow C ABI for native shells.
//!
//! The ABI owns only UTF-8 navigation helpers for now. Buffers returned by
//! this crate must be released with [`minimal_free_buffer`]. It exposes no
//! browser handles, page content, or secrets.

use std::slice;

/// Resolves a UTF-8 omnibox value using the shared Rust core.
///
/// Return codes: `0` success, `1` invalid pointers/UTF-8, `2` output pointer
/// failure. A successful empty result is represented by a null output buffer.
///
/// # Safety
///
/// `input` must point to `input_len` readable bytes (or be null when the
/// length is zero). `output` and `output_len` must point to writable storage.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn minimal_resolve_navigation(
    input: *const u8,
    input_len: usize,
    output: *mut *mut u8,
    output_len: *mut usize,
) -> i32 {
    if output.is_null() || output_len.is_null() || (input.is_null() && input_len != 0) {
        return 2;
    }
    // SAFETY: callers provide the pointer and length contract documented by this ABI.
    let bytes = unsafe { slice::from_raw_parts(input, input_len) };
    let Ok(input) = std::str::from_utf8(bytes) else {
        return 1;
    };
    let resolved = minimal_core::resolve_navigation(input);
    let mut buffer = resolved.into_bytes();
    let length = buffer.len();
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    // SAFETY: output pointers were checked above and are exclusively written here.
    unsafe {
        *output = if length == 0 {
            std::ptr::null_mut()
        } else {
            pointer
        };
        *output_len = length;
    }
    0
}

/// Releases a buffer returned by [`minimal_resolve_navigation`].
///
/// # Safety
///
/// `buffer` and `length` must be the exact pair returned by this crate, or a
/// null buffer with any length.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn minimal_free_buffer(buffer: *mut u8, length: usize) {
    if !buffer.is_null() {
        // SAFETY: only buffers returned by this crate may be passed back.
        drop(unsafe { Vec::from_raw_parts(buffer, length, length) });
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn exported_helper_uses_shared_core_semantics() {
        let input = b"example.com";
        let mut output = std::ptr::null_mut();
        let mut output_len = 0;
        // SAFETY: pointers and lengths refer to valid local storage.
        let code = unsafe {
            super::minimal_resolve_navigation(
                input.as_ptr(),
                input.len(),
                &mut output,
                &mut output_len,
            )
        };
        assert_eq!(code, 0);
        // SAFETY: the returned buffer is valid for the reported length.
        let resolved = unsafe { std::slice::from_raw_parts(output, output_len) };
        assert_eq!(resolved, b"https://example.com");
        // SAFETY: this is the buffer returned by the preceding call.
        unsafe { super::minimal_free_buffer(output, output_len) };
    }
}
