import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Kb } from "@/lib/kb/loader";
import type { Repo } from "@/lib/kb/schemas";

const ensureReady = vi.fn();
const getRoot = vi.fn();
const loadContent = vi.fn();
const toResumeKb = vi.fn();

vi.mock("@/lib/persona/store", () => ({ getPersonaStore: () => ({ ensureReady, getRoot }) }));
vi.mock("@/lib/kb/loader", () => ({ loadContent, toResumeKb }));
vi.mock("@/lib/persona", () => ({ loadPersona: () => ({ fullName: "Ada Lovelace" }) }));

function kbWithRepos(repos: Repo[]): Kb {
  return {
    profile: { name: "Ada", headline: "Dev" },
    skills: { skills: [] },
    education: { entries: [] },
    publicContact: {},
    experience: [],
    projects: [{ slug: "p", relativePath: "projects/p.md", frontmatter: { name: "p", repos }, body: "" }],
    talks: [],
    publications: [],
    recommendations: [],
  };
}

beforeEach(() => vi.clearAllMocks());

describe("loadCvKb", () => {
  it("returns null when the account has no content root", async () => {
    ensureReady.mockResolvedValue(undefined);
    getRoot.mockReturnValue(null);
    const { loadCvKb } = await import("@/lib/cv/load");
    expect(await loadCvKb("acc", "en")).toBeNull();
  });

  it("strips private repos through filterKbForCv (the privacy chokepoint)", async () => {
    ensureReady.mockResolvedValue(undefined);
    // A dir with no cv-config.yaml → loadCvConfig returns null → unconditional repo filter still runs.
    getRoot.mockReturnValue("/tmp/per-account-cv-no-config");
    const kb = kbWithRepos([
      { name: "pub", role: "author", visibility: "public", url: "https://x/pub" },
      { name: "secret", role: "author", visibility: "private", url: "https://x/secret" },
    ]);
    loadContent.mockResolvedValue({});
    toResumeKb.mockReturnValue(kb);
    const { loadCvKb } = await import("@/lib/cv/load");
    const result = await loadCvKb("acc", "en");
    expect(result).not.toBeNull();
    expect((result!.cvKb.projects[0].frontmatter.repos ?? []).map((r) => r.name)).toEqual(["pub"]);
  });

  it("returns the persona full name via cvPersonaName", async () => {
    ensureReady.mockResolvedValue(undefined);
    getRoot.mockReturnValue("/tmp/per-account-cv-no-config");
    const { cvPersonaName } = await import("@/lib/cv/load");
    expect(await cvPersonaName("acc")).toBe("Ada Lovelace");
  });
});

describe("parseCvLang", () => {
  it("returns 'fr' only for the literal 'fr'", async () => {
    const { parseCvLang } = await import("@/lib/cv/load");
    expect(parseCvLang("fr")).toBe("fr");
    expect(parseCvLang(["fr", "en"])).toBe("fr");
  });

  it("defaults to 'en' for anything else", async () => {
    const { parseCvLang } = await import("@/lib/cv/load");
    expect(parseCvLang("en")).toBe("en");
    expect(parseCvLang("de")).toBe("en");
    expect(parseCvLang(null)).toBe("en");
    expect(parseCvLang(undefined)).toBe("en");
    expect(parseCvLang(["en", "fr"])).toBe("en");
    expect(parseCvLang([])).toBe("en");
  });
});
