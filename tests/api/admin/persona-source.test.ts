import { describe, it, expect, beforeEach, beforeAll, afterEach, afterAll, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { personaSource } from "@/lib/db/schema";

const MIN_REQUIRED_FILES_RAW: Record<string, string> = {
  "persona.yaml":
    'id: test-persona\nfullName: Test\ngivenName: Test\ndefaultLocale: en\ni18n:\n  en:\n    possessive: their\n    objectPronoun: them\n    subjectPronoun: they\n  fr:\n    possessive: leur\n    objectPronoun: les\n    subjectPronoun: ils\n',
  "prompts/system.md": "system prompt body",
  "kb/profile.yaml": "name: Test\nheadline: Test\nlocation: Earth\nlanguages: [en]\n",
  "kb/profile.fr.yaml": "name: Personne Test\nheadline: Test\nlocation: Terre\nlanguages: [fr]\n",
  "kb/public-contact.yaml": "email: test@example.com\n",
  "kb/public-contact.fr.yaml": "email: test@example.com\n",
  "kb/skills.yaml": "skills: []\n",
  "kb/skills.fr.yaml": "skills: []\n",
  "kb/education.yaml": "education: []\n",
  "kb/education.fr.yaml": "education: []\n",
};

describe("GET /api/admin/persona-source", () => {
  beforeAll(async () => {
    const rows = await getDb().select().from(personaSource).limit(1);
    if (rows.length > 0) {
      throw new Error(
        "persona_source has existing rows. Integration tests refuse to run against a DB with live data.",
      );
    }
  });

  beforeEach(async () => {
    await getDb().delete(personaSource);
    vi.resetModules();
  });

  afterAll(async () => {
    await getDb().delete(personaSource);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => false,
    }));
    const { GET } = await import("@/app/api/admin/persona-source/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns { active: null, history: [] } when no persona is configured", async () => {
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => true,
    }));
    const { GET } = await import("@/app/api/admin/persona-source/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ active: null, history: [] });
  });

  it("returns the active row and the history list", async () => {
    await getDb().insert(personaSource).values([
      {
        repoUrl: "https://github.com/alex/queryme-content",
        branch: "main",
        commitSha: "aaa1111111111111111111111111111111111111",
        status: "ok",
      },
      {
        repoUrl: "https://github.com/alex/queryme-content",
        branch: "main",
        commitSha: "bbb2222222222222222222222222222222222222",
        status: "error",
        error: "missing kb/profile.yaml",
      },
    ]);
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => true,
    }));
    const { GET } = await import("@/app/api/admin/persona-source/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.active.commitSha).toBe("aaa1111111111111111111111111111111111111");
    expect(body.history).toHaveLength(2);
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mswServer } from "../../../vitest.setup";
import {
  FAKE_SHA,
  happyPathHandlers,
  makeTarball,
} from "../../lib/__mocks__/github-handlers";

describe("POST /api/admin/persona-source", () => {
  let cacheRoot: string;

  beforeAll(async () => {
    const rows = await getDb().select().from(personaSource).limit(1);
    if (rows.length > 0) {
      throw new Error(
        "persona_source has existing rows. Integration tests refuse to run against a DB with live data.",
      );
    }
  });

  beforeEach(async () => {
    cacheRoot = mkdtempSync(path.join(tmpdir(), "queryme-route-cache-"));
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    await getDb().delete(personaSource);
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(cacheRoot, { recursive: true, force: true });
    delete process.env.PERSONA_CACHE_ROOT;
  });

  afterAll(async () => {
    await getDb().delete(personaSource);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => false,
    }));
    const { POST } = await import("@/app/api/admin/persona-source/route");
    const req = new Request("http://x/api/admin/persona-source", {
      method: "POST",
      body: JSON.stringify({ repoUrl: "https://github.com/alex/queryme-content" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when repoUrl is missing", async () => {
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => true,
    }));
    const { POST } = await import("@/app/api/admin/persona-source/route");
    const req = new Request("http://x/api/admin/persona-source", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("repoUrl");
  });

  it("triggers a sync and returns the new row info", async () => {
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => true,
    }));
    const tarball = await makeTarball(MIN_REQUIRED_FILES_RAW);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const { POST } = await import("@/app/api/admin/persona-source/route");
    const req = new Request("http://x/api/admin/persona-source", {
      method: "POST",
      body: JSON.stringify({ repoUrl: "https://github.com/alex/queryme-content" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.commitSha).toBe(FAKE_SHA);
  });

  it("returns 400 with the error message when sync fails", async () => {
    vi.doMock("@/lib/admin/auth", () => ({
      isAdminAuthenticated: async () => true,
    }));
    const incomplete = { ...MIN_REQUIRED_FILES_RAW };
    delete incomplete["kb/skills.yaml"];
    const tarball = await makeTarball(incomplete);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const { POST } = await import("@/app/api/admin/persona-source/route");
    const req = new Request("http://x/api/admin/persona-source", {
      method: "POST",
      body: JSON.stringify({ repoUrl: "https://github.com/alex/queryme-content" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("kb/skills.yaml");
  });
});
