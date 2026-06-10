// tests/components/admin/account-list.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountList } from "@/components/admin/account-list";

describe("AccountList", () => {
  it("renders a row per account with a link to its admin", () => {
    render(
      <AccountList
        accounts={[
          {
            id: "1",
            username: "alex",
            githubId: "42",
            role: "user",
    status: "active",
            createdAt: new Date("2026-01-01"),
            repoLinked: true,
            conversationCount: 3,
          },
        ]}
      />,
    );
    expect(screen.getByText("alex")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /alex/i });
    expect(link).toHaveAttribute("href", "/alex/admin");
  });

  it("shows a status badge and the actions for that status", () => {
    render(
      <AccountList
        accounts={[
          {
            id: "1",
            username: "newbie",
            githubId: "7",
            role: "user",
            status: "waitlisted",
            createdAt: new Date("2026-01-01"),
            repoLinked: false,
            conversationCount: 0,
          },
          {
            id: "2",
            username: "banned",
            githubId: "8",
            role: "user",
            status: "disabled",
            createdAt: new Date("2026-01-01"),
            repoLinked: false,
            conversationCount: 0,
          },
        ]}
      />,
    );
    expect(screen.getByText("waitlisted")).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-activate/i })).toBeInTheDocument();
  });

  it("styles waitlisted and disabled badges distinctly", () => {
    render(
      <AccountList
        accounts={[
          {
            id: "1",
            username: "newbie",
            githubId: null,
            role: "user",
            status: "waitlisted",
            createdAt: new Date("2026-01-01"),
            repoLinked: false,
            conversationCount: 0,
          },
        ]}
      />,
    );
    expect(screen.getByText("waitlisted").className).toContain("--color-accent");
  });
});
