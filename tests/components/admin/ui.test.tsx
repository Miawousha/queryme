import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { initialsFrom, Avatar, StatTile } from "@/components/admin/ui";

describe("initialsFrom", () => {
  it("takes the first letter of the first two words, uppercased", () => {
    expect(initialsFrom("Maya Rodriguez")).toBe("MR");
    expect(initialsFrom("mary jane watson")).toBe("MJ");
  });
  it("handles a single name", () => {
    expect(initialsFrom("Madonna")).toBe("M");
  });
  it("returns empty for blank or missing names", () => {
    expect(initialsFrom(null)).toBe("");
    expect(initialsFrom("   ")).toBe("");
  });
});

describe("Avatar", () => {
  it("renders initials for a named person", () => {
    render(<Avatar name="Sarah Lee" />);
    expect(screen.getByText("SL")).toBeInTheDocument();
  });
  it("falls back to a glyph when there is no name", () => {
    const { container } = render(<Avatar name={null} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("StatTile", () => {
  it("renders a label and value", () => {
    render(<StatTile label="Conversations" value={248} />);
    expect(screen.getByText("Conversations")).toBeInTheDocument();
    expect(screen.getByText("248")).toBeInTheDocument();
  });
});
