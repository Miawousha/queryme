/**
 * Manage the encrypted sensitive KB files.
 *
 *   tsx scripts/kb-sensitive.ts gen-key   # print a fresh KB_SENSITIVE_KEY
 *   tsx scripts/kb-sensitive.ts encrypt   # plaintext *.yaml  -> committed *.yaml.enc
 *   tsx scripts/kb-sensitive.ts decrypt   # committed *.yaml.enc -> local plaintext *.yaml
 *
 * Plaintext files (kb/sensitive/*.yaml) are gitignored — edit them locally,
 * then run `encrypt` to regenerate the .enc files that get committed.
 *
 * The key is read from process.env.KB_SENSITIVE_KEY, or from .env.local.
 */
import fs from "node:fs";
import path from "node:path";
import { encryptSensitive, decryptSensitive, generateKey } from "../lib/kb/crypto";

const SENSITIVE_DIR = path.resolve(process.cwd(), "kb/sensitive");
const FILES = ["salary.yaml", "references.yaml", "private-contact.yaml"];

function loadKey(): string {
  if (process.env.KB_SENSITIVE_KEY) return process.env.KB_SENSITIVE_KEY.trim();
  const envLocal = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocal)) {
    for (const line of fs.readFileSync(envLocal, "utf8").split("\n")) {
      const m = line.match(/^\s*KB_SENSITIVE_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    }
  }
  console.error("KB_SENSITIVE_KEY not found in environment or .env.local.");
  console.error("Generate one with: tsx scripts/kb-sensitive.ts gen-key");
  process.exit(1);
}

function encrypt() {
  const key = loadKey();
  let count = 0;
  for (const name of FILES) {
    const plain = path.join(SENSITIVE_DIR, name);
    if (!fs.existsSync(plain)) {
      console.warn(`skip ${name} — no plaintext file`);
      continue;
    }
    fs.writeFileSync(`${plain}.enc`, encryptSensitive(fs.readFileSync(plain, "utf8"), key) + "\n");
    console.log(`encrypted ${name} -> ${name}.enc`);
    count++;
  }
  console.log(`Done — ${count} file(s). Commit the .enc files; never commit the plaintext.`);
}

function decrypt() {
  const key = loadKey();
  let count = 0;
  for (const name of FILES) {
    const enc = path.join(SENSITIVE_DIR, `${name}.enc`);
    if (!fs.existsSync(enc)) {
      console.warn(`skip ${name}.enc — not found`);
      continue;
    }
    fs.writeFileSync(path.join(SENSITIVE_DIR, name), decryptSensitive(fs.readFileSync(enc, "utf8"), key));
    console.log(`decrypted ${name}.enc -> ${name}`);
    count++;
  }
  console.log(`Done — ${count} file(s). Plaintext is gitignored; do not commit it.`);
}

const cmd = process.argv[2];
if (cmd === "gen-key") {
  console.log(generateKey());
} else if (cmd === "encrypt") {
  encrypt();
} else if (cmd === "decrypt") {
  decrypt();
} else {
  console.error("Usage: tsx scripts/kb-sensitive.ts <gen-key|encrypt|decrypt>");
  process.exit(1);
}
