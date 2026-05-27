import { describe, it, expect, beforeAll } from "vitest";
import type { ZodType } from "zod";
import path from "node:path";
import { loadKb, type Kb } from "@/lib/kb/loader";
import { buildKbLookupTools } from "@/lib/kb/tools";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/kb");

type LookupResult = {
  entries: Array<{
    path: string;
    name: string;
    body: string;
    frontmatter: Record<string, unknown>;
  }>;
  notFound: string[];
};

async function callLookup(kb: Kb, paths: string[]): Promise<LookupResult> {
  const tools = buildKbLookupTools(kb);
  const tool = tools.lookup_code_entries;
  if (!tool || typeof tool.execute !== "function") throw new Error("tool missing");
  return tool.execute({ paths }, { toolCallId: "t1", messages: [] }) as Promise<LookupResult>;
}

describe("buildKbLookupTools — lookup_code_entries", () => {
  let kb: Kb;

  beforeAll(async () => {
    kb = await loadKb(FIXTURE_DIR);
  });

  it("returns the body and frontmatter for a known path", async () => {
    const res = await callLookup(kb, ["code/queryme.md"]);
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0].path).toBe("code/queryme.md");
    expect(res.entries[0].name).toBe("queryme");
    expect(res.entries[0].body).toContain("Project body — what it is and contributors.");
    expect(res.entries[0].frontmatter).toMatchObject({ name: "queryme", role: "author" });
    expect(res.notFound).toEqual([]);
  });

  it("returns multiple entries in input order", async () => {
    const res = await callLookup(kb, ["code/sample-indexed.md", "code/queryme.md"]);
    expect(res.entries.map((e) => e.path)).toEqual(["code/sample-indexed.md", "code/queryme.md"]);
  });

  it("reports unknown but well-formed paths in notFound", async () => {
    const res = await callLookup(kb, ["code/does-not-exist.md", "code/queryme.md"]);
    expect(res.entries.map((e) => e.path)).toEqual(["code/queryme.md"]);
    expect(res.notFound).toEqual(["code/does-not-exist.md"]);
  });

  it("rejects path traversal attempts in notFound", async () => {
    const res = await callLookup(kb, ["code/../sensitive/foo.md"]);
    expect(res.entries).toEqual([]);
    expect(res.notFound).toEqual(["code/../sensitive/foo.md"]);
  });

  it("rejects paths outside the code/ prefix in notFound", async () => {
    const res = await callLookup(kb, ["experience/foo.md", "anything.md"]);
    expect(res.entries).toEqual([]);
    expect(res.notFound).toEqual(["experience/foo.md", "anything.md"]);
  });

  it("rejects paths without the .md suffix in notFound", async () => {
    const res = await callLookup(kb, ["code/queryme"]);
    expect(res.entries).toEqual([]);
    expect(res.notFound).toEqual(["code/queryme"]);
  });

  it("Zod rejects more than 5 paths via inputSchema", async () => {
    const tools = buildKbLookupTools(kb);
    const tool = tools.lookup_code_entries!;
    const six = ["code/a.md","code/b.md","code/c.md","code/d.md","code/e.md","code/f.md"];
    const parsed = (tool.inputSchema as unknown as ZodType).safeParse({ paths: six });
    expect(parsed.success).toBe(false);
  });

  it("Zod rejects empty paths array via inputSchema", async () => {
    const tools = buildKbLookupTools(kb);
    const tool = tools.lookup_code_entries!;
    const parsed = (tool.inputSchema as unknown as ZodType).safeParse({ paths: [] });
    expect(parsed.success).toBe(false);
  });
});
