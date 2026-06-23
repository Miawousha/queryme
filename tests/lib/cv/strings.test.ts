import { describe, it, expect } from "vitest";
import { CV_STRINGS } from "@/lib/cv/strings";

describe("CV_STRINGS queritae pitchTemplate", () => {
  it("retains the {name} token in both locales", () => {
    expect(CV_STRINGS.en.queritae.pitchTemplate).toContain("{name}");
    expect(CV_STRINGS.fr.queritae.pitchTemplate).toContain("{name}");
  });
});
