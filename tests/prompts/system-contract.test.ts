/**
 * Prompt-to-code contract test for `prompts/system.md`.
 *
 * The system prompt documents four policy tokens that downstream TypeScript
 * code parses or implements:
 *
 *   1. `[^kb:<path>]` citation format    → lib/kb/citations.ts (parseCitations)
 *   2. `[[forward:<question>]]` marker   → lib/markers.ts (splitOnMarkers)
 *   3. `identify_interviewer` tool       → lib/interviewer/tool.ts (buildIdentifyTools)
 *   4. `[ref: <path>]` grounding marker  → lib/kb/assembler.ts (assemblePublicKbText)
 *
 * Those four edges were surfaced by `/graphify` as INFERRED links between the
 * system prompt (a markdown document) and TS functions in four otherwise-
 * disconnected modules. Editing the prompt without updating the matching parser
 * (or vice versa) silently breaks the contract — the LLM emits a token the
 * code can no longer recognize, or the code parses a token the LLM was never
 * told to produce. This test locks both halves together.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCitations } from "@/lib/kb/citations";
import { splitOnMarkers, FORWARD_MARKER_RE } from "@/lib/markers";
import { buildIdentifyTools } from "@/lib/interviewer/tool";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { loadKb, type Kb } from "@/lib/kb/loader";
import type { InterviewerIdentity } from "@/lib/db/schema";

const PROMPT_PATH = path.resolve(process.cwd(), "tests/fixtures/persona/prompts/system.md");
const PROMPT = readFileSync(PROMPT_PATH, "utf8");
const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/kb");

describe("prompts/system.md ↔ implementation contract", () => {
  describe("Citation format [^kb:<path>]", () => {
    it("the prompt advertises the [^kb:<path>] token", () => {
      // If this line disappears from the prompt, the LLM may stop emitting
      // citations in the format `parseCitations` knows how to read.
      expect(PROMPT).toMatch(/\[\^kb:<path>\]/);
      expect(PROMPT).toMatch(/\[\^kb:<path>#<anchor>\]/);
    });

    it("every literal [^kb:...] example in the prompt parses", () => {
      // Match `[^kb:...]` but skip the format-description placeholders
      // (anything containing `<`, e.g. `[^kb:<path>]`).
      const literalRe = /\[\^kb:[^\]<]+\]/g;
      const examples = PROMPT.match(literalRe) ?? [];
      // The prompt currently contains exactly one literal example
      // (`[^kb:experience/2022-maxwell.md]`). If you add another, it must
      // also be a parseable token.
      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        const parsed = parseCitations(ex);
        expect(parsed, `prompt example ${ex} did not parse`).toHaveLength(1);
        expect(parsed[0].token).toBe(ex);
      }
    });

    it("anchor slugs use kebab-case as the prompt promises", () => {
      // Prompt says: "the anchor is a kebab-case slug of the section heading".
      // Ensure the regex actually accepts kebab-case (letters + `-`).
      const sample = "[^kb:experience/2022-maxwell.md#highlights-and-impact]";
      const parsed = parseCitations(sample);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].anchor).toBe("highlights-and-impact");
    });
  });

  describe("[[forward:<question>]] marker", () => {
    it("the prompt advertises the [[forward:...]] token", () => {
      expect(PROMPT).toMatch(/\[\[forward:<question text>\]\]/);
    });

    it("every literal [[forward:...]] example in the prompt parses", () => {
      // Match the documented marker shape (non-greedy on `]`).
      const examples = [...PROMPT.matchAll(FORWARD_MARKER_RE)].map((m) => m[0]);
      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        const chunks = splitOnMarkers(ex);
        const forwards = chunks.filter((c) => c.kind === "forward");
        expect(forwards, `prompt example ${ex} did not split`).toHaveLength(1);
        expect((forwards[0] as { kind: "forward"; question: string }).question)
          .not.toBe("");
      }
    });

    it("a forward marker survives a round trip with surrounding text", () => {
      // Mirror the in-prose example from the prompt so we exercise the path
      // where text+marker+text get split correctly.
      const text =
        "His latest internal metrics aren't in the public KB — I can pass it on. " +
        "[[forward:What were the user-growth numbers for Matrice in Q1 2026?]]";
      const chunks = splitOnMarkers(text);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({
        kind: "text",
        value: expect.stringContaining("public KB"),
      });
      expect(chunks[1]).toEqual({
        kind: "forward",
        question: "What were the user-growth numbers for Matrice in Q1 2026?",
      });
    });
  });

  describe("identify_interviewer tool", () => {
    const persisted: InterviewerIdentity[] = [];
    let tools: ReturnType<typeof buildIdentifyTools>;

    beforeAll(() => {
      tools = buildIdentifyTools(async (id) => {
        persisted.push(id);
      });
    });

    it("the prompt advertises the identify_interviewer tool by name", () => {
      expect(PROMPT).toMatch(/`identify_interviewer`/);
    });

    it("buildIdentifyTools exposes exactly one tool named identify_interviewer", () => {
      const names = Object.keys(tools);
      expect(names).toEqual(["identify_interviewer"]);
    });

    it("the basis enum accepts the values the prompt promises", async () => {
      // Prompt: "Set `basis` to `stated` when the visitor said it explicitly,
      // or `inferred` when you deduced it from context."
      expect(PROMPT).toMatch(/`stated`/);
      expect(PROMPT).toMatch(/`inferred`/);

      const tool = tools.identify_interviewer;
      expect(tool.execute).toBeTypeOf("function");

      // Both documented basis values must be accepted by the tool's input.
      // (We pass a minimal payload — name + basis — and assert no throw.)
      // @ts-expect-error - AI SDK types execute as (input, opts) => any; we
      // only need to test the schema half here.
      const r1 = await tool.execute({ name: "Sarah", basis: "stated" });
      expect(r1).toEqual({ ok: true });
      // @ts-expect-error - see above
      const r2 = await tool.execute({ name: "Sarah", basis: "inferred" });
      expect(r2).toEqual({ ok: true });

      // And a value the prompt does NOT promise must be rejected — so we
      // catch silent drift where the schema starts accepting `guessed` etc.
      await expect(
        // @ts-expect-error - intentional invalid input
        tool.execute({ name: "Sarah", basis: "guessed" }),
      ).rejects.toBeDefined();
    });

    it("accepts all identity fields the prompt names", async () => {
      // Prompt: "name, company, their role, what they are hiring for, contact
      // details". Map: hiringFor ↔ "the role they are hiring for".
      const tool = tools.identify_interviewer;
      // @ts-expect-error - see basis test
      const result = await tool.execute({
        name: "Sarah",
        company: "Acme",
        role: "Recruiter",
        hiringFor: "CTO",
        contact: "sarah@acme.example",
        notes: "Cold inbound",
        basis: "stated",
      });
      expect(result).toEqual({ ok: true });
      const last = persisted[persisted.length - 1];
      expect(last).toMatchObject({
        name: "Sarah",
        company: "Acme",
        role: "Recruiter",
        hiringFor: "CTO",
        contact: "sarah@acme.example",
        basis: "stated",
      });
    });
  });

  describe("Grounding policy / [ref: <path>] markers", () => {
    let kb: Kb;
    let kbText: string;

    beforeAll(async () => {
      kb = await loadKb(FIXTURE_DIR);
      kbText = assemblePublicKbText(kb);
    });

    it("the prompt advertises [ref: <path>] markers", () => {
      // The grounding policy depends on the LLM seeing `[ref: <path>]` next
      // to each KB section so it can cite the right file.
      expect(PROMPT).toMatch(/\[ref:\s*<path>\]/);
    });

    it("the assembler emits a [ref: <path>] marker for every section the prompt promises", () => {
      // These section headings are the prompt's contract surface — they are
      // listed in the system prompt grounding/KB section. If a renderer
      // drops one, the LLM can't cite it.
      for (const heading of [
        "# Profile",
        "# Skills",
        "# Education",
        "# Public contact",
        "# Experience",
        "# Projects",
      ]) {
        expect(kbText, `KB text missing section ${heading}`).toContain(heading);
      }

      // Every static `[ref: ...]` line should point to a real KB path with a
      // known extension. We don't assert the file exists on disk (the fixture
      // controls that); we assert the marker shape matches what the citation
      // policy expects the LLM to echo back.
      const refRe = /\[ref:\s*([^\]]+)\]/g;
      const refs = [...kbText.matchAll(refRe)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const r of refs) {
        expect(r).toMatch(/\.(md|yaml)$/);
      }
    });

    it("a citation built from any emitted [ref: <path>] survives parseCitations", () => {
      // The prompt's contract is: the LLM sees `[ref: foo.md]` in the KB, and
      // is expected to cite it back as `[^kb:foo.md]`. Verify that round trip.
      const refRe = /\[ref:\s*([^\]]+)\]/g;
      const refs = [...kbText.matchAll(refRe)].map((m) => m[1]);
      for (const r of refs) {
        const token = `[^kb:${r}]`;
        const parsed = parseCitations(token);
        expect(parsed, `ref ${r} doesn't round-trip through parseCitations`)
          .toHaveLength(1);
        expect(parsed[0].path).toBe(r);
      }
    });
  });

  describe("contract sanity", () => {
    it("the prompt file is non-empty and was read from disk", () => {
      // Sanity check so a missing file doesn't silently render every other
      // test trivially green.
      expect(PROMPT.length).toBeGreaterThan(500);
      expect(PROMPT_PATH).toMatch(/prompts\/system\.md$/);
    });
  });
});
