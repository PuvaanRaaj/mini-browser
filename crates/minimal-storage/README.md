# minimal-storage

Durable, engine-independent persistence for Minimal Browser. The crate stores
only non-secret browser state as versioned JSON. OTP seeds, recovery material,
and other credentials must be sent through `SecretStore`; they are deliberately
absent from every on-disk record type.

The legacy readers accept the exact unversioned Electron shapes for
`mini.settings.v1`, `mini.bookmarks.v1`, and `mini.session.v1`, then return the
typed current schema in memory. A legacy session has no timestamp, so its
`saved_at_unix_ms` sentinel is zero. Invalid fields are errors rather than being
silently discarded.

## Atomicity

JSON is serialized deterministically, written to a private temporary file in
the destination directory, flushed with `sync_all`, and atomically persisted
over the destination. The parent directory is synced on Unix. A failure before
the atomic replacement leaves the previous file untouched. Migration commits
stage secrets first and roll them back if a later secret write or public-file
commit fails; rollback failures are returned and must be surfaced to the user.

## Path and permission policy

- The root must be a real directory, not a symbolic link.
- On Unix, the root is forced to mode `0700` and committed JSON files to `0600`.
- Temporary files are created in that same private root, never in a shared
  system temporary directory.
- Windows ACL ownership is delegated to the application shell when it creates
  the per-user application-data directory. A native ACL hardening adapter is a
  platform-shell deliverable; this crate never falls back to a shared path.
- Callers supply fixed filenames. This crate rejects absolute paths, parent
  traversal, nested paths, and symbolic-link destinations.

There is intentionally no Keychain or Windows Credential Manager adapter here.
Native shells implement `SecretStore` and keep the platform-specific security
API outside the shared persistence model.
