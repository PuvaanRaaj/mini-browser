# minimal-auth

Pure Rust, content-detected migration decoder for Firefox Authenticator backups.

Parsing and decryption only produce a preview. `commit_preview` permits one
atomic protected-storage transaction only after every input record is accepted.
Passwords and derived material are zeroized where practical. Callers must never
log backup content, OTP records, passwords, keys, or decrypted values.

The legacy CryptoJS construction is import-only and must never be used for new
Minimal storage or exports.
