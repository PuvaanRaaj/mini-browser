//! Pure Rust one-time-password generation for migrated Authenticator records.
//!
//! Secrets are accepted only for the duration of a call. Callers own the
//! resulting code and must avoid logging the input record or code.

use data_encoding::BASE32;
use hmac::{Hmac, Mac};
use sha1::Sha1;
use sha2::{Sha256, Sha512};
use thiserror::Error;

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

#[derive(Debug, Error, Eq, PartialEq)]
pub enum OtpError {
    #[error("OTP secret is not valid Base32")]
    InvalidBase32,
    #[error("OTP secret is not valid hexadecimal")]
    InvalidHex,
    #[error("OTP period must be greater than zero")]
    InvalidPeriod,
    #[error("OTP digits must be between 1 and 10")]
    InvalidDigits,
    #[error("OTP kind cannot use a custom algorithm")]
    InvalidAlgorithm,
}

/// Generates one code at the supplied Unix timestamp or HOTP counter.
///
/// `unix_seconds` is used for TOTP, Steam, and Battle.net records. `counter`
/// is used for HOTP/HHEX records. The function never performs I/O.
///
/// # Errors
///
/// Returns an error when the secret encoding, period, digit count, or special
/// account algorithm is invalid.
pub fn generate(
    kind: OtpKind,
    secret: &str,
    counter: u64,
    period: u64,
    digits: u32,
    algorithm: Algorithm,
    unix_seconds: u64,
) -> Result<String, OtpError> {
    if period == 0 {
        return Err(OtpError::InvalidPeriod);
    }
    let key = match kind {
        OtpKind::Hex | OtpKind::Hhex => decode_hex(secret)?,
        OtpKind::Totp | OtpKind::Hotp | OtpKind::Steam | OtpKind::Battle => BASE32
            .decode(secret.as_bytes())
            .map_err(|_| OtpError::InvalidBase32)?,
    };
    let moving_factor = match kind {
        OtpKind::Totp | OtpKind::Steam | OtpKind::Battle | OtpKind::Hex => unix_seconds / period,
        OtpKind::Hotp | OtpKind::Hhex => counter,
    };
    let digest = hmac_digest(&key, moving_factor, algorithm, kind)?;
    if kind == OtpKind::Steam {
        return Ok(steam_code(&digest));
    }
    let code_digits = if kind == OtpKind::Battle && digits == 6 {
        8
    } else {
        digits
    };
    numeric_code(&digest, code_digits)
}

fn hmac_digest(
    key: &[u8],
    counter: u64,
    algorithm: Algorithm,
    kind: OtpKind,
) -> Result<Vec<u8>, OtpError> {
    if matches!(kind, OtpKind::Steam | OtpKind::Battle) && algorithm != Algorithm::Sha1 {
        return Err(OtpError::InvalidAlgorithm);
    }
    let message = counter.to_be_bytes();
    Ok(match algorithm {
        Algorithm::Sha1 => {
            let mut mac = Hmac::<Sha1>::new_from_slice(key).expect("HMAC accepts every key size");
            mac.update(&message);
            mac.finalize().into_bytes().to_vec()
        }
        Algorithm::Sha256 => {
            let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC accepts every key size");
            mac.update(&message);
            mac.finalize().into_bytes().to_vec()
        }
        Algorithm::Sha512 => {
            let mut mac = Hmac::<Sha512>::new_from_slice(key).expect("HMAC accepts every key size");
            mac.update(&message);
            mac.finalize().into_bytes().to_vec()
        }
    })
}

fn numeric_code(digest: &[u8], digits: u32) -> Result<String, OtpError> {
    if !(1..=10).contains(&digits) {
        return Err(OtpError::InvalidDigits);
    }
    let offset = usize::from(digest[digest.len() - 1] & 0x0f);
    let value = u32::from_be_bytes([
        digest[offset],
        digest[offset + 1],
        digest[offset + 2],
        digest[offset + 3],
    ]) & 0x7fff_ffff;
    let modulus = 10_u64.pow(digits);
    Ok(format!(
        "{:0width$}",
        u64::from(value) % modulus,
        width = digits as usize
    ))
}

fn steam_code(digest: &[u8]) -> String {
    const ALPHABET: &[u8] = b"23456789BCDFGHJKMNPQRTVWXY";
    let offset = usize::from(digest[digest.len() - 1] & 0x0f);
    let value = u32::from_be_bytes([
        digest[offset],
        digest[offset + 1],
        digest[offset + 2],
        digest[offset + 3],
    ]) & 0x7fff_ffff;
    let mut value = u64::from(value);
    let mut output = String::with_capacity(5);
    for _ in 0..5 {
        let index = usize::try_from(value % ALPHABET.len() as u64).expect("alphabet index fits");
        output.push(char::from(ALPHABET[index]));
        value /= ALPHABET.len() as u64;
    }
    output
}

fn decode_hex(secret: &str) -> Result<Vec<u8>, OtpError> {
    let bytes = secret.as_bytes();
    if bytes.is_empty() || bytes.len() % 2 != 0 {
        return Err(OtpError::InvalidHex);
    }
    bytes
        .chunks_exact(2)
        .map(|pair| {
            let high = hex_nibble(pair[0]).ok_or(OtpError::InvalidHex)?;
            let low = hex_nibble(pair[1]).ok_or(OtpError::InvalidHex)?;
            Ok((high << 4) | low)
        })
        .collect()
}

fn hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_rfc4226_hotp() {
        let code = generate(
            OtpKind::Hotp,
            "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
            0,
            30,
            6,
            Algorithm::Sha1,
            0,
        )
        .expect("RFC secret");
        assert_eq!(code, "755224");
    }

    #[test]
    fn matches_rfc6238_totp() {
        let code = generate(
            OtpKind::Totp,
            "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
            0,
            30,
            8,
            Algorithm::Sha1,
            59,
        )
        .expect("RFC secret");
        assert_eq!(code, "94287082");
    }

    #[test]
    fn steam_and_battle_outputs_are_bounded() {
        let steam = generate(
            OtpKind::Steam,
            "MFRGGZDFMZTWQ2LK",
            0,
            30,
            5,
            Algorithm::Sha1,
            1_700_000_000,
        )
        .expect("Steam code");
        assert_eq!(steam.len(), 5);
        assert!(
            steam
                .bytes()
                .all(|byte| b"23456789BCDFGHJKMNPQRTVWXY".contains(&byte))
        );

        let battle = generate(
            OtpKind::Battle,
            "ONSWG4TFOQ======",
            0,
            30,
            6,
            Algorithm::Sha1,
            1_700_000_000,
        )
        .expect("Battle.net code");
        assert_eq!(battle.len(), 8);
        assert!(battle.bytes().all(|byte| byte.is_ascii_digit()));
    }

    #[test]
    fn rejects_invalid_parameters() {
        assert_eq!(
            generate(OtpKind::Totp, "bad", 0, 0, 6, Algorithm::Sha1, 0),
            Err(OtpError::InvalidPeriod)
        );
        assert_eq!(
            generate(OtpKind::Totp, "bad", 0, 30, 11, Algorithm::Sha1, 0),
            Err(OtpError::InvalidBase32)
        );
        assert_eq!(
            generate(
                OtpKind::Steam,
                "MFRGGZDFMZTWQ2LK",
                0,
                30,
                5,
                Algorithm::Sha256,
                0
            ),
            Err(OtpError::InvalidAlgorithm)
        );
    }
}
