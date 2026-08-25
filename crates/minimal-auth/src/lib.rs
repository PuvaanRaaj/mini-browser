//! Pure, transaction-safe Firefox Authenticator migration.

use aes::Aes256;
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use base64::{
    Engine,
    engine::general_purpose::{STANDARD, STANDARD_NO_PAD},
};
use cbc::cipher::{BlockDecryptMut, KeyIvInit, block_padding::Pkcs7};
use md5::{Digest, Md5};
use percent_encoding::percent_decode_str;
use serde::de::{Deserialize, Deserializer, IgnoredAny, MapAccess, Visitor};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::fmt::Write;
use thiserror::Error;
use url::Url;
use zeroize::{Zeroize, Zeroizing};

type AesDecoder = cbc::Decryptor<Aes256>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BackupFormat {
    OtpAuthLines,
    UnencryptedJson,
    V8Encrypted,
    LegacyWrappedKey,
    LegacyDirectPassword,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OtpKind {
    Totp,
    Hotp,
    Steam,
    Battle,
    Hex,
    Hhex,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Algorithm {
    Sha1,
    Sha256,
    Sha512,
}

/// Intentionally has no `Debug`: it contains an OTP secret.
#[derive(Clone, Eq, PartialEq)]
pub struct OtpRecord {
    pub id: String,
    pub index: u64,
    pub kind: OtpKind,
    pub secret: String,
    pub issuer: Option<String>,
    pub account: Option<String>,
    pub counter: u64,
    pub period: u64,
    pub digits: u32,
    pub algorithm: Algorithm,
}

/// Generates the current code for a successfully imported record.
///
/// # Errors
///
/// Returns the OTP engine's validation or decoding error. The record secret
/// is never included in the error value.
pub fn generate_code(
    record: &OtpRecord,
    unix_seconds: u64,
) -> Result<String, minimal_otp::OtpError> {
    minimal_otp::generate(
        match record.kind {
            OtpKind::Totp => minimal_otp::OtpKind::Totp,
            OtpKind::Hotp => minimal_otp::OtpKind::Hotp,
            OtpKind::Steam => minimal_otp::OtpKind::Steam,
            OtpKind::Battle => minimal_otp::OtpKind::Battle,
            OtpKind::Hex => minimal_otp::OtpKind::Hex,
            OtpKind::Hhex => minimal_otp::OtpKind::Hhex,
        },
        &record.secret,
        record.counter,
        record.period,
        record.digits,
        match record.algorithm {
            Algorithm::Sha1 => minimal_otp::Algorithm::Sha1,
            Algorithm::Sha256 => minimal_otp::Algorithm::Sha256,
            Algorithm::Sha512 => minimal_otp::Algorithm::Sha512,
        },
        unix_seconds,
    )
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum IssueKind {
    Malformed,
    MissingKey,
    WrongPassword,
    InvalidCiphertext,
    DuplicateIdentifier,
    Conflict,
    UnsupportedField,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImportIssue {
    pub record_id: Option<String>,
    pub kind: IssueKind,
    pub message: &'static str,
}
pub struct ImportPreview {
    pub format: BackupFormat,
    pub records: Vec<OtpRecord>,
    pub issues: Vec<ImportIssue>,
    pub input_records: usize,
}
impl ImportPreview {
    #[must_use]
    pub fn can_commit(&self) -> bool {
        self.input_records > 0 && self.issues.is_empty() && self.records.len() == self.input_records
    }
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum ImportError {
    #[error("backup is not valid UTF-8")]
    InvalidUtf8,
    #[error("backup contains no account records")]
    Empty,
    #[error("encrypted backup requires a password")]
    PasswordRequired,
    #[error("preview contains rejected records")]
    UnsafePreview,
    #[error("protected storage transaction failed")]
    Storage,
}

/// Implementations must provide one all-or-nothing OS-protected transaction.
pub trait ImportTransaction {
    type Error;

    /// # Errors
    ///
    /// Returns the platform storage error after rolling back the transaction.
    fn commit_all(&mut self, records: &[OtpRecord]) -> Result<(), Self::Error>;
}
/// Commits a fully accepted preview in one storage transaction.
///
/// # Errors
///
/// Returns `UnsafePreview` when any input was rejected, or `Storage` when the
/// destination rolls back a failed transaction.
pub fn commit_preview<T: ImportTransaction>(
    preview: &ImportPreview,
    storage: &mut T,
) -> Result<(), ImportError> {
    if !preview.can_commit() {
        return Err(ImportError::UnsafePreview);
    }
    storage
        .commit_all(&preview.records)
        .map_err(|_| ImportError::Storage)
}

/// Detects and decodes a backup without performing any writes.
///
/// # Errors
///
/// Returns an error for non-UTF-8, empty, or password-less encrypted input.
pub fn preview_backup(
    bytes: &[u8],
    password: Option<&str>,
    existing: &[OtpRecord],
) -> Result<ImportPreview, ImportError> {
    let text = std::str::from_utf8(bytes).map_err(|_| ImportError::InvalidUtf8)?;
    match serde_json::from_str(text) {
        Ok(Value::Object(root)) => {
            let duplicates = duplicate_top_level_keys(text);
            let mut preview = preview_json(&root, password, existing)?;
            preview.input_records += duplicates.len();
            for id in duplicates {
                reject(
                    &mut preview,
                    &id,
                    IssueKind::DuplicateIdentifier,
                    "duplicate identifier in backup",
                );
                preview.records.retain(|record| record.id != id);
            }
            Ok(preview)
        }
        Ok(_) => Err(ImportError::Empty),
        Err(_) => preview_lines(text, existing),
    }
}

fn preview_lines(text: &str, existing: &[OtpRecord]) -> Result<ImportPreview, ImportError> {
    let mut out = new_preview(BackupFormat::OtpAuthLines);
    for (n, line) in text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .enumerate()
    {
        out.input_records += 1;
        let id = format!("line-{}", n + 1);
        match parse_uri(line, id.clone(), n as u64) {
            Ok(record) => out.records.push(record),
            Err(message) => reject(&mut out, &id, IssueKind::Malformed, message),
        }
    }
    if out.input_records == 0 {
        return Err(ImportError::Empty);
    }
    deduplicate(&mut out, existing);
    Ok(out)
}

fn preview_json(
    root: &Map<String, Value>,
    password: Option<&str>,
    existing: &[OtpRecord],
) -> Result<ImportPreview, ImportError> {
    let v8 = root
        .values()
        .any(|v| v.get("dataType").and_then(Value::as_str) == Some("EncOTPStorage"));
    let legacy = root
        .values()
        .any(|v| v.get("encrypted").and_then(Value::as_bool) == Some(true));
    let wrapped = root.contains_key("key")
        || (root.contains_key("enc") && root.get("hash").is_some_and(Value::is_string));
    let format = if v8 {
        BackupFormat::V8Encrypted
    } else if legacy && wrapped {
        BackupFormat::LegacyWrappedKey
    } else if legacy {
        BackupFormat::LegacyDirectPassword
    } else {
        BackupFormat::UnencryptedJson
    };
    if format != BackupFormat::UnencryptedJson && password.is_none() {
        return Err(ImportError::PasswordRequired);
    }
    let mut out = new_preview(format);
    match format {
        BackupFormat::V8Encrypted => parse_v8(root, password.unwrap_or_default(), &mut out),
        BackupFormat::LegacyWrappedKey => {
            parse_wrapped(root, password.unwrap_or_default(), &mut out);
        }
        BackupFormat::LegacyDirectPassword => {
            parse_direct(root, password.unwrap_or_default(), &mut out);
        }
        BackupFormat::UnencryptedJson => {
            for (id, value) in root {
                out.input_records += 1;
                push_record(id, value, &mut out);
            }
        }
        BackupFormat::OtpAuthLines => unreachable!(),
    }
    deduplicate(&mut out, existing);
    Ok(out)
}

fn new_preview(format: BackupFormat) -> ImportPreview {
    ImportPreview {
        format,
        records: Vec::new(),
        issues: Vec::new(),
        input_records: 0,
    }
}

fn duplicate_top_level_keys(text: &str) -> HashSet<String> {
    struct Keys;
    impl<'de> Visitor<'de> for Keys {
        type Value = HashSet<String>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("a JSON object")
        }

        fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
            let mut seen = HashSet::new();
            let mut duplicates = HashSet::new();
            while let Some((key, _)) = map.next_entry::<String, IgnoredAny>()? {
                if !seen.insert(key.clone()) {
                    duplicates.insert(key);
                }
            }
            Ok(duplicates)
        }
    }

    // The caller already parsed this object successfully. This second pass is
    // solely to retain duplicate-key evidence that `serde_json::Value` drops.
    struct DuplicateSet(HashSet<String>);
    impl<'de> Deserialize<'de> for DuplicateSet {
        fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
            deserializer.deserialize_map(Keys).map(Self)
        }
    }
    let mut deserializer = serde_json::Deserializer::from_str(text);
    DuplicateSet::deserialize(&mut deserializer).map_or_else(|_| HashSet::new(), |set| set.0)
}

fn parse_v8(root: &Map<String, Value>, password: &str, out: &mut ImportPreview) {
    let mut keys: HashMap<String, Zeroizing<String>> = HashMap::new();
    let mut wrong_password = false;
    for (id, value) in root
        .iter()
        .filter(|(_, v)| v.get("dataType").and_then(Value::as_str) == Some("Key"))
    {
        if value.get("id").and_then(Value::as_str) != Some(id) {
            continue;
        }
        let Some((salt, hash)) = value
            .get("salt")
            .and_then(Value::as_str)
            .zip(value.get("hash").and_then(Value::as_str))
        else {
            continue;
        };
        match v8_passphrase(password, salt, hash) {
            Ok(pass) => {
                keys.insert(id.clone(), pass);
            }
            Err(()) => wrong_password = true,
        }
    }
    for (id, value) in root
        .iter()
        .filter(|(_, v)| v.get("dataType").and_then(Value::as_str) == Some("EncOTPStorage"))
    {
        out.input_records += 1;
        let Some(key_id) = value.get("keyId").and_then(Value::as_str) else {
            reject(
                out,
                id,
                IssueKind::MissingKey,
                "encrypted record has no keyId",
            );
            continue;
        };
        let Some(pass) = keys.get(key_id) else {
            reject(
                out,
                id,
                if wrong_password {
                    IssueKind::WrongPassword
                } else {
                    IssueKind::MissingKey
                },
                "key could not be unlocked",
            );
            continue;
        };
        let Some(data) = value.get("data").and_then(Value::as_str) else {
            reject(
                out,
                id,
                IssueKind::InvalidCiphertext,
                "encrypted record has no data",
            );
            continue;
        };
        match decrypt_json(data, pass) {
            Ok(mut raw)
                if raw.get("hash").and_then(Value::as_str) == Some(id)
                    && raw.get("keyId").and_then(Value::as_str) == Some(key_id) =>
            {
                if let Some(record) = raw.as_object_mut() {
                    record.insert("encrypted".into(), Value::Bool(false));
                }
                push_record(id, &raw, out);
            }
            Ok(_) => reject(
                out,
                id,
                IssueKind::Conflict,
                "decrypted identifiers conflict with envelope",
            ),
            Err(()) => reject(
                out,
                id,
                IssueKind::InvalidCiphertext,
                "record decryption failed",
            ),
        }
    }
    if wrong_password {
        out.records.clear();
    }
}

fn v8_passphrase(password: &str, salt: &str, hash: &str) -> Result<Zeroizing<String>, ()> {
    let params = argon2::Params::new(19_456, 2, 1, Some(32)).map_err(|_| ())?;
    let argon = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let mut derived = Zeroizing::new([0_u8; 32]);
    argon
        .hash_password_into(password.as_bytes(), salt.as_bytes(), &mut *derived)
        .map_err(|_| ())?;
    let literal = Zeroizing::new(STANDARD_NO_PAD.encode(*derived));
    verify(literal.as_bytes(), hash)?;
    Ok(literal)
}

fn parse_wrapped(root: &Map<String, Value>, password: &str, out: &mut ImportPreview) {
    let key = root.get("key").and_then(Value::as_object);
    let enc = key
        .and_then(|v| v.get("enc"))
        .or_else(|| root.get("enc"))
        .and_then(Value::as_str);
    let hash = key
        .and_then(|v| v.get("hash"))
        .or_else(|| root.get("hash"))
        .and_then(Value::as_str);
    let pass = enc
        .and_then(|value| cryptojs_decrypt(value, password).ok())
        .map(|bytes| {
            let mut encoded = Zeroizing::new(String::with_capacity(bytes.len() * 2));
            for byte in bytes.iter() {
                // Writing into a String is infallible.
                let _ = write!(encoded, "{byte:02x}");
            }
            encoded
        });
    let unlocked = pass
        .as_ref()
        .zip(hash)
        .is_some_and(|(p, h)| verify(p.as_bytes(), h).is_ok());
    for (id, value) in root {
        if id == "key" || id == "enc" || (id == "hash" && value.is_string()) {
            continue;
        }
        out.input_records += 1;
        if unlocked {
            decrypt_legacy(
                id,
                value,
                pass.as_ref().map_or("", |value| value.as_str()),
                out,
            );
        } else {
            reject(
                out,
                id,
                IssueKind::WrongPassword,
                "wrapped key could not be unlocked",
            );
        }
    }
    if !unlocked {
        out.records.clear();
    }
}

fn parse_direct(root: &Map<String, Value>, password: &str, out: &mut ImportPreview) {
    for (id, value) in root {
        out.input_records += 1;
        decrypt_legacy(id, value, password, out);
    }
    if out.records.is_empty() {
        for issue in &mut out.issues {
            issue.kind = IssueKind::WrongPassword;
            issue.message = "password did not decrypt a valid secret";
        }
    }
}

fn decrypt_legacy(id: &str, value: &Value, passphrase: &str, out: &mut ImportPreview) {
    let Some(ciphertext) = value.get("secret").and_then(Value::as_str) else {
        reject(
            out,
            id,
            IssueKind::InvalidCiphertext,
            "record has no encrypted secret",
        );
        return;
    };
    let Ok(bytes) = cryptojs_decrypt(ciphertext, passphrase) else {
        reject(
            out,
            id,
            IssueKind::InvalidCiphertext,
            "secret decryption failed",
        );
        return;
    };
    let Ok(mut secret) = String::from_utf8(bytes.to_vec()) else {
        reject(
            out,
            id,
            IssueKind::InvalidCiphertext,
            "decrypted secret is not UTF-8",
        );
        return;
    };
    let mut raw = value.clone();
    let Some(map) = raw.as_object_mut() else {
        reject(out, id, IssueKind::Malformed, "record is not an object");
        return;
    };
    if let Some(value) = secret
        .strip_prefix("blz-")
        .or_else(|| secret.strip_prefix("bliz-"))
    {
        map.insert("type".into(), Value::String("battle".into()));
        secret = value.into();
    } else if let Some(value) = secret.strip_prefix("stm-") {
        map.insert("type".into(), Value::String("steam".into()));
        secret = value.into();
    }
    map.insert("secret".into(), Value::String(secret));
    map.insert("encrypted".into(), Value::Bool(false));
    push_record(id, &raw, out);
}

fn verify(password: &[u8], hash: &str) -> Result<(), ()> {
    let parsed = PasswordHash::new(hash).map_err(|_| ())?;
    Argon2::default()
        .verify_password(password, &parsed)
        .map_err(|_| ())
}

fn decrypt_json(ciphertext: &str, passphrase: &str) -> Result<Value, ()> {
    serde_json::from_slice(&cryptojs_decrypt(ciphertext, passphrase)?).map_err(|_| ())
}

fn cryptojs_decrypt(ciphertext: &str, passphrase: &str) -> Result<Zeroizing<Vec<u8>>, ()> {
    let decoded = Zeroizing::new(STANDARD.decode(ciphertext).map_err(|_| ())?);
    if decoded.len() < 32 || &decoded[..8] != b"Salted__" {
        return Err(());
    }
    let mut derived = Zeroizing::new(Vec::with_capacity(48));
    let mut previous = Vec::new();
    while derived.len() < 48 {
        let mut md5 = Md5::new();
        md5.update(&previous);
        md5.update(passphrase.as_bytes());
        md5.update(&decoded[8..16]);
        previous = md5.finalize().to_vec();
        derived.extend_from_slice(&previous);
    }
    previous.zeroize();
    AesDecoder::new_from_slices(&derived[..32], &derived[32..48])
        .map_err(|_| ())?
        .decrypt_padded_vec_mut::<Pkcs7>(&decoded[16..])
        .map(Zeroizing::new)
        .map_err(|_| ())
}

fn push_record(id: &str, value: &Value, out: &mut ImportPreview) {
    match parse_record(id, value) {
        Ok(record) => out.records.push(record),
        Err((kind, message)) => reject(out, id, kind, message),
    }
}

const RECORD_FIELDS: &[&str] = &[
    "dataType",
    "encrypted",
    "hash",
    "index",
    "type",
    "secret",
    "issuer",
    "account",
    "counter",
    "period",
    "digits",
    "algorithm",
    "pinned",
    "keyId",
];

fn parse_record(id: &str, value: &Value) -> Result<OtpRecord, (IssueKind, &'static str)> {
    let obj = value
        .as_object()
        .ok_or((IssueKind::Malformed, "record is not an object"))?;
    if obj.keys().any(|k| !RECORD_FIELDS.contains(&k.as_str())) {
        return Err((
            IssueKind::UnsupportedField,
            "record has an unsupported field",
        ));
    }
    if obj.get("encrypted").and_then(Value::as_bool) == Some(true) {
        return Err((IssueKind::Malformed, "encrypted record remains encrypted"));
    }
    if let Some(data_type) = obj.get("dataType").and_then(Value::as_str)
        && data_type != "OTPStorage"
    {
        return Err((IssueKind::UnsupportedField, "unsupported dataType"));
    }
    if obj.get("hash").and_then(Value::as_str).unwrap_or(id) != id {
        return Err((
            IssueKind::Conflict,
            "record identifier conflicts with object key",
        ));
    }
    let kind = parse_kind(
        obj.get("type")
            .and_then(Value::as_str)
            .ok_or((IssueKind::Malformed, "record has no type"))?,
    )?;
    let secret = obj
        .get("secret")
        .and_then(Value::as_str)
        .ok_or((IssueKind::Malformed, "record has no secret"))?;
    if !valid_secret(secret, kind) {
        return Err((IssueKind::Malformed, "secret encoding is invalid"));
    }
    let algorithm = parse_algorithm(
        obj.get("algorithm")
            .and_then(Value::as_str)
            .unwrap_or("SHA1"),
    )?;
    Ok(OtpRecord {
        id: id.into(),
        index: obj.get("index").and_then(Value::as_u64).unwrap_or(0),
        kind,
        secret: secret.into(),
        issuer: string(obj, "issuer")?,
        account: string(obj, "account")?,
        counter: number(obj, "counter", 0)?,
        period: number(obj, "period", 30)?,
        digits: number(obj, "digits", 6)?
            .try_into()
            .map_err(|_| (IssueKind::Malformed, "digits is out of range"))?,
        algorithm,
    })
}

fn string(
    obj: &Map<String, Value>,
    field: &str,
) -> Result<Option<String>, (IssueKind, &'static str)> {
    match obj.get(field) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(v)) => Ok(Some(v.clone())),
        _ => Err((IssueKind::Malformed, "label is not a string")),
    }
}
fn number(
    obj: &Map<String, Value>,
    field: &str,
    default: u64,
) -> Result<u64, (IssueKind, &'static str)> {
    obj.get(field).map_or(Ok(default), |v| {
        v.as_u64()
            .ok_or((IssueKind::Malformed, "numeric field is invalid"))
    })
}
fn parse_kind(value: &str) -> Result<OtpKind, (IssueKind, &'static str)> {
    match value.to_ascii_lowercase().as_str() {
        "totp" => Ok(OtpKind::Totp),
        "hotp" => Ok(OtpKind::Hotp),
        "steam" => Ok(OtpKind::Steam),
        "battle" => Ok(OtpKind::Battle),
        "hex" => Ok(OtpKind::Hex),
        "hhex" => Ok(OtpKind::Hhex),
        _ => Err((IssueKind::UnsupportedField, "unsupported OTP type")),
    }
}
fn parse_algorithm(value: &str) -> Result<Algorithm, (IssueKind, &'static str)> {
    match value.to_ascii_uppercase().as_str() {
        "SHA1" => Ok(Algorithm::Sha1),
        "SHA256" => Ok(Algorithm::Sha256),
        "SHA512" => Ok(Algorithm::Sha512),
        _ => Err((IssueKind::UnsupportedField, "unsupported OTP algorithm")),
    }
}

