import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import About from "@/app/about/page";

describe("/about page", () => {
  it("renders profile name and at least one experience heading server-side", async () => {
    // Server components are async — invoke and render.
    const ui = await About();
    const { container } = render(ui);
    expect(container.textContent).toContain("Alexandre Collet");
    expect(container.querySelector("h2")).not.toBeNull();
  });
});
