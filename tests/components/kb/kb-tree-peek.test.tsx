/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KbTree } from "@/components/kb/kb-tree";
import { useKb } from "@/components/kb/kb-context";
import * as peek from "@/lib/kb/use-kb-peek";
import type { KbFile } from "@/lib/kb/manifest";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";

vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

const FILES: KbFile[] = [{ path: "experience/2021-ion.md", title: "2021 — ION Energy", type: "md" }];

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  vi.mocked(useKb).mockReturnValue(makeKbContext({ manifest: FILES, groups: [{ name: "experience" }] }));
  sessionStorage.clear();
});

describe("KbTree — peek wiring", () => {
  it("hovering a doc row calls show with the file and a doc target", async () => {
    const show = vi.fn();
    vi.spyOn(peek, "useKbPeek").mockReturnValue({ active: null, show, hide: vi.fn() });
    const user = userEvent.setup();

    render(<KbTree manifest={FILES} citedRefs={[]} onOpen={vi.fn()} />);
    await user.hover(screen.getByRole("button", { name: /2021 — ION Energy/ }));

    expect(show).toHaveBeenCalledTimes(1);
    const [, file, target] = show.mock.calls[0];
    expect(file.path).toBe("experience/2021-ion.md");
    expect(target).toEqual({ kind: "doc" });
  });
});
