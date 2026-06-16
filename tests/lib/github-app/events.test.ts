import { describe, it, expect } from "vitest";
import { parseDelivery, pushMatchesSource } from "@/lib/github-app/events";

describe("parseDelivery", () => {
  it("maps installation.created with one repo", () => {
    expect(
      parseDelivery("installation", {
        action: "created",
        installation: { id: 42 },
        sender: { id: 99 },
        repositories: [{ full_name: "alex/content" }],
      }),
    ).toEqual({ kind: "install", installationId: "42", githubUserId: "99", repos: ["alex/content"] });
  });

  it("maps installation.created with multiple repos", () => {
    const d = parseDelivery("installation", {
      action: "created",
      installation: { id: 1 },
      sender: { id: 2 },
      repositories: [{ full_name: "a/b" }, { full_name: "a/c" }],
    });
    expect(d).toMatchObject({ kind: "install", repos: ["a/b", "a/c"] });
  });

  it("maps installation.deleted to uninstall", () => {
    expect(parseDelivery("installation", { action: "deleted", installation: { id: 42 } })).toEqual({
      kind: "uninstall",
      installationId: "42",
    });
  });

  it("ignores other installation actions", () => {
    expect(parseDelivery("installation", { action: "suspend", installation: { id: 42 } })).toEqual({
      kind: "ignore",
    });
  });

  it("maps installation_repositories.added", () => {
    expect(
      parseDelivery("installation_repositories", {
        action: "added",
        installation: { id: 42 },
        repositories_added: [{ full_name: "alex/content" }],
      }),
    ).toEqual({ kind: "repos-added", installationId: "42", repos: ["alex/content"] });
  });

  it("maps push", () => {
    expect(
      parseDelivery("push", {
        ref: "refs/heads/main",
        installation: { id: 42 },
        repository: { full_name: "alex/content" },
      }),
    ).toEqual({ kind: "push", installationId: "42", repoFullName: "alex/content", ref: "refs/heads/main" });
  });

  it("maps ping to pong", () => {
    expect(parseDelivery("ping", { zen: "hi", installation: { id: 42 } })).toEqual({ kind: "pong" });
  });

  it("ignores unknown events and malformed payloads", () => {
    expect(parseDelivery("issues", {})).toEqual({ kind: "ignore" });
    expect(parseDelivery("installation", { action: "created", installation: {} })).toEqual({ kind: "ignore" });
    expect(parseDelivery("push", { ref: "refs/heads/main", installation: { id: 1 } })).toEqual({ kind: "ignore" });
  });
});

describe("pushMatchesSource", () => {
  const url = "https://github.com/alex/content";
  it("matches the stored repo + branch (case-insensitive repo)", () => {
    expect(pushMatchesSource("Alex/Content", "refs/heads/main", url, "main")).toBe(true);
  });
  it("rejects a different branch", () => {
    expect(pushMatchesSource("alex/content", "refs/heads/dev", url, "main")).toBe(false);
  });
  it("rejects a different repo", () => {
    expect(pushMatchesSource("alex/other", "refs/heads/main", url, "main")).toBe(false);
  });
  it("rejects when the stored URL is unparseable", () => {
    expect(pushMatchesSource("alex/content", "refs/heads/main", "not-a-url", "main")).toBe(false);
  });
  it("rejects a non-branch ref such as a tag push", () => {
    expect(pushMatchesSource("alex/content", "refs/tags/main", url, "main")).toBe(false);
  });
});
