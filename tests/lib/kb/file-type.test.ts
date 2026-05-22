import { describe, it, expect } from "vitest";
import { fileTypeFromPath } from "@/lib/kb/file-type";

describe("fileTypeFromPath", () => {
  it("detects markdown", () => {
    expect(fileTypeFromPath("experience/2025-altergo.md")).toBe("md");
  });
  it("detects yaml (.yaml and .yml)", () => {
    expect(fileTypeFromPath("profile.yaml")).toBe("yaml");
    expect(fileTypeFromPath("notes.yml")).toBe("yaml");
  });
  it("detects html (.html and .htm)", () => {
    expect(fileTypeFromPath("portfolio.html")).toBe("html");
    expect(fileTypeFromPath("legacy.htm")).toBe("html");
  });
  it("detects pdf", () => {
    expect(fileTypeFromPath("cv.pdf")).toBe("pdf");
  });
  it("is case-insensitive on the extension", () => {
    expect(fileTypeFromPath("CV.PDF")).toBe("pdf");
  });
  it("returns null for unknown or extensionless paths", () => {
    expect(fileTypeFromPath("notes.txt")).toBeNull();
    expect(fileTypeFromPath("README")).toBeNull();
  });
});
