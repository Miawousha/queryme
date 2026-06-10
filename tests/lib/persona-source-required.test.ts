import { describe, it, expect } from "vitest";
import path from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { requiredPersonaFiles, validatePersonaTree } from "@/lib/persona-source";
import { RESUME_PRESET, resolveContentConfig, loadContentConfig } from "@/lib/kb/content-config";

const CUSTOM_ROOT = path.join(__dirname, "../fixtures/content-custom");

describe("requiredPersonaFiles", () => {
  it("reproduces the legacy 10-file list for the resume preset", () => {
    expect(new Set(requiredPersonaFiles(RESUME_PRESET))).toEqual(
      new Set([
        "persona.yaml",
        "prompts/system.md",
        "kb/profile.yaml",
        "kb/profile.fr.yaml",
        "kb/public-contact.yaml",
        "kb/public-contact.fr.yaml",
        "kb/skills.yaml",
        "kb/skills.fr.yaml",
        "kb/education.yaml",
        "kb/education.fr.yaml",
      ]),
    );
  });

  it("derives required files from a custom config (en-only → no .fr siblings)", () => {
    const config = resolveContentConfig(loadContentConfig(CUSTOM_ROOT));
    expect(requiredPersonaFiles(config)).toEqual([
      "persona.yaml",
      "prompts/system.md",
      "kb/profile.yaml",
      "kb/public-contact.yaml",
    ]);
  });
});

describe("validatePersonaTree with content.config.yaml", () => {
  it("accepts the custom fixture", () => {
    expect(validatePersonaTree(CUSTOM_ROOT)).toBeNull();
  });

  it("rejects a malformed content.config.yaml", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "persona-tree-"));
    writeFileSync(path.join(dir, "content.config.yaml"), "collections: 12");
    mkdirSync(path.join(dir, "kb"), { recursive: true });
    const result = validatePersonaTree(dir);
    expect(result).toMatch(/content\.config\.yaml/);
  });
});