fn valid_secret(secret: &str, kind: OtpKind) -> bool {
    if secret.is_empty() {
        return false;
    }
    if matches!(kind, OtpKind::Hex | OtpKind::Hhex) {
        return secret.len() % 2 == 0 && secret.bytes().all(|b| b.is_ascii_hexdigit());
    }
    let body = secret.trim_end_matches('=');
    !body.is_empty()
        && body.bytes().all(|b| matches!(b, b'A'..=b'Z' | b'2'..=b'7'))
        && secret[body.len()..].bytes().all(|b| b == b'=')
}

fn parse_uri(text: &str, id: String, index: u64) -> Result<OtpRecord, &'static str> {
    let url = Url::parse(text).map_err(|_| "invalid otpauth URI")?;
    if url.scheme() != "otpauth" {
        return Err("URI is not otpauth");
    }
    let kind = parse_kind(url.host_str().ok_or("URI has no type")?).map_err(|(_, m)| m)?;
    if !matches!(kind, OtpKind::Totp | OtpKind::Hotp) {
        return Err("URI type must be TOTP or HOTP");
    }
    let mut query = HashMap::new();
    for (key, value) in url.query_pairs() {
        if query.insert(key.into_owned(), value.into_owned()).is_some() {
            return Err("duplicate query field");
        }
    }
    if query.keys().any(|k| {
        ![
            "secret",
            "issuer",
            "counter",
            "period",
            "digits",
            "algorithm",
        ]
        .contains(&k.as_str())
    }) {
        return Err("unsupported query field");
    }
    let secret = query.remove("secret").ok_or("URI has no secret")?;
    if !valid_secret(&secret, kind) {
        return Err("secret encoding is invalid");
    }
    let label = percent_decode_str(url.path().trim_start_matches('/'))
        .decode_utf8()
        .map_err(|_| "URI label is not UTF-8")?;
    let (label_issuer, account) = label
        .split_once(':')
        .map_or((None, Some(label.to_string())), |(a, b)| {
            (Some(a.to_string()), Some(b.to_string()))
        });
    let issuer = query.remove("issuer").or(label_issuer);
    let counter = query_number(&mut query, "counter", 0)?;
    let period = query_number(&mut query, "period", 30)?;
    let digits = query_number(&mut query, "digits", 6)?
        .try_into()
        .map_err(|_| "digits is out of range")?;
    let algorithm = parse_algorithm(&query.remove("algorithm").unwrap_or_else(|| "SHA1".into()))
        .map_err(|(_, m)| m)?;
    Ok(OtpRecord {
        id,
        index,
        kind,
        secret,
        issuer,
        account,
        counter,
        period,
        digits,
        algorithm,
    })
}
fn query_number(
    query: &mut HashMap<String, String>,
    field: &str,
    default: u64,
) -> Result<u64, &'static str> {
    query.remove(field).map_or(Ok(default), |v| {
        v.parse().map_err(|_| "numeric query field is invalid")
    })
}

