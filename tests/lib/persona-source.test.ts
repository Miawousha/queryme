import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readlinkSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseGitHubRepoUrl, validatePersonaTree, syncFromGitHub, getActivePersonaRoot, ensurePersonaCacheReady, resolveLatestSha } from "@/lib/persona-source";
import { getDb } from "@/lib/db/client";
import { personaSource } from "@/lib/db/schema";
import { http, HttpResponse } from "msw";
import { mswServer } from "../../vitest.setup";
import { FAKE_SHA, happyPathHandlers, makeTarball } from "./__mocks__/github-handlers";

describe("parseGitHubRepoUrl", () => {
  it("parses https://github.com/owner/repo", () => {
    expect(parseGitHubRepoUrl("https://github.com/alex/queryme-content")).toEqual({
      owner: "alex",
      repo: "queryme-content",
    });
  });

  it("strips a trailing slash", () => {
    expect(parseGitHubRepoUrl("https://github.com/alex/queryme-content/")).toEqual({
      owner: "alex",
      repo: "queryme-content",
    });
  });

  it("strips a trailing .git", () => {
    expect(parseGitHubRepoUrl("https://github.com/alex/queryme-content.git")).toEqual({
      owner: "alex",
      repo: "queryme-content",
    });
  });

  it("rejects an SSH URL", () => {
    expect(() => parseGitHubRepoUrl("git@github.com:alex/queryme-content.git")).toThrow(
      /must start with https:\/\/github.com\//,
    );
  });

  it("rejects a URL with extra path segments", () => {
    expect(() =>
      parseGitHubRepoUrl("https://github.com/alex/queryme-content/tree/main"),
    ).toThrow(/extra path segments/);
  });

  it("rejects a non-github host", () => {
    expect(() => parseGitHubRepoUrl("https://gitlab.com/alex/repo")).toThrow(
      /must start with https:\/\/github.com\//,
    );
  });
});

function makeTreeWith(filesPresent: string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), "queryme-persona-test-"));
  for (const rel of filesPresent) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, "ok");
  }
  return dir;
}

describe("validatePersonaTree", () => {
  const REQUIRED = [
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
  ];

  it("returns null when all required files exist", () => {
    const dir = makeTreeWith(REQUIRED);
    expect(validatePersonaTree(dir)).toBeNull();
  });

  it("returns an error listing the missing files", () => {
    const dir = makeTreeWith(REQUIRED.filter((f) => f !== "kb/skills.yaml"));
    const result = validatePersonaTree(dir);
    expect(result).toMatch(/missing required file/i);
    expect(result).toContain("kb/skills.yaml");
  });

  it("aggregates multiple missing files in one message", () => {
    const dir = makeTreeWith([]);
    const result = validatePersonaTree(dir);
    expect(result).toContain("persona.yaml");
    expect(result).toContain("prompts/system.md");
  });
});

const MIN_REQUIRED_FILES: Record<string, string> = {
  "persona.yaml":
    'id: test-persona\nfullName: Test\ngivenName: Test\ndefaultLocale: en\ni18n:\n  en:\n    possessive: their\n    objectPronoun: them\n    subjectPronoun: they\n  fr:\n    possessive: leur\n    objectPronoun: les\n    subjectPronoun: ils\n',
  "prompts/system.md": "system prompt body",
  "kb/profile.yaml":
    "name: Test Person\nheadline: Test\nlocation: Earth\nlanguages: [en]\n",
  "kb/profile.fr.yaml":
    "name: Personne Test\nheadline: Test\nlocation: Terre\nlanguages: [fr]\n",
  "kb/public-contact.yaml": "email: test@example.com\n",
  "kb/public-contact.fr.yaml": "email: test@example.com\n",
  "kb/skills.yaml": "skills: []\n",
  "kb/skills.fr.yaml": "skills: []\n",
  "kb/education.yaml": "education: []\n",
  "kb/education.fr.yaml": "education: []\n",
};

