import { describe, expect, it } from "vitest";
import { isOriginalUnderRevision, ORIGINALS_UNDER_REVISION } from "@/lib/templateReviewStatus";

describe("review scope is exactly five originals, not entire categories", () => {
  for (const slug of [
    "predizvestie-za-prekratyavane-na-naem",
    "priemo-predavatelen-protokol",
    "sporazumenie-za-prekratyavane-na-naem-po-vzaimno-saglasie",
    "dogovor-za-naem-na-parkomyasto-garazh",
    "uchreditelen-akt-na-eood",
  ]) it(slug, () => expect(isOriginalUnderRevision(slug)).toBe(true));
  it("does not include other receipts, protocols or notices", () => {
    expect(ORIGINALS_UNDER_REVISION).toHaveLength(5);
    expect(isOriginalUnderRevision("razpiska-za-poluchena-suma")).toBe(false);
    expect(isOriginalUnderRevision("priemo-predavatelen-protokol-za-predavane-na-klyuchove")).toBe(false);
    expect(isOriginalUnderRevision("predizvestie-za-napuskane")).toBe(false);
  });
});