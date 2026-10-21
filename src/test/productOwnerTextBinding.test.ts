import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { bindingFromEntitlement, type PaidEntitlementRow } from "@/lib/productPaidResult";

describe("paid owner text binding", () => {
  it("accepts the distinct owner_text source without relabeling it as a file", () => {
    const row = { source_document_id: "11111111-2222-3333-4444-555555555555", source_updated_at: "2026-10-21T05:00:00Z", source_char_count: 300, source_char_unit: "unicode_code_points", source_kind: "owner_text", source_hash: "a".repeat(64), source_page_count: null } as PaidEntitlementRow;
    expect(bindingFromEntitlement(row)?.source_kind).toBe("owner_text");
    expect(bindingFromEntitlement({ ...row, source_kind: "browser_claim" })).toBeNull();
  });
});