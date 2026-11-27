import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ status: "refunded" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === "product_entitlements" ? { product_id: "contract_check", status: state.status, environment: "sandbox", source_hash: "fixture" } : { payment_status: "paid", purchase_kind: "product", product_id: "contract_check", environment: "sandbox", product_source_hash: "fixture" } }) };
  return query;
} } }));
import { fetchPaidProductPurchase } from "@/lib/productEntitlements";
describe("paid product reversal readback", () => {
  it("refunded entitlement cannot be revived by an old paid snapshot", async () => {
    state.status = "refunded";
    expect(await fetchPaidProductPurchase("fixture-user", "cs_test_fixture")).toBeNull();
  });
  it("failed delivery retains the paid purchase for retry, not refund", async () => {
    state.status = "failed";
    expect(await fetchPaidProductPurchase("fixture-user", "cs_test_fixture")).not.toBeNull();
  });
});