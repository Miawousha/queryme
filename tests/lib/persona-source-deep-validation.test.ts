import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readlinkSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  validatePersonaTreeDeep,
  syncFromGitHubForAccount,
  getActivePersonaSourceRowForAccount,
} from "@/lib/persona-source";
import { getDb } from "@/lib/db/client";
import { personaSource } from "@/lib/db/schema";
import { mswServer } from "../../vitest.setup";
import { FAKE_SHA, happyPathHandlers, makeTarball } from "./__mocks__/github-handlers";
import { ensureTestAccount, deleteTestAccount } from "./__mocks__/test-account";

// Set in the DB suite's beforeAll — persona_source.account_id is a uuid FK.
let TEST_ACCOUNT_ID = "";

// DB-integration blocks opt in via RUN_DB_TESTS so the default `pnpm test` run
// (no test database, dev DB may lack the latest migration) stays green.
const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

/**
 * A minimal tree that passes the FULL load + assembly (every Zod schema), not
 * just the file-presence gate. Mutating one file per test below produces the
 * schema-invalid variants.
 */
const VALID_FILES: Record<string, string> = {
  "persona.yaml":
    'id: test-persona\nfullName: Test\ngivenName: Test\ndefaultLocale: en\ni18n:\n  en:\n    possessive: their\n    objectPronoun: them\n    subjectPronoun: they\n  fr:\n    possessive: leur\n    objectPronoun: les\n    subjectPronoun: ils\n',
  "prompts/system.md": "system prompt body",
  "kb/profile.yaml":
    "name: Test Person\nheadline: Test\nlocation: Earth\nlanguages: [en]\n",
  "kb/profile.fr.yaml":
    "name: Personne Test\nheadline: Test\nlocation: Terre\nlanguages: [fr]\n",
  "kb/public-contact.yaml": "email: test@example.com\n",
  "kb/public-contact.fr.yaml": "email: test@example.com\n",
  "kb/skills.yaml": "skills:\n  - name: TypeScript\n    level: 4\n    years: 6\n",
  "kb/skills.fr.yaml": "skills:\n  - name: TypeScript\n    level: 4\n    years: 6\n",
  "kb/education.yaml": "entries: []\n",
  "kb/education.fr.yaml": "entries: []\n",
};

function writeTree(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "queryme-deep-validate-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body, "utf8");
  }
  return dir;
}

describe("validatePersonaTreeDeep", () => {
  it("returns null for a tree that loads and assembles cleanly", async () => {
    const dir = writeTree(VALID_FILES);
    expect(await validatePersonaTreeDeep(dir)).toBeNull();
  });

  it("reports the Zod schema error for an out-of-range skills level", async () => {
    const dir = writeTree({
      ...VALID_FILES,
      "kb/skills.yaml": "skills:\n  - name: TypeScript\n    level: expert\n    years: 6\n",
    });
    const result = await validatePersonaTreeDeep(dir);
    expect(result).toMatch(/skills\.yaml/);
    expect(result).toMatch(/level/);
  });

  it("reports a malformed education date", async () => {
    const dir = writeTree({
      ...VALID_FILES,
      "kb/education.yaml":
        "entries:\n  - institution: Test U\n    degree: BSc\n    start: September 2020\n    end: present\n",
    });
    const result = await validatePersonaTreeDeep(dir);
    expect(result).toMatch(/education\.yaml/);
    expect(result).toMatch(/start/);
  });

  it("reports persona.yaml errors such as a missing fr i18n block", async () => {
    const dir = writeTree({
      ...VALID_FILES,
      "persona.yaml":
        'id: test-persona\nfullName: Test\ngivenName: Test\ndefaultLocale: en\ni18n:\n  en:\n    possessive: their\n    objectPronoun: them\n    subjectPronoun: they\n',
    });
    const result = await validatePersonaTreeDeep(dir);
    expect(result).toMatch(/persona\.yaml/);
    expect(result).toMatch(/i18n/);
  });

  it("reports schema errors in localized sidecars, marked with the locale", async () => {
    const dir = writeTree({
      ...VALID_FILES,
      "kb/skills.fr.yaml": "skills:\n  - name: TypeScript\n    level: 9\n    years: 6\n",
    });
    const result = await validatePersonaTreeDeep(dir);
    expect(result).toMatch(/\[fr\]/);
    expect(result).toMatch(/skills/);
  });

  it("reports invalid markdown frontmatter", async () => {
    const dir = writeTree({
      ...VALID_FILES,
      "kb/experience/2024-test-co.md":
        "---\ncompany: Test Co\nstart: 2024-01\nend: present\n---\n\nBody.\n",
    });
    const result = await validatePersonaTreeDeep(dir);
    expect(result).toMatch(/experience/);
    expect(result).toMatch(/role/);
  });
});

