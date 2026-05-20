import { describe, it, expect } from "vitest";
import { encryptSensitive, decryptSensitive, generateKey } from "@/lib/kb/crypto";

describe("sensitive KB crypto", () => {
  const key = generateKey();

  it("generates 64-char hex keys", () => {
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(generateKey()).not.toBe(key);
  });

  it("round-trips plaintext", () => {
    const plaintext = "expectations: \"€200k\"\nphone: \"+33 6 00 00 00 00\"\n";
    expect(decryptSensitive(encryptSensitive(plaintext, key), key)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSensitive("same", key);
    const b = encryptSensitive("same", key);
    expect(a).not.toBe(b);
    expect(decryptSensitive(a, key)).toBe("same");
    expect(decryptSensitive(b, key)).toBe("same");
  });

  it("fails to decrypt with the wrong key", () => {
    const payload = encryptSensitive("secret", key);
    expect(() => decryptSensitive(payload, generateKey())).toThrow();
  });

  it("fails to decrypt tampered ciphertext (auth tag)", () => {
    const payload = encryptSensitive("secret", key);
    const buf = Buffer.from(payload, "base64");
    buf[buf.length - 1] ^= 0xff;
    expect(() => decryptSensitive(buf.toString("base64"), key)).toThrow();
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => encryptSensitive("x", "abcd")).toThrow(/32 bytes/);
  });

  it("rejects payloads too short to be valid", () => {
    expect(() => decryptSensitive("AAAA", key)).toThrow(/too short/);
  });
});
