import { describe, expect, it } from "vitest";
import { returnBanner, type StaticOrder } from "@/lib/staticCatalog";

const order = (state: StaticOrder["state"]): StaticOrder => ({ id: "o", environment: "live", amount_cents: 299, currency: "eur", created_at: "", product_key: "x", version: "1", filename: "x.pdf", state });
const p = (q: string) => new URLSearchParams(q);

describe("static checkout return", () => {
  it("success URL alone is not proof of payment", () => {
    expect(returnBanner(p("order=o&session_id=cs_live_1"), order("pending"))?.tone).toBe("info");
  });
  it("paid only when server state is paid", () => {
    expect(returnBanner(p("order=o&session_id=cs_live_1"), order("paid"))?.tone).toBe("success");
  });
  it("cancelled shows failure unless already paid", () => {
    expect(returnBanner(p("order=o&cancelled=1"), order("pending"))?.tone).toBe("error");
    expect(returnBanner(p("order=o&cancelled=1"), order("paid"))?.tone).toBe("success");
  });
  it("refunded is an error state", () => {
    expect(returnBanner(p("order=o"), order("refunded"))?.tone).toBe("error");
  });
});