describeDb("syncFromGitHub — deep validation", () => {
  let cacheRoot: string;
  let savedLocalOverride: string | undefined;

  beforeAll(async () => {
    const rows = await getDb().select().from(personaSource).limit(1);
    if (rows.length > 0) {
      throw new Error(
        "persona_source has existing rows. Integration tests refuse to run against a DB with live data. " +
        "Point POSTGRES_URL at a test branch or truncate the table first.",
      );
    }
    TEST_ACCOUNT_ID = await ensureTestAccount();
  });

  beforeEach(async () => {
    cacheRoot = mkdtempSync(path.join(tmpdir(), "queryme-persona-deep-"));
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    // Clear PERSONA_LOCAL_OVERRIDE so getPersonaRootForAccount uses the symlink path.
    savedLocalOverride = process.env.PERSONA_LOCAL_OVERRIDE;
    delete process.env.PERSONA_LOCAL_OVERRIDE;
    await getDb().delete(personaSource);
  });

  afterEach(() => {
    rmSync(cacheRoot, { recursive: true, force: true });
    delete process.env.PERSONA_CACHE_ROOT;
    // Restore PERSONA_LOCAL_OVERRIDE to the value set by vitest.setup.ts.
    if (savedLocalOverride !== undefined) {
      process.env.PERSONA_LOCAL_OVERRIDE = savedLocalOverride;
    } else {
      delete process.env.PERSONA_LOCAL_OVERRIDE;
    }
  });

  afterAll(async () => {
    await getDb().delete(personaSource);
    await deleteTestAccount();
  });

  it("fails the sync and records the schema error when the repo is schema-invalid", async () => {
    const tarball = await makeTarball({
      ...VALID_FILES,
      "kb/skills.yaml": "skills:\n  - name: TypeScript\n    level: expert\n    years: 6\n",
    });
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const result = await syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/skills\.yaml/);
      expect(result.message).toMatch(/level/);
    }

    // No symlink because validation failed.
    expect(existsSync(`${cacheRoot}/${TEST_ACCOUNT_ID}/current`)).toBe(false);

    // Error row recorded with the descriptive message (admin error column / sync history).
    const rows = await getDb().select().from(personaSource);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("error");
    expect(rows[0].error).toMatch(/skills\.yaml/);
    expect(rows[0].error).toMatch(/level/);
  });

  it("keeps the previously-active source when a re-sync fails deep validation", async () => {
    // First sync: schema-valid content.
    const goodTarball = await makeTarball(VALID_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball: goodTarball }));
    const first = await syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content");
    expect(first.kind).toBe("ok");
    const linkAfterFirst = readlinkSync(`${cacheRoot}/${TEST_ACCOUNT_ID}/current`);
    expect(linkAfterFirst).toContain(FAKE_SHA);

    // Second sync: a new commit whose content is schema-invalid.
    const altSha = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const badTarball = await makeTarball(
      {
        ...VALID_FILES,
        "kb/skills.yaml": "skills:\n  - name: TypeScript\n    level: expert\n    years: 6\n",
      },
      `queryme-content-${altSha}`,
    );
    mswServer.resetHandlers();
    mswServer.use(
      ...happyPathHandlers({ owner: "alex", repo: "queryme-content", sha: altSha, tarball: badTarball }),
    );
    const second = await syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content");
    expect(second.kind).toBe("error");

    // Symlink still points at the first (good) SHA and the good content is intact.
    expect(readlinkSync(`${cacheRoot}/${TEST_ACCOUNT_ID}/current`)).toBe(linkAfterFirst);
    expect(existsSync(path.join(linkAfterFirst, "persona.yaml"))).toBe(true);

    // The active source row is still the first sync.
    const active = await getActivePersonaSourceRowForAccount(TEST_ACCOUNT_ID);
    expect(active?.commitSha).toBe(FAKE_SHA);
  });

  it("keeps the active dir on disk when a same-SHA re-sync fails validation", async () => {
    // First sync: valid content at FAKE_SHA.
    const goodTarball = await makeTarball(VALID_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball: goodTarball }));
    const first = await syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content");
    expect(first.kind).toBe("ok");
    const link = readlinkSync(`${cacheRoot}/${TEST_ACCOUNT_ID}/current`);

    // Re-sync the SAME SHA but serve schema-invalid content (models validation
    // rules tightening after a sha was synced "ok"). The failed sync must not
    // tear down the directory the active symlink serves from.
    const badTarball = await makeTarball({
      ...VALID_FILES,
      "kb/skills.yaml": "skills:\n  - name: TypeScript\n    level: expert\n    years: 6\n",
    });
    mswServer.resetHandlers();
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball: badTarball }));
    const second = await syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content");
    expect(second.kind).toBe("error");

    // The active symlink still resolves to the GOOD content — the invalid
    // tarball must not have been extracted over the served directory.
    expect(readlinkSync(`${cacheRoot}/${TEST_ACCOUNT_ID}/current`)).toBe(link);
    expect(readFileSync(path.join(link, "kb/skills.yaml"), "utf8")).toContain("level: 4");
  });
});
