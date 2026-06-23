import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
    for (const h of ["Experience", "Education", "Skills", "Projects", "Talks", "Publications"]) {
      expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    }
    // The legacy "Open source" block is merged into the unified "Projects" section.
    expect(screen.queryByRole("heading", { name: "Open source" })).toBeNull();
  });

  it("omits a section when its data is empty", () => {
    render(<CvDocumentView kb={makeKb({ talks: [], projects: [] })} lang="en" />);
    expect(screen.queryByRole("heading", { name: "Talks" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Projects" })).toBeNull();
    // Experience still present
    expect(screen.getByRole("heading", { name: "Experience" })).toBeInTheDocument();
  });

  it("renders the bio and the Selected achievements band when the profile has them", () => {
    const kb = makeKb({
      profile: {
        name: "Ada Lovelace",
        headline: "Computing pioneer",
        bio: "Mathematician who wrote the first published algorithm.",
        achievements: ["**First algorithm** intended for a machine.", "Founding figure of computing."],
      },
    });
    render(<CvDocumentView kb={kb} lang="en" />);
    expect(screen.getByText("Mathematician who wrote the first published algorithm.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Selected achievements" })).toBeInTheDocument();
    // The markdown bold lead renders as <strong>.
    expect(screen.getByText("First algorithm", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Founding figure of computing.", { selector: "span" })).toBeInTheDocument();
  });

  it("omits the bio and achievements band when the profile lacks them", () => {
    render(<CvDocumentView kb={makeKb()} lang="en" />);
    expect(screen.queryByRole("heading", { name: "Selected achievements" })).toBeNull();
  });

  it("renders publications with a title and an authors · venue · year meta line", () => {
    render(<CvDocumentView kb={makeKb()} lang="en" />);
    expect(screen.getByText("Notes on the Analytical Engine")).toBeInTheDocument();
    expect(screen.getByText("A. Lovelace")).toBeInTheDocument();
    expect(screen.getByText(/Taylor's Scientific Memoirs · 1843/)).toBeInTheDocument();
  });

  it("renders one rich entry per project: a linked name, its description, and its year", () => {
    render(<CvDocumentView kb={makeKb()} lang="en" />);
    // projectLink prefers the project's canonical frontmatter url.
    expect(screen.getByRole("link", { name: "Note G" })).toHaveAttribute(
      "href",
      "https://example.com/note-g",
    );
    expect(
      screen.getByText(/The first published algorithm intended for a machine\./),
    ).toBeInTheDocument();
    // The year renders as the project row's right-aligned meta marker.
    const row = screen.getByRole("link", { name: "Note G" }).closest("li")!;
    expect(within(row).getByText("1843")).toBeInTheDocument();
  });

  it("links a url-less project via its first public repo and never leaks a private repo url", () => {
    const kb = makeKb({
      projects: [
        {
          slug: "altergo",
          relativePath: "projects/altergo.md",
          frontmatter: {
            name: "Altergo",
            description: "Battery intelligence platform.",
            repos: [
              { name: "core", role: "author", visibility: "private", url: "https://github.com/x/private-core" },
              { name: "sdk", role: "author", visibility: "public", url: "https://github.com/x/public-sdk" },
            ],
          },
          body: "",
        },
      ],
    });
    const { container } = render(<CvDocumentView kb={kb} lang="en" />);
    expect(screen.getByRole("link", { name: "Altergo" })).toHaveAttribute(
      "href",
      "https://github.com/x/public-sdk",
    );
    expect(container.innerHTML).not.toContain("private-core");
  });

  it("renders a project with no public link as plain text, not a link", () => {
    const kb = makeKb({
      projects: [
        {
          slug: "graybox",
          relativePath: "projects/graybox.md",
          frontmatter: {
            name: "Graybox",
            description: "A local-first meta-ontology.",
            repos: [
              { name: "graybox", role: "author", visibility: "private", url: "https://github.com/x/graybox" },
            ],
          },
          body: "",
        },
      ],
    });
    render(<CvDocumentView kb={kb} lang="en" />);
    expect(screen.getByText("Graybox")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Graybox" })).toBeNull();
  });

  it("renders the profile QR (role=img) and the URL when profileUrl and qrSvg are provided", () => {
    render(
      <CvDocumentView
        kb={makeKb()}
        lang="en"
        profileUrl="https://cv.alex.com"
        qrSvg="<svg></svg>"
      />,
    );
    expect(screen.getByRole("img", { name: "Profile QR code" })).toBeInTheDocument();
    expect(screen.getByText("cv.alex.com")).toBeInTheDocument();
  });

  it("omits the QR block when profileUrl or qrSvg is absent", () => {
    render(<CvDocumentView kb={makeKb()} lang="en" />);
    expect(screen.queryByRole("img", { name: "Profile QR code" })).toBeNull();
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

  it("renders the profile photo with the person's name as alt when profile.photo is set", () => {
    const kb = makeKb({
      profile: {
        name: "Ada Lovelace",
        headline: "Computing pioneer",
        photo: "https://cdn.example.com/ada.jpg",
      },
    });
    render(<CvDocumentView kb={kb} lang="en" />);
    const photo = screen.getByRole("img", { name: "Portrait of Ada Lovelace" });
    expect(photo).toHaveAttribute("src", "https://cdn.example.com/ada.jpg");
  });

  it("omits the profile photo when profile.photo is absent", () => {
    render(<CvDocumentView kb={makeKb()} lang="en" />);
    // The QR is also role=img; assert specifically that no portrait img exists.
    expect(screen.queryByRole("img", { name: /^Portrait of/ })).toBeNull();
  });

  it("renders the photo independently of the QR block", () => {
    const kb = makeKb({
      profile: {
        name: "Ada Lovelace",
        headline: "Computing pioneer",
        photo: "https://cdn.example.com/ada.jpg",
      },
    });
    render(
      <CvDocumentView kb={kb} lang="en" profileUrl="https://cv.alex.com" qrSvg="<svg></svg>" />,
    );
    // Both the portrait and the QR render together.
    expect(screen.getByRole("img", { name: "Portrait of Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Profile QR code" })).toBeInTheDocument();
  });
});
