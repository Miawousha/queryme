import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Sensitive KB content is committed as ciphertext (`kb/sensitive/*.yaml.enc`).
// The plaintext never enters git. Only the runtime — holding KB_SENSITIVE_KEY
// in its environment — can decrypt it. Algorithm: AES-256-GCM (authenticated).

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // 96-bit nonce, the GCM standard
const TAG_LEN = 16; // 128-bit auth tag

function keyBuffer(keyHex: string): Buffer {
  const key = Buffer.from(keyHex.trim(), "hex");
  if (key.length !== 32) {
    throw new Error(
      `KB_SENSITIVE_KEY must be 32 bytes (64 hex chars); got ${key.length} bytes`,
    );
  }
  return key;
}

/** Encrypt UTF-8 plaintext. Returns base64 of `iv || authTag || ciphertext`. */
export function encryptSensitive(plaintext: string, keyHex: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, keyBuffer(keyHex), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypt a payload produced by {@link encryptSensitive}. Throws on tamper or wrong key. */
export function decryptSensitive(payloadB64: string, keyHex: string): string {
  const buf = Buffer.from(payloadB64.trim(), "base64");
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error("encrypted payload is too short to be valid");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, keyBuffer(keyHex), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Generate a fresh 32-byte key as a 64-char hex string. */
export function generateKey(): string {
  return randomBytes(32).toString("hex");
}
