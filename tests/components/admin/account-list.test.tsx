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
});
