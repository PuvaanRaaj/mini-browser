# Authenticator migration fixtures

These fixtures contain only synthetic test accounts. They are safe to commit and must never be replaced with a user's real Firefox export.

Common password for every encrypted fixture: `fixture-password`.

| Fixture | Expected result |
| --- | --- |
| `firefox-standard-unencrypted.txt` | 3 records: TOTP, non-default TOTP, HOTP with counter 7 |
| `firefox-special-unencrypted.json` | 4 records: TOTP, HOTP, Steam, Battle.net |
| `firefox-v8-encrypted.json` | 2 records and one v3 `Key`; whole-record encryption |
| `firefox-v7-v2-encrypted.json` | 2 records plus wrapped legacy `key`; secret-only encryption |
| `firefox-v7-v2-encrypted-root-key.json` | 1 record with legacy bug-557 root `enc`/`hash` key fields |
| `firefox-legacy-v1-encrypted.json` | 1 record; secret encrypted directly with the password |

Dummy plaintext secrets used by the vectors:

- Example TOTP: `JBSWY3DPEHPK3PXP`
- Counter Example HOTP: `KRUGS4ZANFZSAYJA`
- Steam: `MFRGGZDFMZTWQ2LK`
- Battle.net: `ONSWG4TFOQ======`

The v8 fixture uses key ID `11111111-1111-4111-8111-111111111111`, Argon2 salt text `0123456789abcdef0123456789abcdef`, and the exact v8 Argon2id parameters documented in `docs/rewrite/firefox-authenticator-format.md`.

The legacy v2 fixture uses a deterministic 120-byte data key containing byte values `0x00` through `0x77`. Its Argon2 verifier is valid but is not secret. Ciphertexts use the upstream CryptoJS 4.1.1 passphrase API and therefore contain random public salts.
