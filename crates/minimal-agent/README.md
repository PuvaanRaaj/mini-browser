# minimal-agent

Pure Rust wire contracts and authorization checks for Minimal's opt-in local
automation mode. This crate does not open sockets or bind a port. Native shells
remain responsible for loopback-only transport, token creation/storage, user
approval UI, execution, and audit logging.

The contract deliberately excludes arbitrary JavaScript evaluation and a page
bridge. Every request is authenticated before JSON parsing, every operation is
an allowlisted enum variant, and every operation requires a live capability
grant created by the native shell after explicit user approval. Tab-specific
operations also carry an opaque tab ID and expected revision to reject stale
automation decisions.

Defaults cap request and response bodies at 256 KiB. Page snapshots and
screenshots have additional semantic limits. Unknown JSON fields and unknown
commands are rejected.
