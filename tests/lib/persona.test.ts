import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadPersona, _resetPersonaCache } from "@/lib/persona";

const ALEX_YAML = `id: alex-collet
fullName: "Alexandre Collet"
givenName: "Alexandre"
defaultLocale: en
i18n:
  en:
    possessive: "his"
    objectPronoun: "him"
    subjectPronoun: "he"
  fr:
    possessive: "son"
    objectPronoun: "le"
    subjectPronoun: "il"
    givenWithApostrophe: "d'Alexandre"
`;

function withYaml(yaml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "persona-test-"));
  writeFileSync(path.join(dir, "persona.yaml"), yaml, "utf8");
  return dir;
}

describe("loadPersona", () => {
  beforeEach(() => _resetPersonaCache());
  afterEach(() => _resetPersonaCache());

  it("parses a valid persona.yaml", () => {
    const root = withYaml(ALEX_YAML);
    const persona = loadPersona(root);
    expect(persona.id).toBe("alex-collet");
    expect(persona.fullName).toBe("Alexandre Collet");
    expect(persona.givenName).toBe("Alexandre");
    expect(persona.i18n.fr.givenWithApostrophe).toBe("d'Alexandre");
  });

  it("rejects when givenName is missing", () => {
    const bad = ALEX_YAML.replace(/givenName: "Alexandre"\n/, "");
    const root = withYaml(bad);
    expect(() => loadPersona(root)).toThrow();
  });

  it("rejects when an unknown locale is present", () => {
    const bad = ALEX_YAML.replace(
      "i18n:",
      "i18n:\n  de:\n    possessive: sein\n    objectPronoun: ihn\n    subjectPronoun: er",
    );
    const root = withYaml(bad);
    expect(() => loadPersona(root)).toThrow();
  });

  it("caches and reloads correctly when the cache is reset", () => {
    const root = withYaml(ALEX_YAML);
    const p1 = loadPersona(root);
    const p2 = loadPersona(root);
    expect(p1).toBe(p2);                 // same instance — cached.

    _resetPersonaCache();
    const p3 = loadPersona(root);
    expect(p3).toEqual(p1);
    expect(p3).not.toBe(p1);              // new instance after reset.
  });
});
