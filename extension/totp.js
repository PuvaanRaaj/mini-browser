function normalizeSecret(secret) {
  return String(secret).replace(/\s+/g, "").replace(/=+$/g, "").toUpperCase();
}

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = normalizeSecret(input);
  let bits = "";
  for (const char of cleaned) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error("Secret must be base32.");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

function parseOtpAuth(uri) {
  const url = new URL(uri);
  if (url.protocol !== "otpauth:" || url.host !== "totp") {
    throw new Error("Only otpauth://totp URIs are supported.");
  }
  const path = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const [issuerFromLabel, ...rest] = path.split(":");
  const label = rest.length ? rest.join(":") : issuerFromLabel;
  const issuer = url.searchParams.get("issuer") || (rest.length ? issuerFromLabel : "");
  const secret = url.searchParams.get("secret");
  if (!secret) throw new Error("URI is missing a secret.");
  return {
    issuer,
    label: label || "Account",
    secret: normalizeSecret(secret),
    algorithm: (url.searchParams.get("algorithm") || "SHA1").toUpperCase(),
    digits: Number(url.searchParams.get("digits") || 6) === 8 ? 8 : 6,
    period: Number(url.searchParams.get("period") || 30) || 30,
  };
}

async function generateCode(account, timestamp = Date.now()) {
  const period = account.period || 30;
  const digits = account.digits || 6;
  const counter = Math.floor(timestamp / 1000 / period);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(4, counter);
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(account.secret),
    { name: "HMAC", hash: account.algorithm === "SHA256" ? "SHA-256" : "SHA-1" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, buffer));
  const offset = signature[signature.length - 1] & 0xf;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    (signature[offset + 1] << 16) |
    (signature[offset + 2] << 8) |
    signature[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

function remainingSeconds(period, timestamp = Date.now()) {
  return period - (Math.floor(timestamp / 1000) % period);
}
