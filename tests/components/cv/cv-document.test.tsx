import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CvDocumentView } from "@/components/cv/cv-document";
import { makeKb } from "../../helpers/cv-fixtures";

describe("CvDocumentView", () => {
  it("renders the identity header from profile", () => {
    render(<CvDocumentView kb={makeKb()} lang="en" />);
    expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByText("Computing pioneer")).toBeInTheDocument();
  });

  it("renders each section heading when its data is present", () => {
    render(<CvDocumentView kb={makeKb()} lang="en" />);
    for (const h of ["Experience", "Education", "Skills", "Selected projects", "Talks", "Open source"]) {
      expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    }
  });

  it("omits a section when its data is empty", () => {
    render(<CvDocumentView kb={makeKb({ talks: [], projects: [] })} lang="en" />);
    expect(screen.queryByRole("heading", { name: "Talks" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Selected projects" })).toBeNull();
    // Experience still present
    expect(screen.getByRole("heading", { name: "Experience" })).toBeInTheDocument();
  });

  it("lists public repos under Open source", () => {
    render(<CvDocumentView kb={makeKb()} lang="en" />);
    expect(screen.getByRole("link", { name: "note-g" })).toHaveAttribute(
      "href",
      "https://github.com/ada/note-g",
    );
  });

  it("shows total years for a closed role and only the period for an ongoing one", () => {
    const kb = makeKb({
      experience: [
        {
          slug: "closed-role",
          relativePath: "experience/closed-role.md",
          frontmatter: { company: "Acme", role: "Engineer", start: "2016-01", end: "2020-01" },
          body: "",
        },
        {
          slug: "ongoing-role",
          relativePath: "experience/ongoing-role.md",
          frontmatter: { company: "Now Inc", role: "Lead", start: "2022-01", end: "present" },
          body: "",
        },
      ],
    });
    render(<CvDocumentView kb={kb} lang="en" />);
    // Jan 2016 – Jan 2020 spans 4 whole years.
    expect(screen.getByText(/4 yrs/)).toBeInTheDocument();
    // Ongoing role shows "present" and no computed year total.
    expect(screen.getByText(/present/i)).toBeInTheDocument();
  });
});