fn deduplicate(out: &mut ImportPreview, existing: &[OtpRecord]) {
    let mut seen = HashSet::new();
    let mut rejected = HashSet::new();
    for record in &out.records {
        if !seen.insert(record.id.clone()) {
            rejected.insert(record.id.clone());
            out.issues.push(ImportIssue {
                record_id: Some(record.id.clone()),
                kind: IssueKind::DuplicateIdentifier,
                message: "duplicate identifier in backup",
            });
        }
        if let Some(old) = existing.iter().find(|old| old.id == record.id) {
            rejected.insert(record.id.clone());
            out.issues.push(ImportIssue {
                record_id: Some(record.id.clone()),
                kind: if old == record {
                    IssueKind::DuplicateIdentifier
                } else {
                    IssueKind::Conflict
                },
                message: "identifier already exists in destination",
            });
        }
    }
    out.records.retain(|r| !rejected.contains(&r.id));
}
fn reject(out: &mut ImportPreview, id: &str, kind: IssueKind, message: &'static str) {
    out.issues.push(ImportIssue {
        record_id: Some(id.into()),
        kind,
        message,
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    const PASSWORD: &str = "fixture-password";
    const STANDARD: &[u8] = include_bytes!(
        "../../../benchmarks/fixtures/authenticator/firefox-standard-unencrypted.txt"
    );
    const SPECIAL: &[u8] = include_bytes!(
        "../../../benchmarks/fixtures/authenticator/firefox-special-unencrypted.json"
    );
    const V8: &[u8] =
        include_bytes!("../../../benchmarks/fixtures/authenticator/firefox-v8-encrypted.json");
    const V7: &[u8] =
        include_bytes!("../../../benchmarks/fixtures/authenticator/firefox-v7-v2-encrypted.json");
    const V7_ROOT: &[u8] = include_bytes!(
        "../../../benchmarks/fixtures/authenticator/firefox-v7-v2-encrypted-root-key.json"
    );
    const V1: &[u8] = include_bytes!(
        "../../../benchmarks/fixtures/authenticator/firefox-legacy-v1-encrypted.json"
    );
    fn preview(data: &[u8], password: Option<&str>) -> ImportPreview {
        preview_backup(data, password, &[]).unwrap()
    }
    #[test]
    fn standard_fixture() {
        let p = preview(STANDARD, None);
        assert_eq!(p.records.len(), 3);
        assert_eq!(p.records[0].account.as_deref(), Some("alice@example.test"));
        assert_eq!(p.records[1].issuer.as_deref(), Some("Slow Example"));
        assert_eq!(p.records[1].period, 60);
        assert_eq!(p.records[1].digits, 8);
        assert_eq!(p.records[1].algorithm, Algorithm::Sha512);
        assert_eq!(p.records[2].counter, 7);
    }
    #[test]
    fn special_fixture() {
        let p = preview(SPECIAL, None);
        assert!(p.can_commit());
        assert_eq!(p.records[2].kind, OtpKind::Steam);
        assert_eq!(p.records[3].kind, OtpKind::Battle);
    }
    #[test]
    fn v8_fixture() {
        let p = preview(V8, Some(PASSWORD));
        assert!(p.can_commit(), "{:?}", p.issues);
        assert_eq!(p.records.len(), 2);
    }
    #[test]
    fn v7_fixture() {
        let p = preview(V7, Some(PASSWORD));
        assert!(p.can_commit(), "{:?}", p.issues);
        assert_eq!(p.records[1].digits, 8);
    }
    #[test]
    fn v7_flattened_fixture() {
        assert!(preview(V7_ROOT, Some(PASSWORD)).can_commit());
    }
    #[test]
    fn v1_fixture() {
        assert_eq!(
            preview(V1, Some(PASSWORD)).records[0].secret,
            "JBSWY3DPEHPK3PXP"
        );
    }
    #[test]
    fn wrong_password_accepts_nothing() {
        for fixture in [V8, V7, V7_ROOT, V1] {
            let p = preview(fixture, Some("wrong-password"));
            assert!(p.records.is_empty());
            assert!(!p.can_commit());
        }
    }
    #[test]
    fn preserves_hex_hhex_and_detects_destination_conflict() {
        let data = br#"{
          "hex-id":{"encrypted":false,"hash":"hex-id","index":2,"type":"hex","secret":"deadBEEF","period":45},
          "hhex-id":{"encrypted":false,"hash":"hhex-id","index":3,"type":"hhex","secret":"0123abcd","counter":42,"digits":8,"algorithm":"SHA512"}
        }"#;
        let clean = preview(data, None);
        assert!(clean.can_commit());
        assert_eq!(clean.records[0].kind, OtpKind::Hex);
        assert_eq!(clean.records[0].period, 45);
        assert_eq!(clean.records[1].kind, OtpKind::Hhex);
        assert_eq!(clean.records[1].counter, 42);
        assert_eq!(clean.records[1].algorithm, Algorithm::Sha512);

        let conflict = preview_backup(data, None, &clean.records[..1]).unwrap();
        assert!(!conflict.can_commit());
        assert!(
            conflict
                .issues
                .iter()
                .any(|issue| issue.kind == IssueKind::DuplicateIdentifier)
        );
    }
    #[test]
    fn duplicate_json_identifier_is_rejected() {
        let record = r#"{"encrypted":false,"hash":"same","index":0,"type":"totp","secret":"JBSWY3DPEHPK3PXP"}"#;
        let data = format!(r#"{{"same":{record},"same":{record}}}"#);
        let result = preview(data.as_bytes(), None);
        assert!(result.records.is_empty());
        assert!(
            result
                .issues
                .iter()
                .any(|issue| issue.kind == IssueKind::DuplicateIdentifier)
        );
        assert!(!result.can_commit());
    }
    struct Store(usize);
    impl ImportTransaction for Store {
        type Error = std::convert::Infallible;

        fn commit_all(&mut self, records: &[OtpRecord]) -> Result<(), Self::Error> {
            self.0 += records.len();
            Ok(())
        }
    }
    #[test]
    fn commit_boundary_is_atomic() {
        let bad = preview(V8, Some("wrong-password"));
        let mut store = Store(0);
        assert_eq!(
            commit_preview(&bad, &mut store),
            Err(ImportError::UnsafePreview)
        );
        assert_eq!(store.0, 0);
        let good = preview(SPECIAL, None);
        commit_preview(&good, &mut store).unwrap();
        assert_eq!(store.0, 4);
    }
}
