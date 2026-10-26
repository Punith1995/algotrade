/**
 * TOTP (RFC 6238) — the 6-digit code from an authenticator app.
 * Angel One login needs this code; the secret is the base32 key shown when TOTP is enabled.
 */
const crypto = require("crypto");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input) {
  const clean = String(input || "").toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("ANGEL_TOTP_SECRET is not a valid base32 key");
    value = ((value << 5) | idx) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totp(secret, { step = 30, digits = 6, at = Date.now() } = {}) {
  const counter = Math.floor(at / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

module.exports = { totp, base32Decode };
