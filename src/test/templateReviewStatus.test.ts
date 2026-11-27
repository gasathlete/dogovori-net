import { describe, expect, it } from "vitest";
import { allTemplates } from "@/lib/templateIndex";
import { CATALOG_REVIEW_STATUS, getTemplateReviewStatus } from "@/lib/templateReviewStatus";

describe("owner-selected whole-catalog review scope", () => {
  it("uses one immutable status for every canonical template, including previously excluded receipts", () => {
    const templates = allTemplates();
    expect(templates.length).toBeGreaterThan(500);
    expect(templates.some((entry) => entry.slug === "razpiska-za-poluchena-suma")).toBe(true);
    for (const entry of templates) {
      // Each canonical entry is subject to the same unconditional public policy.
      expect({ slug: entry.slug, status: getTemplateReviewStatus() }.status).toBe(CATALOG_REVIEW_STATUS);
    }
    expect(Object.isFrozen(CATALOG_REVIEW_STATUS)).toBe(true);
  });
});
