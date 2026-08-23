# Firefox Authenticator backup format

Research target: [Authenticator-Extension/Authenticator](https://github.com/Authenticator-Extension/Authenticator), the Firefox add-on documented at authenticator.cc. This is not a generic description of every Firefox authenticator add-on.

Verified upstream snapshots:

- current tagged format: `v8.0.2`, commit [`6c30495bacc90ca27409f055342cb81db50c7608`](https://github.com/Authenticator-Extension/Authenticator/tree/6c30495bacc90ca27409f055342cb81db50c7608)
- legacy boundary: `v7.0.0`, commit [`bf630cc239e021ad23af88df1e01c06d5ae899bc`](https://github.com/Authenticator-Extension/Authenticator/tree/bf630cc239e021ad23af88df1e01c06d5ae899bc)
- format-changing v8 commit: [`17aa2068553db3c3aac081c9ffe393536f33b28b`](https://github.com/Authenticator-Extension/Authenticator/commit/17aa2068553db3c3aac081c9ffe393536f33b28b)

The export format is browser-independent in this extension. A file downloaded from Firefox follows the same code path as Chrome and Edge.

## Importer detection order

1. Read the file as UTF-8 text. Accept either LF or CRLF.
2. Try to parse the entire text as a JSON object. If parsing fails, parse it as one `otpauth:` URI per line.
3. For JSON, inspect values rather than trusting the extension:
   - any object with `dataType: "EncOTPStorage"` means v8+ encrypted JSON;
   - otherwise, any entry with `encrypted: true` means legacy encrypted JSON;
   - otherwise it is unencrypted `OTPStorage` JSON.
4. For legacy encrypted JSON, use the wrapped-key path when a root `key: { enc, hash }` exists. Also accept the historical cloud-backup compatibility shape with root `enc` and `hash`. With neither shape, use the v1 direct-password path.
5. Reject mixed or malformed records individually and report every skipped record. Never silently treat an encrypted value as plaintext.

File names are conventions only. Upstream normally downloads `authenticator.txt` for an unencrypted standard backup and `authenticator.json` for encrypted data or an unencrypted backup containing Steam/Battle.net entries. Cloud files are commonly named `yyyymmdd.json`. Upstream documentation explicitly says users may rename them, so detection must be content-based.

## Unencrypted standard text (`authenticator.txt`)

The [upstream developer documentation](https://authenticator.cc/docs/en/otp-backup-developer.html) defines this as UTF-8 plain text with one `otpauth://` URI per line. The extension emits `totp` and `hotp`; it maps internal `hex` to `totp` and `hhex` to `hotp`.

Supported query fields are:

- required: `secret`;
- optional: `issuer`, `counter` for HOTP, `period` for TOTP, `digits`, and `algorithm`;
- label: `issuer:account`, URI-encoded. Upstream removes colons from issuer/account before export.

The extension parser defaults `counter` to 0, `period` to 30, `digits` to 6, and `algorithm` to SHA-1. The upstream exporter writes HOTP `counter`; an importer must preserve it even though the extension's older text-import implementation commented out counter parsing. Losing the counter can invalidate the next HOTP code.

Steam and Battle.net cannot be represented by this standard export. Their presence makes upstream download unencrypted JSON instead.

Relevant source: [v8 BackupPage.vue lines 176-248](https://github.com/Authenticator-Extension/Authenticator/blob/6c30495bacc90ca27409f055342cb81db50c7608/src/components/Popup/BackupPage.vue#L176-L248) and [v8 import.ts lines 195-304](https://github.com/Authenticator-Extension/Authenticator/blob/6c30495bacc90ca27409f055342cb81db50c7608/src/import.ts#L195-L304).

## Unencrypted JSON (`OTPStorage`)

The document is an object keyed by an entry identifier, normally a UUID. Each value is a record with these fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `dataType` | v8 emits it | `"OTPStorage"`; absent in older backups |
| `encrypted` | yes | `false` for an unencrypted record |
| `hash` | yes in exports | entry identifier; fall back to the containing object key on old data |
| `index` | yes | display order |
| `type` | yes | `totp`, `hotp`, `battle`, `steam`, `hex`, or `hhex` |
| `secret` | yes | Base32 for normal/Steam/Battle.net records or hexadecimal for `hex`/`hhex` |
| `issuer`, `account` | no | labels |
| `counter` | HOTP/HHEX | moving counter |
| `period` | no | omitted for the default 30 seconds |
| `digits` | no | omitted for the default 6 |
| `algorithm` | no | omitted for SHA-1; otherwise enum string such as `SHA256` or `SHA512` |
| `pinned` | storage only | upstream strips it from downloaded backups |
| `keyId` | encrypted storage | key UUID; it is not needed in an unencrypted record |

The v8 types and enum are authoritative at [otp.d.ts lines 36-75](https://github.com/Authenticator-Extension/Authenticator/blob/6c30495bacc90ca27409f055342cb81db50c7608/src/definitions/otp.d.ts#L36-L75) and [otp.ts lines 5-31](https://github.com/Authenticator-Extension/Authenticator/blob/6c30495bacc90ca27409f055342cb81db50c7608/src/models/otp.ts#L5-L31).

## v8+ password-protected JSON

Version 8 encrypts the complete account object, not only `secret`. The top-level object contains encrypted entry envelopes and one or more key records.

```json
{
  "entry-uuid": {
    "dataType": "EncOTPStorage",
    "data": "U2FsdGVkX1...",
    "keyId": "key-uuid",
    "index": 0
  },
  "key-uuid": {
    "dataType": "Key",
    "id": "key-uuid",
    "salt": "salt string",
    "hash": "$argon2id$v=19$...",
    "version": 3
  }
}
```

Unlock each distinct key as follows:

1. Find the `Key` object whose top-level key, `id`, and the envelope's `keyId` agree.
2. Derive Argon2id from the UTF-8 user password and the UTF-8 bytes of `Key.salt` with version 19, memory 19,456 KiB, time cost 2, parallelism 1, and output length 32 bytes.
3. Encode it as a PHC string and take the final `$` component exactly as text. It is unpadded Base64. Do **not** Base64-decode it; this literal string is the CryptoJS passphrase.
4. Verify that literal string as the password against the Argon2 PHC string in `Key.hash`. A mismatch is a wrong password for that key.
5. Decrypt envelope `data` with the CryptoJS-compatible passphrase cipher described below, decode UTF-8, and parse JSON.
6. The decrypted object is a `RawOTPStorage` record. Require its `hash` to agree with the top-level entry key and its `keyId` to agree with the envelope. Preserve all account fields, then mark the in-memory result unencrypted.

Multiple key records can appear after browser-sync conflicts, so cache derivations by `keyId` and report entries whose key is absent or cannot be unlocked. Upstream itself contains a TODO around reconciling multiple keys; the migration importer must not choose an arbitrary one.

Authoritative source: [v8 Argon2 parameters](https://github.com/Authenticator-Extension/Authenticator/blob/6c30495bacc90ca27409f055342cb81db50c7608/src/argon.ts#L31-L41), [key unlock and entry decryption](https://github.com/Authenticator-Extension/Authenticator/blob/6c30495bacc90ca27409f055342cb81db50c7608/src/import.ts#L57-L190), and [envelope creation](https://github.com/Authenticator-Extension/Authenticator/blob/6c30495bacc90ca27409f055342cb81db50c7608/src/models/storage.ts#L195-L281).

## v7 and older password-protected JSON

Legacy records leave metadata in plaintext and encrypt only each `secret`.

### Wrapped data key (v2 legacy shape)

The common legacy document has a root `key` object:

```json
{
  "entry-uuid": {
    "encrypted": true,
    "hash": "entry-uuid",
    "index": 0,
    "type": "totp",
    "secret": "U2FsdGVkX1..."
  },
  "key": {
    "enc": "U2FsdGVkX1...",
    "hash": "$argon2id$v=19$..."
  }
}
```

1. CryptoJS-decrypt `key.enc` with the UTF-8 user password.
2. Interpret the decrypted bytes as lowercase hexadecimal text, matching CryptoJS `WordArray.toString()`; this is the entry-data passphrase.
3. Verify this text against `key.hash` (Argon2id PHC). At v7 creation the Argon2 defaults resolve to time cost 1, memory 16,384 KiB, parallelism 1, and output length 24 bytes. Verification should use the parameters encoded in the PHC string rather than hard-code them.
4. CryptoJS-decrypt every record's `secret` with the entry-data passphrase.

Due to upstream bug #557, some uploaded backups flattened `key` into root `enc` and `hash` string properties. Treat `{ enc, hash }` exactly like `{ key: { enc, hash } }` and exclude both properties from entry enumeration.

Relevant source: [v7 key creation/unlock](https://github.com/Authenticator-Extension/Authenticator/blob/bf630cc239e021ad23af88df1e01c06d5ae899bc/src/store/Accounts.ts#L203-L321), [v7 file import compatibility](https://github.com/Authenticator-Extension/Authenticator/blob/bf630cc239e021ad23af88df1e01c06d5ae899bc/src/components/Import/FileImport.vue#L55-L119), and [v7 secret encryption](https://github.com/Authenticator-Extension/Authenticator/blob/bf630cc239e021ad23af88df1e01c06d5ae899bc/src/models/encryption.ts#L3-L44).

### Direct password (v1 legacy shape)

An older encrypted document has `encrypted: true` records but no `key`, and no root `enc`/`hash` pair. CryptoJS-decrypt each `secret` directly with the UTF-8 user password. There is no independent password verifier: wrong passwords normally produce empty or invalid UTF-8. Require the decrypted secret to match one of the accepted secret encodings before accepting it.

Legacy special-account secrets may carry prefixes `blz-`/`bliz-` (Battle.net) or `stm-` (Steam). Strip the prefix and set the corresponding account type. Newer JSON normally uses an explicit `type`.

The upstream security advisory [GHSA-gv8m-vgp8-q2xr / CVE-2024-45394](https://github.com/Authenticator-Extension/Authenticator/security/advisories/GHSA-gv8m-vgp8-q2xr) marks all versions through 7.0.0 affected because the wrapped key uses AES-256 plus EVP_BytesToKey and can be brute-forced offline. Migration support is necessary, but Minimal must never re-export or store data in this legacy construction.

## CryptoJS passphrase cipher compatibility

Every `U2FsdGVkX1...` value above comes from `CryptoJS.AES.encrypt(message, passphrase).toString()` using CryptoJS 4.1.x defaults:

- serialized OpenSSL salted format: Base64 of `"Salted__" || 8-byte salt || ciphertext`;
- EVP_BytesToKey-compatible derivation using MD5, one iteration, producing a 32-byte AES key and 16-byte IV;
- AES-256-CBC with PKCS#7 padding.

Do not substitute PBKDF2, decode the passphrase as Base64/hex, or treat the first 16 decoded bytes as ciphertext. Implement this only as a migration decoder. Immediately place successfully imported secrets into Minimal's OS-backed protected storage.

## Fixtures and acceptance checks

Fixtures live in `benchmarks/fixtures/authenticator/`. All values are synthetic and the common password is `fixture-password`.

An implementation is compatible when it can:

- import every valid record and preserve type, labels, counter, period, digits, and algorithm;
- unlock the v8 key using the exact Argon2id parameters and decrypt the whole object;
- unlock both v2 key layouts and the v1 direct-password layout;
- reject `wrong-password` without committing any record;
- return a per-record error for missing keys, invalid ciphertext, invalid UTF-8/JSON, duplicate/conflicting identifiers, and unsupported fields;
- preview all changes before one atomic commit;
- leave the source backup untouched and never log passwords, derived keys, ciphertext plaintext, or OTP secrets.

The fixture `README.md` lists the expected records and the origin of each test vector.
