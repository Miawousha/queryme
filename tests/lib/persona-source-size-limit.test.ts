import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  bufferTarballWithLimit,
  tarballMaxBytes,
  syncFromGitHubForAccount,
} from "@/lib/persona-source";
import { getDb } from "@/lib/db/client";
import { personaSource } from "@/lib/db/schema";
import { mswServer } from "../../vitest.setup";
import { happyPathHandlers, makeTarball } from "./__mocks__/github-handlers";
import { ensureTestAccount, deleteTestAccount } from "./__mocks__/test-account";

const MB = 1024 * 1024;

// DB-integration blocks opt in via RUN_DB_TESTS so the default `pnpm test` run
// (no test database, dev DB may lack the latest migration) stays green.
const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

describe("tarballMaxBytes", () => {
  afterEach(() => {
    delete process.env.PERSONA_TARBALL_MAX_BYTES;
  });

  it("defaults to 50 MB", () => {
    expect(tarballMaxBytes()).toBe(50 * MB);
  });

  it("honors PERSONA_TARBALL_MAX_BYTES", () => {
    process.env.PERSONA_TARBALL_MAX_BYTES = "1024";
    expect(tarballMaxBytes()).toBe(1024);
  });

  it("ignores a non-numeric or non-positive override", () => {
    process.env.PERSONA_TARBALL_MAX_BYTES = "lots";
    expect(tarballMaxBytes()).toBe(50 * MB);
    process.env.PERSONA_TARBALL_MAX_BYTES = "0";
    expect(tarballMaxBytes()).toBe(50 * MB);
  });
});

describe("bufferTarballWithLimit", () => {
  it("returns the full body when under the limit", async () => {
    const res = new Response(Buffer.from("hello tarball"));
    const buf = await bufferTarballWithLimit(res, 1024);
    expect(buf.toString("utf8")).toBe("hello tarball");
  });

  it("rejects from the Content-Length header without reading the body", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const res = new Response(body, {
      headers: { "content-length": String(60 * MB) },
    });
    await expect(bufferTarballWithLimit(res, 50 * MB)).rejects.toThrow(
      "tarball exceeds the 50 MB limit",
    );
    expect(pulls).toBe(0);
  });

  it("rejects while streaming once the body passes the limit when Content-Length is absent", async () => {
    // An endless stream of 1 KB chunks: if the implementation buffered the
    // whole body before checking, this test would hang until the timeout.
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const res = new Response(body);
    await expect(bufferTarballWithLimit(res, 10 * 1024)).rejects.toThrow(
      /tarball exceeds the .+ limit/,
    );
    // Aborted right after crossing 10 KB, not after some huge buffer.
    expect(pulls).toBeLessThan(20);
  });
});

describeDb("syncFromGitHub — tarball size cap", () => {
  let cacheRoot: string;
  let TEST_ACCOUNT_ID = "";

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
    cacheRoot = mkdtempSync(path.join(tmpdir(), "queryme-persona-size-"));
    process.env.PERSONA_CACHE_ROOT = cacheRoot;
    await getDb().delete(personaSource);
  });

  afterEach(() => {
    rmSync(cacheRoot, { recursive: true, force: true });
    delete process.env.PERSONA_CACHE_ROOT;
    delete process.env.PERSONA_TARBALL_MAX_BYTES;
  });

  afterAll(async () => {
    await getDb().delete(personaSource);
    await deleteTestAccount();
  });

  it("records an error row when the tarball exceeds the configured limit", async () => {
    process.env.PERSONA_TARBALL_MAX_BYTES = "1024";
    // Random bytes are incompressible, so the gzipped tarball stays oversized.
    const tarball = await makeTarball({
      "persona.yaml": randomBytes(8192).toString("base64"),
    });
    expect(tarball.byteLength).toBeGreaterThan(1024);
    mswServer.use(...happyPathHandlers({ owner: "alex", repo: "queryme-content", tarball }));

    const result = await syncFromGitHubForAccount(
      TEST_ACCOUNT_ID,
      "https://github.com/alex/queryme-content",
    );

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/tarball exceeds the .+ limit/);
    }

    // Nothing was extracted or promoted.
    expect(existsSync(`${cacheRoot}/${TEST_ACCOUNT_ID}/current`)).toBe(false);

    // The failure lands in the persona_source error column like other sync errors.
    const rows = await getDb().select().from(personaSource);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("error");
    expect(rows[0].error).toMatch(/tarball exceeds the .+ limit/);
  });
});
