import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// RFC 4648 base32 alphabet (RFC 6238 / RFC 4226 reference implementations).
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Encode raw bytes to RFC 4648 base32 (no padding — Google Authenticator tolerates both). */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

/** Decode RFC 4648 base32 (case-insensitive, ignores spaces and padding). */
export function base32Decode(input: string): Buffer {
  const cleaned = input
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]!);
    if (idx === -1) throw new Error(`Invalid base32 char at ${i}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a 20-byte random secret (RFC 4226 recommends 160 bits). */
export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** RFC 6238 step counter for `time` (ms-since-epoch) at `stepSeconds` per step. */
export function timeStep(time: number = Date.now(), stepSeconds = 30): number {
  return Math.floor(time / 1000 / stepSeconds);
}

/** RFC 4226 HOTP. Returns a zero-padded `digits`-wide decimal string. */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  // 8-byte big-endian counter — high 32 bits are 0 in practice.
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const truncated = code % Math.pow(10, digits);
  return truncated.toString().padStart(digits, "0");
}

/** RFC 6238 TOTP. */
export function totp(
  secretBase32: string,
  time: number = Date.now(),
  opts: { digits?: number; stepSeconds?: number } = {},
): string {
  const digits = opts.digits ?? 6;
  const stepSeconds = opts.stepSeconds ?? 30;
  const secret = base32Decode(secretBase32);
  return hotp(secret, timeStep(time, stepSeconds), digits);
}

/**
 * Verify a TOTP code allowing for clock skew within `windowSteps` 30-second
 * steps in either direction (default ±1, ie tolerates 30-90s of drift).
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { time?: number; digits?: number; stepSeconds?: number; windowSteps?: number } = {},
): boolean {
  const time = opts.time ?? Date.now();
  const digits = opts.digits ?? 6;
  const stepSeconds = opts.stepSeconds ?? 30;
  const window = opts.windowSteps ?? 1;
  const cleaned = code.replace(/\s/g, "");
  if (!/^\d+$/.test(cleaned) || cleaned.length !== digits) return false;
  const secret = base32Decode(secretBase32);
  const counter = timeStep(time, stepSeconds);
  for (let off = -window; off <= window; off++) {
    const expected = hotp(secret, counter + off, digits);
    if (constantTimeEqual(expected, cleaned)) return true;
  }
  return false;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Build the otpauth:// URI consumed by authenticator app QR codes. */
export function buildOtpauthUri(opts: {
  secretBase32: string;
  accountName: string;
  issuer: string;
  digits?: number;
  stepSeconds?: number;
}): string {
  const params = new URLSearchParams({
    secret: opts.secretBase32,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(opts.digits ?? 6),
    period: String(opts.stepSeconds ?? 30),
  });
  const label = `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(opts.accountName)}`;
  return `otpauth://totp/${label}?${params.toString()}`;
}
