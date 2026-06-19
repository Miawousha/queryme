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
});
