import { describe, it, expect } from "vitest";
import {
  isNeonHttpUrl,
  readJournal,
  pendingFromJournal,
} from "@/lib/db/migrate";

describe("isNeonHttpUrl", () => {
  it("matches neon and vercel-storage hosts", () => {
    expect(isNeonHttpUrl("postgres://x@ep-foo.neon.tech/db")).toBe(true);
    expect(isNeonHttpUrl("postgres://x@y.neon.dev/db")).toBe(true);
    expect(isNeonHttpUrl("postgres://x@z.vercel-storage.com/db")).toBe(true);
  });
  it("returns false for a vanilla postgres host", () => {
    expect(isNeonHttpUrl("postgres://x@localhost:5432/db")).toBe(false);
  });
  it("returns false for an unparseable url", () => {
    expect(isNeonHttpUrl("not a url")).toBe(false);
  });
});

describe("readJournal", () => {
  it("reads the real drizzle journal entries", () => {
    const entries = readJournal();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toHaveProperty("tag");
    expect(entries[0]).toHaveProperty("when");
  });
});

describe("pendingFromJournal", () => {
  const entries = [
    { idx: 0, when: 100, tag: "0000_a" },
    { idx: 1, when: 200, tag: "0001_b" },
    { idx: 2, when: 300, tag: "0002_c" },
  ];
  it("returns tags whose `when` is after the last applied millis", () => {
    expect(pendingFromJournal(entries, 200)).toEqual(["0002_c"]);
  });
  it("returns all when nothing has been applied (0)", () => {
    expect(pendingFromJournal(entries, 0)).toEqual(["0000_a", "0001_b", "0002_c"]);
  });
  it("returns none when everything is applied", () => {
    expect(pendingFromJournal(entries, 300)).toEqual([]);
  });
});