describe("syncFromGitHub — happy path", () => {
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
  });

  beforeEach(async () => {
    cacheRoot = mkdtempSync(path.join(tmpdir(), "queryme-persona-test-"));
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    // Clear PERSONA_LOCAL_OVERRIDE so getActivePersonaRoot() uses the symlink path.
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

  // The happy-path test inserts a real row; clean it up so re-running the
  // suite doesn't trip the production-data guard in beforeAll.
  afterAll(async () => {
    await getDb().delete(personaSource);
  });

  it("downloads, extracts, validates, flips the symlink, and writes a DB row", async () => {
    const tarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const result = await syncFromGitHub("https://github.com/alex/queryme-content");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.commitSha).toBe(FAKE_SHA);

    // Symlink points at the extracted SHA dir.
    const target = readlinkSync(`${cacheRoot}/current`);
    expect(target).toContain(FAKE_SHA);
    expect(getActivePersonaRoot()).toBe(target);

    // Required files reachable through the symlink.
    expect(readFileSync(`${cacheRoot}/current/persona.yaml`, "utf8")).toContain("test-persona");

    // DB row recorded.
    const rows = await getDb().select().from(personaSource);
    expect(rows).toHaveLength(1);
    expect(rows[0].commitSha).toBe(FAKE_SHA);
    expect(rows[0].status).toBe("ok");
  });
});

describe("syncFromGitHub — error paths", () => {
  let cacheRoot: string;

  beforeAll(async () => {
    const rows = await getDb().select().from(personaSource).limit(1);
    if (rows.length > 0) {
      throw new Error(
        "persona_source has existing rows. Integration tests refuse to run against a DB with live data. " +
        "Point POSTGRES_URL at a test branch or truncate the table first.",
      );
    }
  });

  beforeEach(async () => {
    cacheRoot = mkdtempSync(path.join(tmpdir(), "queryme-persona-err-"));
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    await getDb().delete(personaSource);
  });

  afterEach(() => {
    rmSync(cacheRoot, { recursive: true, force: true });
    delete process.env.PERSONA_CACHE_ROOT;
  });

  afterAll(async () => {
    await getDb().delete(personaSource);
  });

  it("returns an error and writes an error row when a required file is missing", async () => {
    const incomplete = { ...MIN_REQUIRED_FILES };
    delete incomplete["kb/skills.yaml"];
    const tarball = await makeTarball(incomplete);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const result = await syncFromGitHub("https://github.com/alex/queryme-content");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("kb/skills.yaml");
    }

    // No symlink because validation failed.
    expect(existsSync(`${cacheRoot}/current`)).toBe(false);

    // Error row recorded.
    const rows = await getDb().select().from(personaSource);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("error");
    expect(rows[0].error).toContain("kb/skills.yaml");
  });

  it("returns an error when the commits API returns 404", async () => {
    mswServer.use(
      http.get("https://api.github.com/repos/alex/queryme-content/commits/main", () =>
        HttpResponse.json({ message: "Not Found" }, { status: 404 }),
      ),
    );

    const result = await syncFromGitHub("https://github.com/alex/queryme-content");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/404/);
    }
  });

  it("preserves the previous active SHA when a subsequent sync fails", async () => {
    // First sync: success.
    const goodTarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball: goodTarball }));
    const first = await syncFromGitHub("https://github.com/alex/queryme-content");
    expect(first.kind).toBe("ok");
    const linkAfterFirst = readlinkSync(`${cacheRoot}/current`);
    expect(linkAfterFirst).toContain(FAKE_SHA);

    // Second sync: missing file. Reset handlers and use a different SHA to
    // make the assertion meaningful.
    const incomplete = { ...MIN_REQUIRED_FILES };
    delete incomplete["persona.yaml"];
    const altSha = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const badTarball = await makeTarball(incomplete, `queryme-content-${altSha}`);
    mswServer.resetHandlers();
    mswServer.use(
      ...happyPathHandlers({
        owner: "alex",
        repo: "queryme-content",
        sha: altSha,
        tarball: badTarball,
      }),
    );
    const second = await syncFromGitHub("https://github.com/alex/queryme-content");
    expect(second.kind).toBe("error");

    // Symlink still points at the first (good) SHA.
    expect(readlinkSync(`${cacheRoot}/current`)).toBe(linkAfterFirst);
  });

  it("serializes concurrent sync calls", async () => {
    const tarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const [a, b] = await Promise.all([
      syncFromGitHub("https://github.com/alex/queryme-content"),
      syncFromGitHub("https://github.com/alex/queryme-content"),
    ]);

    expect(a.kind).toBe("ok");
    expect(b.kind).toBe("ok");
    // The in-flight mutex returns the same promise — only one DB row written.
    const rows = await getDb().select().from(personaSource);
    expect(rows).toHaveLength(1);
  });
});

