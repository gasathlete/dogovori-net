import { describe, it, expect } from "vitest";
import { withCatalogQuery } from "@/pages/Catalog";

describe("catalog ?q= sync", () => {
  it("sets q and keeps vid/bilingual/dynamic", () => {
    const next = withCatalogQuery(new URLSearchParams("vid=lease&bilingual=1&dynamic=1"), "наем & имот");
    expect(next.get("q")).toBe("наем & имот");
    expect(next.get("vid")).toBe("lease");
    expect(next.get("bilingual")).toBe("1");
    expect(next.get("dynamic")).toBe("1");
  });
  it("removes q when cleared", () => {
    expect(withCatalogQuery(new URLSearchParams("q=x&vid=a"), "  ").toString()).toBe("vid=a");
  });
});
