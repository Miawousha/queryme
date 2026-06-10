import { describe, it, expect } from "vitest";
import { fileTypeFromPath, isLocaleSidecar } from "@/lib/kb/file-type";

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

describe("isLocaleSidecar", () => {
  it("identifies en/fr sidecar md files", () => {
    expect(isLocaleSidecar("experience/2024-fixture-co.fr.md")).toBe(true);
    expect(isLocaleSidecar("experience/2024-fixture-co.en.md")).toBe(true);
  });

  it("identifies en/fr sidecar yaml files", () => {
    expect(isLocaleSidecar("profile.fr.yaml")).toBe(true);
    expect(isLocaleSidecar("skills.en.yaml")).toBe(true);
  });

  it("returns false for content files whose name contains dots (e.g. web.ui.md)", () => {
    expect(isLocaleSidecar("notes/web.ui.md")).toBe(false);
    expect(isLocaleSidecar("articles/v2.0.md")).toBe(false);
  });

  it("returns false for canonical (non-sidecar) files", () => {
    expect(isLocaleSidecar("experience/2024-fixture-co.md")).toBe(false);
    expect(isLocaleSidecar("profile.yaml")).toBe(false);
  });
});
