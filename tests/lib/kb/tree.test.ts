import { describe, it, expect } from "vitest";
import {
  buildKbTree,
  ancestorIdsFor,
  breadcrumbFor,
  resolveGroups,
  type KbTreeNode,
} from "@/lib/kb/tree";
import type { KbFile } from "@/lib/kb/manifest";
import type { CitedRef } from "@/lib/kb/cited-paths";

const FILES: KbFile[] = [
  {
    path: "experience/2025-altergo.md",
    title: "2025 — Altergo",
    type: "md",
    meta: { role: "CTO", start: "2025-01-01", tags: ["battery"] },
    sections: [
      { slug: "overview", title: "Overview", level: 2 },
      { slug: "battery-telemetry", title: "Battery telemetry", level: 2 },
    ],
  },
  { path: "experience/2021-ion.md", title: "2021 — ION Energy", type: "md" },
  { path: "notes/research/idea.md", title: "Research idea", type: "md" },
  { path: "notes/research/quantum.md", title: "Quantum computing notes", type: "md" },
  { path: "profile.yaml", title: "Profile", type: "yaml" },
];

const GROUPS = [
  { name: "experience", label: "Experience" },
  { name: "notes", label: "Notes" },
  { name: "other", label: "Other" },
];

function ref(path: string, anchor: string | null, index: number): CitedRef {
  return { path, anchor, index, messageId: "m1" };
}

function find(nodes: KbTreeNode[], id: string): KbTreeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = find(n.children, id);
    if (hit) return hit;
  }
  return undefined;
}

const BASE = { files: FILES, groups: GROUPS, citedRefs: [] as CitedRef[], filter: "", lens: false };

describe("buildKbTree — structure", () => {
  it("orders collections per config, nests folders, attaches docs and sections", () => {
    const tree = buildKbTree(BASE);
    expect(tree.map((n) => n.id)).toEqual(["col:experience", "col:notes", "col:other"]);
    expect(find(tree, "dir:notes/research")?.children.map((c) => c.id)).toEqual([
      "doc:notes/research/idea.md",
      "doc:notes/research/quantum.md",
    ]);
    expect(find(tree, "doc:experience/2025-altergo.md")?.children.map((c) => c.id)).toEqual([
      "sec:experience/2025-altergo.md#overview",
      "sec:experience/2025-altergo.md#battery-telemetry",
    ]);
  });

  it("routes root-level and unknown-dir files to the catch-all", () => {
    const tree = buildKbTree(BASE);
    expect(find(tree, "col:other")?.children.map((c) => c.id)).toEqual(["doc:profile.yaml"]);
  });

  it("counts docs per container and drops empty collections", () => {
    const tree = buildKbTree(BASE);
    expect(find(tree, "col:experience")?.count).toBe(2);
    expect(find(tree, "dir:notes/research")?.count).toBe(2);
    const noOther = buildKbTree({ ...BASE, files: FILES.slice(0, 3) });
    expect(find(noOther, "col:other")).toBeUndefined();
  });
});

describe("buildKbTree — citations", () => {
  it("pins an anchored citation to the section (normalized match) and dots ancestors", () => {
    const refs = [ref("experience/2025-altergo.md", "Battery_Telemetry", 1)];
    const tree = buildKbTree({ ...BASE, citedRefs: refs });
    expect(find(tree, "sec:experience/2025-altergo.md#battery-telemetry")?.chips).toEqual([1]);
    expect(find(tree, "doc:experience/2025-altergo.md")?.dot).toBe(true);
    expect(find(tree, "col:experience")?.dot).toBe(true);
  });

  it("falls back to the doc node for unmatched or missing anchors", () => {
    const refs = [
      ref("experience/2025-altergo.md", "nope", 1),
      ref("experience/2021-ion.md", null, 2),
    ];
    const tree = buildKbTree({ ...BASE, citedRefs: refs });
    expect(find(tree, "doc:experience/2025-altergo.md")?.chips).toEqual([1]);
    expect(find(tree, "doc:experience/2021-ion.md")?.chips).toEqual([2]);
  });

  it("ignores citations to paths outside the manifest", () => {
    const tree = buildKbTree({ ...BASE, citedRefs: [ref("ghost.md", null, 1)] });
    expect(tree.every((n) => !n.dot)).toBe(true);
  });
});

