/**
 * End-to-end citation-contract test (ROADMAP Phase 2.3).
 *
 * `system-contract.test.ts` locks each stage of the citation pipeline in
 * isolation — the prompt advertises the token, the assembler emits `[ref:]`
 * markers, and a whole-file `[ref:foo.md]` round-trips through `parseCitations`.
 * What no test covers is that the five stages *compose*: that a path the
 * assembler shows the model, cited back with the kebab-case slug of a real
 * heading, survives parse → anchor-resolution → conversation dedup → UI rewrite
 * and lands as a numbered, clickable footnote pointing at a real section.
 *
 * This test locks that full chain. It does NOT call a real model — that's
 * non-deterministic and costly. The model stage is represented by the contract
 * itself: given the assembler emits `[ref:X]` and the shell injects the
 * citation instruction, a compliant model echoes `[^kb:X]`. We simulate that
 * echo using the exact paths the assembler produced and the exact section slugs
 * the manifest extracts, then assert everything *around* the model composes —
 * which is the fragile surface (format compatibility across five modules), not
 * the model's compliance.
 *
 *   assemble [ref:]  →  (model echoes [^kb:])  →  parseCitations
 *        →  anchor resolves to a real manifest section
 *        →  extractCitations / citationIndexMap (conversation-wide numbering)
 *        →  rewriteCitations (UI superscript)
 */

import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { loadKb, type Kb } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";
import { parseCitations } from "@/lib/kb/citations";
import {
  extractCitations,
  citationIndexMap,
  citedRefKey,
  rewriteCitations,
} from "@/lib/kb/cited-paths";
import { anchorMatches, slugify } from "@/lib/kb/slug";

const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/kb");

// A concrete target that exists at every stage: the assembler emits a
// `[ref:]` for this file, and the manifest extracts a `## Highlights` section
// from it — so the model can be shown the path and cite a real section of it.
const FILE = "experience/2024-fixture-co.md";
const SECTION_SLUG = "highlights"; // slug of the file's "## Highlights" heading
const WHOLE_FILE = "profile.yaml"; // a whole-file (anchorless) citation target

describe("citation pipeline — end-to-end contract", () => {
  let kbText: string;
  let manifest: KbFile[];

  beforeAll(async () => {
    const kb: Kb = await loadKb(FIXTURE_DIR);
    kbText = assemblePublicKbText(kb);
    manifest = await loadKbManifest(FIXTURE_DIR);
  });

  it("the assembler advertises both citation targets as [ref: <path>] markers", () => {
    // The model can only cite what the KB shows it. If these markers vanish,
    // the rest of the chain is citing a path the model never saw.
    expect(kbText).toContain(`[ref: ${FILE}]`);
    expect(kbText).toContain(`[ref: ${WHOLE_FILE}]`);
  });

  it("a cited section anchor resolves to a real manifest section", () => {
    // The gap no per-stage test covers: the model cites the *kebab-case slug*
    // of a heading, and the KB panel resolves it against the manifest's
    // `extractSections` output. slugify (heading → slug) and anchorMatches
    // (anchor ↔ slug) must agree, or the citation opens nothing.
    const file = manifest.find((f) => f.path === FILE);
    expect(file?.sections, `${FILE} should carry sections in the manifest`).toBeDefined();

    const section = file!.sections!.find((s) => s.slug === SECTION_SLUG);
    expect(section, `${FILE} should expose a "${SECTION_SLUG}" section`).toBeDefined();

    const token = `[^kb:${FILE}#${section!.slug}]`;
    const parsed = parseCitations(token);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].path).toBe(FILE);
    expect(parsed[0].anchor).toBe(SECTION_SLUG);

    // The cited anchor resolves back to exactly one real section of the file.
    const hits = file!.sections!.filter((s) => anchorMatches(parsed[0].anchor!, s.slug));
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("Highlights");
  });

  it("a two-message conversation numbers, dedups, and renders citations end-to-end", () => {
    // Simulate a compliant model echoing the [ref:] paths it was shown. m1
    // cites a section and a whole file; m2 re-cites the same section (footnote
    // dedup — keeps index 1) and cites a *different* section of the same file
    // (a distinct ref).
    const m1 =
      `Engineer at Fixture Co [^kb:${FILE}#${SECTION_SLUG}]. ` +
      `See the profile [^kb:${WHOLE_FILE}].`;
    const m2 =
      `As noted, the highlights [^kb:${FILE}#${SECTION_SLUG}] ` +
      `and what they do [^kb:${FILE}#what-we-do].`;

    const refs = extractCitations([
      { id: "m1", text: m1 },
      { id: "m2", text: m2 },
    ]);

    // First-appearance order, deduped: highlights(1), profile(2), what-we-do(3).
    // The repeat of #highlights in m2 must NOT add a fourth ref.
    expect(refs).toHaveLength(3);
    expect(refs.map((r) => citedRefKey(r.path, r.anchor))).toEqual([
      citedRefKey(FILE, SECTION_SLUG),
      citedRefKey(WHOLE_FILE, null),
      citedRefKey(FILE, "what-we-do"),
    ]);
    // The re-cited section keeps its first index and first message id.
    const highlights = refs.find((r) => r.anchor === SECTION_SLUG)!;
    expect(highlights.index).toBe(1);
    expect(highlights.messageId).toBe("m1");

    const idx = citationIndexMap(refs);
    expect(idx[citedRefKey(FILE, SECTION_SLUG)]).toBe(1);
    expect(idx[citedRefKey(WHOLE_FILE, null)]).toBe(2);
    expect(idx[citedRefKey(FILE, "what-we-do")]).toBe(3);

    // UI rewrite: each token becomes a numbered superscript linking to the
    // internal kb:// target. The whole-file ref has no `#anchor`.
    const html1 = rewriteCitations(m1, idx);
    expect(html1).toContain(`<sup>[\\[1\\]](kb://${FILE}#${SECTION_SLUG})</sup>`);
    expect(html1).toContain(`<sup>[\\[2\\]](kb://${WHOLE_FILE})</sup>`);

    // Footnote semantics hold across messages: the repeat still renders as [1].
    const html2 = rewriteCitations(m2, idx);
    expect(html2).toContain(`<sup>[\\[1\\]](kb://${FILE}#${SECTION_SLUG})</sup>`);
    expect(html2).toContain(`<sup>[\\[3\\]](kb://${FILE}#what-we-do)</sup>`);
  });

  it("preserves accents in non-English anchors (FR citations resolve)", () => {
    // The contract tells the model to keep heading accents in the anchor
    // (`## Rôle` → `#rôle`). slugify, parseCitations, and anchorMatches are all
    // accent-sensitive; if any normalized accents away, FR citations would
    // silently resolve to nothing. Lock the whole accent-preserving path.
    expect(slugify("Rôle")).toBe("rôle");

    const parsed = parseCitations(`[^kb:experience/2018-acme.md#rôle]`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].anchor).toBe("rôle");

    expect(anchorMatches(parsed[0].anchor!, slugify("Rôle"))).toBe(true);
  });

  it("drops path-traversal citations as part of the contract", () => {
    // `..` in a cited path is silently dropped by parseCitations — the KB-file
    // route's whitelist depends on this, so it's a contract invariant, not an
    // incidental detail.
    expect(parseCitations("oops [^kb:../../etc/passwd.md]")).toHaveLength(0);
  });
});
