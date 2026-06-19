import type { Kb } from "@/lib/kb/loader";

/** A complete, schema-valid `Kb` for renderer/serializer tests. Override any
 * slice (e.g. `makeKb({ talks: [] })`) to exercise empty-section behavior. */
export function makeKb(overrides?: Partial<Kb>): Kb {
  return {
    profile: { name: "Ada Lovelace", headline: "Computing pioneer", location: "London" },
    publicContact: {
      email: "ada@example.com",
      links: { linkedin: "https://linkedin.com/in/ada", github: "https://github.com/ada" },
    },
    skills: {
      skills: [
        { name: "Analytical Engine", level: 5, years: 10 },
        { name: "Mathematics", level: 4, years: 20 },
      ],
    },
    education: {
      entries: [
        { institution: "Private tutoring", degree: "Mathematics", start: "1830-01", end: "1835-01" },
      ],
    },
    experience: [
      {
        slug: "1843-engine",
        relativePath: "experience/1843-engine.md",
        frontmatter: {
          company: "Analytical Engine Project",
          role: "Mathematician",
          start: "1843-01",
          end: "present",
          location: "London",
          summary: "Designed the first published algorithm.",
          highlights: ["Wrote the first algorithm intended for a machine."],
          stack: ["Bernoulli numbers"],
        },
        body: "- Body bullet one\n- Body bullet two",
      },
    ],
    projects: [
      {
        slug: "note-g",
        relativePath: "projects/note-g.md",
        frontmatter: {
          name: "Note G",
          year: 1843,
          url: "https://example.com/note-g",
          stack: ["Algorithm"],
          repos: [
            {
              name: "note-g",
              role: "author",
              url: "https://github.com/ada/note-g",
              visibility: "public",
              description: "The first algorithm.",
            },
          ],
        },
        body: "",
      },
    ],
    talks: [
      {
        slug: "engine-talk",
        relativePath: "talks/engine-talk.md",
        frontmatter: {
          title: "On the Analytical Engine",
          venue: "Royal Society",
          year: 1843,
          url: "https://example.com/talk",
        },
        body: "",
      },
    ],
    recommendations: [],
    ...overrides,
  };
}
