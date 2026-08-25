# minimal-otp

Pure Rust code generation for records imported from Firefox Authenticator.
It supports TOTP, HOTP, Steam Guard, Battle.net, and the extension's `hex` /
`hhex` forms, including SHA-1, SHA-256, and SHA-512 where the record permits
them. The API is deterministic for a supplied Unix timestamp or counter and
does no I/O.

The crate accepts secrets only for the duration of code generation. Callers
must keep `OtpRecord` and generated codes out of logs and use the platform
secret store supplied by `minimal-storage` for persistence.

RFC 4226 and RFC 6238 vectors plus bounded Steam/Battle.net output tests are
included. This crate does not implement clipboard access, UI, or storage.