describe("ensurePersonaCacheReady — cold-start re-fetch", () => {
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
  });

  beforeEach(async () => {
    cacheRoot = mkdtempSync(path.join(tmpdir(), "queryme-persona-ensure-"));
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    // Clear PERSONA_LOCAL_OVERRIDE so getActivePersonaRoot() uses the symlink path.
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
  });

  it("is a no-op when no persona is configured", async () => {
    await ensurePersonaCacheReady();
    expect(getActivePersonaRoot()).toBeNull();
  });

  it("re-fetches the recorded SHA when the symlink is missing", async () => {
    // Simulate a successful prior sync, then wipe the cache (cold start).
    const tarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));
    await syncFromGitHub("https://github.com/alex/queryme-content");
    rmSync(cacheRoot, { recursive: true, force: true });
    // Re-create the cacheRoot so ensurePersonaCacheReady can put files back.
    mkdirSync(cacheRoot, { recursive: true });

    // Re-register handlers so the lazy refetch can hit the mocked tarball
    // endpoint again. (mswServer.resetHandlers fired in afterEach? No — it
    // fires AFTER each test, not within. But the previous handlers expire
    // when the test body returned in the prior sync. We need fresh handlers
    // for the re-fetch.)
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    await ensurePersonaCacheReady();
    expect(existsSync(`${cacheRoot}/current`)).toBe(true);
    expect(readFileSync(`${cacheRoot}/current/persona.yaml`, "utf8")).toContain("test-persona");
  });

  it("is a no-op when the symlink already points at the recorded SHA", async () => {
    const tarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));
    await syncFromGitHub("https://github.com/alex/queryme-content");

    // Reset handlers and install ones that throw if called — ensurePersonaCacheReady
    // must NOT re-fetch when the cache is already populated.
    mswServer.resetHandlers();
    mswServer.use(
      http.get(/api\.github\.com/, () => {
        throw new Error("api.github.com should not be called");
      }),
      http.get(/codeload\.github\.com/, () => {
        throw new Error("codeload.github.com should not be called");
      }),
    );

    await expect(ensurePersonaCacheReady()).resolves.toBeUndefined();
  });
});

describe("syncFromGitHub — cache cleanup", () => {
  let cacheRoot: string;

  beforeAll(async () => {
    const rows = await getDb().select().from(personaSource).limit(1);
    if (rows.length > 0) {
      throw new Error(
        "persona_source has existing rows. Integration tests refuse to run against a DB with live data. " +
        "Point POSTGRES_URL at a test branch or truncate the table first.",
      );
    }
  });

  beforeEach(async () => {
    cacheRoot = mkdtempSync(path.join(tmpdir(), "queryme-persona-cleanup-"));
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    await getDb().delete(personaSource);
  });

  afterEach(() => {
    rmSync(cacheRoot, { recursive: true, force: true });
    delete process.env.PERSONA_CACHE_ROOT;
  });

  afterAll(async () => {
    await getDb().delete(personaSource);
  });

  it("keeps the current + previous SHA dirs and deletes older ones", async () => {
    const shas = ["aaaa", "bbbb", "cccc", "dddd"];
    for (const sha of shas) {
      const fullSha = sha.padEnd(40, "0");
      const tarball = await makeTarball(MIN_REQUIRED_FILES, `queryme-content-${fullSha}`);
      mswServer.resetHandlers();
      mswServer.use(
        ...happyPathHandlers({
          owner: "alex",
          repo: "queryme-content",
          sha: fullSha,
          tarball,
        }),
      );
      const result = await syncFromGitHub("https://github.com/alex/queryme-content");
      expect(result.kind).toBe("ok");
    }

    const dirs = readdirSync(cacheRoot).filter((d) => d !== "current");
    expect(dirs.sort()).toEqual([
      "cccc".padEnd(40, "0"),
      "dddd".padEnd(40, "0"),
    ]);
  });
});

describe("resolveLatestSha", () => {
  it("returns the sha reported by the GitHub commits API", async () => {
    mswServer.use(
      http.get(
        "https://api.github.com/repos/acme/persona/commits/main",
        () => HttpResponse.json({ sha: "deadbeef" }),
      ),
    );
    const sha = await resolveLatestSha("https://github.com/acme/persona", "main");
    expect(sha).toBe("deadbeef");
  });

  it("throws when the commits API errors", async () => {
    mswServer.use(
      http.get(
        "https://api.github.com/repos/acme/persona/commits/main",
        () => new HttpResponse(null, { status: 404 }),
      ),
    );
    await expect(
      resolveLatestSha("https://github.com/acme/persona", "main"),
    ).rejects.toThrow(/404/);
  });
});
