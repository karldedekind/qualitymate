import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const SALT = "qm-settings-salt-v1";

let cachedKey: Buffer | null = null;
let cachedKeyFor: string | null = null;

function passphrase(): string {
  const value = process.env.INSTALL_PASSPHRASE ?? process.env.BETTER_AUTH_SECRET;
  if (!value) {
    throw new Error("INSTALL_PASSPHRASE (or BETTER_AUTH_SECRET) is required for encryption-at-rest");
  }
  return value;
}

function key(): Buffer {
  const pass = passphrase();
  if (cachedKey && cachedKeyFor === pass) return cachedKey;
  cachedKey = scryptSync(pass, SALT, 32);
  cachedKeyFor = pass;
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [version, ivB64, tagB64, encB64] = payload.split(":");
  if (version !== "v1") throw new Error(`Unknown ciphertext version: ${version}`);
  const iv = Buffer.from(ivB64!, "base64");
  const tag = Buffer.from(tagB64!, "base64");
  const enc = Buffer.from(encB64!, "base64");
  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function isCiphertext(value: string): boolean {
  return value.startsWith("v1:") && value.split(":").length === 4;
}

export function _resetKeyCacheForTests(): void {
  cachedKey = null;
  cachedKeyFor = null;
}
