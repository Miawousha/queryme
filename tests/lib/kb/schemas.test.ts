import { describe, it, expect } from "vitest";
import {
  ProfileSchema,
  SkillsSchema,
  EducationSchema,
  PublicContactSchema,
  ExperienceFrontmatterSchema,
  ProjectFrontmatterSchema,
  TalkFrontmatterSchema,
  RepoSchema,
  RecommendationFrontmatterSchema,
} from "@/lib/kb/schemas";

describe("ProfileSchema", () => {
  it("accepts a fully populated profile", () => {
    const data = {
      name: "Alexandre Collet",
      headline: "Founder / CTO at Matrice",
      location: "Paris, France",
      languages: ["en", "fr"],
      photo: "/photo.jpg",
      links: { linkedin: "https://linkedin.com/in/x", github: "https://github.com/x" },
    };
    expect(ProfileSchema.parse(data)).toEqual(data);
  });

  it("requires name and headline", () => {
    expect(() => ProfileSchema.parse({ name: "X" })).toThrow();
    expect(() => ProfileSchema.parse({ headline: "X" })).toThrow();
  });

  it("rejects unknown language codes", () => {
    const data = { name: "X", headline: "Y", languages: ["xx"] };
    expect(() => ProfileSchema.parse(data)).toThrow();
  });
});

describe("SkillsSchema", () => {
  it("accepts a list of skills with levels and years", () => {
    const data = {
      skills: [
        { name: "TypeScript", level: 5, years: 10 },
        { name: "Python", level: 4, years: 8, tags: ["backend"] },
      ],
    };
    expect(SkillsSchema.parse(data)).toEqual(data);
  });

  it("rejects levels outside 1..5", () => {
    expect(() => SkillsSchema.parse({ skills: [{ name: "X", level: 6, years: 1 }] })).toThrow();
    expect(() => SkillsSchema.parse({ skills: [{ name: "X", level: 0, years: 1 }] })).toThrow();
  });
});

describe("EducationSchema", () => {
  it("accepts a list of degrees", () => {
    const data = {
      entries: [
        { institution: "X University", degree: "MSc CS", start: "2014-09", end: "2016-06" },
      ],
    };
    expect(EducationSchema.parse(data)).toEqual(data);
  });
});

describe("PublicContactSchema", () => {
  it("accepts email + links", () => {
    const data = { email: "a@b.com", links: { linkedin: "https://linkedin.com/in/x" } };
    expect(PublicContactSchema.parse(data)).toEqual(data);
  });
});

describe("ExperienceFrontmatterSchema", () => {
  it("accepts a typical role", () => {
    const data = {
      company: "Matrice",
      role: "Founder",
      start: "2022-03",
      end: "present",
      location: "Paris",
      stack: ["TypeScript"],
      tags: ["founder"],
    };
    expect(ExperienceFrontmatterSchema.parse(data)).toEqual(data);
  });

  it("rejects malformed dates", () => {
    const data = { company: "X", role: "Y", start: "March 2022", end: "present" };
    expect(() => ExperienceFrontmatterSchema.parse(data)).toThrow();
  });
});

describe("ProjectFrontmatterSchema", () => {
  it("accepts a typical project entry", () => {
    const data = {
      name: "Queryme",
      year: 2026,
      stack: ["TypeScript"],
      tags: ["ai"],
      url: "https://github.com/x/queryme",
    };
    expect(ProjectFrontmatterSchema.parse(data)).toEqual(data);
  });

  it("keeps an optional one-line description", () => {
    const data = { name: "Queryme", description: "An agent-driven CV." };
    expect(ProjectFrontmatterSchema.parse(data)).toEqual(data);
  });

  it("accepts a project with a nested repos array", () => {
    const data = {
      name: "Queryme",
      repos: [
        { name: "queryme", role: "author", url: "https://github.com/x/queryme" },
      ],
    };
    const parsed = ProjectFrontmatterSchema.parse(data);
    expect(parsed.repos).toHaveLength(1);
    expect(parsed.repos![0].visibility).toBe("public"); // default applied
  });
});

describe("TalkFrontmatterSchema", () => {
  it("accepts a minimal talk", () => {
    expect(() =>
      TalkFrontmatterSchema.parse({
        title: "Battery emulation at scale",
        venue: "EVS37",
        year: 2024,
      }),
    ).not.toThrow();
  });
  it("rejects a talk missing title or venue", () => {
    expect(() => TalkFrontmatterSchema.parse({ venue: "X", year: 2024 })).toThrow();
    expect(() => TalkFrontmatterSchema.parse({ title: "T", year: 2024 })).toThrow();
  });
});

describe("RepoSchema", () => {
  it("accepts a minimal public repo (visibility defaults to public)", () => {
    const parsed = RepoSchema.parse({
      name: "queryme",
      url: "https://github.com/Miawousha/queryme",
      role: "author",
    });
    expect(parsed.visibility).toBe("public");
  });

  it("accepts a private repo without a url", () => {
    expect(() =>
      RepoSchema.parse({ name: "internal-tool", role: "author", visibility: "private" }),
    ).not.toThrow();
  });

  it("accepts optional language/stars/archived/last_active/stack/tags fields", () => {
    const parsed = RepoSchema.parse({
      name: "x",
      url: "https://example.com/x",
      role: "author",
      language: "TypeScript",
      stars: 42,
      archived: true,
      last_active: "2025-05",
      stack: ["Rust"],
      tags: ["tooling"],
    });
    expect(parsed.language).toBe("TypeScript");
    expect(parsed.stars).toBe(42);
    expect(parsed.archived).toBe(true);
    expect(parsed.last_active).toBe("2025-05");
  });

  it("rejects an invalid role", () => {
    expect(() => RepoSchema.parse({ name: "x", url: "https://example.com/x", role: "owner" })).toThrow();
  });

  it("rejects an invalid visibility", () => {
    expect(() => RepoSchema.parse({ name: "x", role: "author", visibility: "secret" })).toThrow();
  });

  it("rejects negative stars", () => {
    expect(() =>
      RepoSchema.parse({ name: "x", url: "https://example.com/x", role: "author", stars: -1 }),
    ).toThrow();
  });
});

describe("RecommendationFrontmatterSchema", () => {
  it("accepts a minimal recommendation", () => {
    expect(() =>
      RecommendationFrontmatterSchema.parse({
        from: "Jane Doe",
        title: "VP Engineering at Acme",
        date: "2024-09",
      }),
    ).not.toThrow();
  });
});