describe("buildKbTree — filter and lens", () => {
  it("filter keeps matching docs (title, meta) plus ancestors, drops the rest", () => {
    const tree = buildKbTree({ ...BASE, filter: "battery" });
    expect(find(tree, "doc:experience/2025-altergo.md")).toBeDefined();
    expect(find(tree, "doc:experience/2021-ion.md")).toBeUndefined();
    expect(find(tree, "col:notes")).toBeUndefined();
  });

  it("filter matches section titles", () => {
    const tree = buildKbTree({ ...BASE, filter: "telemetry" });
    expect(find(tree, "sec:experience/2025-altergo.md#battery-telemetry")).toBeDefined();
  });

  it("a matching collection label keeps its whole subtree", () => {
    const tree = buildKbTree({ ...BASE, filter: "notes" });
    expect(find(tree, "doc:notes/research/idea.md")).toBeDefined();
  });

  it("lens prunes to cited branches only", () => {
    const refs = [ref("experience/2025-altergo.md", "battery-telemetry", 1)];
    const tree = buildKbTree({ ...BASE, citedRefs: refs, lens: true });
    expect(find(tree, "sec:experience/2025-altergo.md#battery-telemetry")).toBeDefined();
    expect(find(tree, "sec:experience/2025-altergo.md#overview")).toBeUndefined();
    expect(find(tree, "doc:experience/2021-ion.md")).toBeUndefined();
    expect(find(tree, "col:notes")).toBeUndefined();
  });

  it("recounts container counts to reflect surviving docs after pruning", () => {
    // filter: only experience/2025-altergo.md survives (has "battery" in meta.tags)
    const filtered = buildKbTree({ ...BASE, filter: "battery" });
    expect(find(filtered, "col:experience")?.count).toBe(1);

    // lens: only the cited doc survives in experience
    const refs = [ref("experience/2025-altergo.md", null, 1)];
    const lensed = buildKbTree({ ...BASE, citedRefs: refs, lens: true });
    expect(find(lensed, "col:experience")?.count).toBe(1);

    // folder-level recount: filter "idea" matches idea.md only, so notes/research drops to 1
    const folderFiltered = buildKbTree({ ...BASE, filter: "idea" });
    expect(find(folderFiltered, "dir:notes/research")?.count).toBe(1);
  });

  it("lens and filter compose with AND", () => {
    const refs = [
      ref("experience/2025-altergo.md", null, 1),
      ref("notes/research/idea.md", null, 2),
    ];
    const tree = buildKbTree({ ...BASE, citedRefs: refs, lens: true, filter: "idea" });
    expect(find(tree, "doc:notes/research/idea.md")).toBeDefined();
    expect(find(tree, "doc:experience/2025-altergo.md")).toBeUndefined();
  });
});

describe("ancestorIdsFor", () => {
  it("walks collection → folders → doc for known groups", () => {
    expect(ancestorIdsFor("notes/research/idea.md", new Set(["notes"]))).toEqual([
      "col:notes",
      "dir:notes/research",
      "doc:notes/research/idea.md",
    ]);
  });

  it("routes unknown top dirs and root files through the catch-all", () => {
    expect(ancestorIdsFor("misc/x/y.md", new Set(["notes"]))).toEqual([
      "col:other",
      "dir:misc",
      "dir:misc/x",
      "doc:misc/x/y.md",
    ]);
    expect(ancestorIdsFor("profile.yaml", new Set(["notes"]))).toEqual([
      "col:other",
      "doc:profile.yaml",
    ]);
  });
});

describe("breadcrumbFor / resolveGroups", () => {
  it("builds collection label + intermediate dirs", () => {
    expect(breadcrumbFor("notes/research/idea.md", GROUPS, "Other")).toEqual([
      "Notes",
      "research",
    ]);
    expect(breadcrumbFor("profile.yaml", GROUPS, "Other")).toEqual(["Other"]);
  });

  it("resolveGroups falls back to defaults and always appends the catch-all", () => {
    const resolved = resolveGroups([], "en", { experience: "Experience" }, "Other");
    expect(resolved[0]).toEqual({ name: "experience", label: "Experience" });
    expect(resolved[resolved.length - 1]).toEqual({ name: "other", label: "Other" });
  });

  it("resolveGroups prefers fr labels when lang=fr", () => {
    const resolved = resolveGroups(
      [{ name: "notes", label: { en: "Notes", fr: "Carnets" } }],
      "fr",
      {},
      "Autre",
    );
    expect(resolved[0].label).toBe("Carnets");
  });
});
