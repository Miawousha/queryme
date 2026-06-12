import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readlinkSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseGitHubRepoUrl, validatePersonaTree, syncFromGitHubForAccount, getPersonaRootForAccount, ensurePersonaCacheReadyForAccount, resolveLatestSha, refreshPersonaIfStale } from "@/lib/persona-source";

import { getDb } from "@/lib/db/client";
import { personaSource } from "@/lib/db/schema";
import { http, HttpResponse } from "msw";
import { mswServer } from "../../vitest.setup";
import { FAKE_SHA, happyPathHandlers, makeTarball } from "./__mocks__/github-handlers";
import { ensureTestAccount, deleteTestAccount } from "./__mocks__/test-account";

// Set in each DB suite's beforeAll — persona_source.account_id is a uuid FK.
let TEST_ACCOUNT_ID = "";

// DB-integration blocks opt in via RUN_DB_TESTS so the default `pnpm test` run
// (no test database, dev DB may lack the latest migration) stays green.
const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

describe("refreshPersonaIfStale", () => {
  const active = { repoUrl: "https://github.com/o/r", branch: "main", commitSha: "sha-new" };

  it("does nothing when there is no active source", async () => {
    let refetched = false;
    let reset = false;
    const r = await refreshPersonaIfStale({
      readCurrentSha: () => "sha-old",
      getActive: async () => null,
      refetch: async () => { refetched = true; },
      resetCaches: () => { reset = true; },
    });
    expect(r).toBe("no-active");
    expect(refetched).toBe(false);
    expect(reset).toBe(false);
  });

  it("does nothing when the on-disk SHA already matches the active SHA", async () => {
    let refetched = false;
    let reset = false;
    const r = await refreshPersonaIfStale({
      readCurrentSha: () => "sha-new",
      getActive: async () => active,
      refetch: async () => { refetched = true; },
      resetCaches: () => { reset = true; },
    });
    expect(r).toBe("fresh");
    expect(refetched).toBe(false);
    expect(reset).toBe(false);
  });

  it("refetches the active SHA and resets caches when the on-disk SHA is stale", async () => {
    let refetchedWith: typeof active | null = null;
    let reset = false;
    const r = await refreshPersonaIfStale({
      readCurrentSha: () => "sha-old",
      getActive: async () => active,
      refetch: async (a) => { refetchedWith = a; },
      resetCaches: () => { reset = true; },
    });
    expect(r).toBe("refreshed");
    expect(refetchedWith).toEqual(active);
    expect(reset).toBe(true);
  });
});

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
  // NB: deep validation runs the real Zod schemas, so these must be
  // schema-valid (EducationSchema keys entries, not education).
  "kb/education.yaml": "entries: []\n",
  "kb/education.fr.yaml": "entries: []\n",
};

describeDb("syncFromGitHub — happy path", () => {
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
    cacheRoot = mkdtempSync(path.join(tmpdir(), "queryme-persona-test-"));
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    // Clear PERSONA_LOCAL_OVERRIDE so getPersonaRootForAccount(TEST_ACCOUNT_ID) uses the symlink path.
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
    await deleteTestAccount();
  });

  it("downloads, extracts, validates, flips the symlink, and writes a DB row", async () => {
    const tarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const result = await syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.commitSha).toBe(FAKE_SHA);

    // Symlink points at the extracted SHA dir.
    const target = readlinkSync(`${cacheRoot}/${TEST_ACCOUNT_ID}/current`);
    expect(target).toContain(FAKE_SHA);
    expect(getPersonaRootForAccount(TEST_ACCOUNT_ID)).toBe(target);

    // Required files reachable through the symlink.
    expect(readFileSync(`${cacheRoot}/${TEST_ACCOUNT_ID}/current/persona.yaml`, "utf8")).toContain("test-persona");

    // DB row recorded.
    const rows = await getDb().select().from(personaSource);
    expect(rows).toHaveLength(1);
    expect(rows[0].commitSha).toBe(FAKE_SHA);
    expect(rows[0].status).toBe("ok");
  });
});

describeDb("syncFromGitHub — error paths", () => {
  let cacheRoot: string;

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
    await deleteTestAccount();
  });

  it("returns an error and writes an error row when a required file is missing", async () => {
    const incomplete = { ...MIN_REQUIRED_FILES };
    delete incomplete["kb/skills.yaml"];
    const tarball = await makeTarball(incomplete);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const result = await syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("kb/skills.yaml");
    }

    // No symlink because validation failed.
    expect(existsSync(`${cacheRoot}/${TEST_ACCOUNT_ID}/current`)).toBe(false);

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

    const result = await syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content");

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/404/);
    }
  });

  it("preserves the previous active SHA when a subsequent sync fails", async () => {
    // First sync: success.
    const goodTarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball: goodTarball }));
    const first = await syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content");
    expect(first.kind).toBe("ok");
    const linkAfterFirst = readlinkSync(`${cacheRoot}/${TEST_ACCOUNT_ID}/current`);
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
    const second = await syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content");
    expect(second.kind).toBe("error");

    // Symlink still points at the first (good) SHA.
    expect(readlinkSync(`${cacheRoot}/${TEST_ACCOUNT_ID}/current`)).toBe(linkAfterFirst);
  });

  it("serializes concurrent sync calls", async () => {
    const tarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const [a, b] = await Promise.all([
      syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content"),
      syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content"),
    ]);

    expect(a.kind).toBe("ok");
    expect(b.kind).toBe("ok");
    // The in-flight mutex returns the same promise — only one DB row written.
    const rows = await getDb().select().from(personaSource);
    expect(rows).toHaveLength(1);
  });
});

describeDb("ensurePersonaCacheReady — cold-start re-fetch", () => {
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
    cacheRoot = mkdtempSync(path.join(tmpdir(), "queryme-persona-ensure-"));
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    // Clear PERSONA_LOCAL_OVERRIDE so getPersonaRootForAccount(TEST_ACCOUNT_ID) uses the symlink path.
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

  it("is a no-op when no persona is configured", async () => {
    await ensurePersonaCacheReadyForAccount(TEST_ACCOUNT_ID);
    expect(getPersonaRootForAccount(TEST_ACCOUNT_ID)).toBeNull();
  });

  it("re-fetches the recorded SHA when the symlink is missing", async () => {
    // Simulate a successful prior sync, then wipe the cache (cold start).
    const tarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));
    await syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content");
    rmSync(cacheRoot, { recursive: true, force: true });
    // Re-create the cacheRoot so ensurePersonaCacheReady can put files back.
    mkdirSync(cacheRoot, { recursive: true });

    // Re-register handlers so the lazy refetch can hit the mocked tarball
    // endpoint again. (mswServer.resetHandlers fired in afterEach? No — it
    // fires AFTER each test, not within. But the previous handlers expire
    // when the test body returned in the prior sync. We need fresh handlers
    // for the re-fetch.)
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    await ensurePersonaCacheReadyForAccount(TEST_ACCOUNT_ID);
    expect(existsSync(`${cacheRoot}/${TEST_ACCOUNT_ID}/current`)).toBe(true);
    expect(readFileSync(`${cacheRoot}/${TEST_ACCOUNT_ID}/current/persona.yaml`, "utf8")).toContain("test-persona");
  });

  it("is a no-op when the symlink already points at the recorded SHA", async () => {
    const tarball = await makeTarball(MIN_REQUIRED_FILES);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));
    await syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content");

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

    await expect(ensurePersonaCacheReadyForAccount(TEST_ACCOUNT_ID)).resolves.toBeUndefined();
  });
});

describeDb("syncFromGitHub — cache cleanup", () => {
  let cacheRoot: string;

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
    await deleteTestAccount();
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
      const result = await syncFromGitHubForAccount(TEST_ACCOUNT_ID, "https://github.com/alex/queryme-content");
      expect(result.kind).toBe("ok");
    }

    const accountCacheDir = path.join(cacheRoot, TEST_ACCOUNT_ID);
    const dirs = readdirSync(accountCacheDir).filter((d) => d !== "current" && d !== "current.new");
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
