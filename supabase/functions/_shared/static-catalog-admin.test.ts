import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { registerStaticAsset, staticOrderState, validateStaticAssetInput, listStaticOrders } from "./static-catalog.ts";

const U = "11111111-1111-4111-8111-111111111111";
const pdf = btoa("%PDF-1.7 test");
const base = { productKey: "dogovor-za-uslugi", version: "2026-10-19", filename: "uslugi.pdf", mimeType: "application/pdf",
  contentBase64: pdf, amountCents: 299, stripePriceId: "price_test_1", legalAcceptanceRef: "LEGAL-2026-10-19-01", reviewerAttestation: true };
const price = { id: "price_test_1", livemode: false, active: true, type: "one_time", recurring: null, unit_amount: 299, currency: "eur", tax_behavior: "inclusive" };

function deps(staff: boolean, inserted: unknown[] = []) {
  return {
    env: () => undefined,
    stripe: () => ({ prices: { retrieve: () => Promise.resolve(price) } }),
    db: {
      rpc: () => Promise.resolve({ data: staff, error: null }),
      from: () => ({ insert: (r: Record<string, unknown>) => { inserted.push(r); return { select: () => ({ maybeSingle: async () => {
        const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
        const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (v) => v.toString(16).padStart(2, "0")).join("");
        return { data: { id: "a", content_sha256: h }, error: null }; } }) }; } }),
    },
  };
}

Deno.test("reviewer attestation and acceptance ref are required (no fabricated acceptance)", () => {
  const { errors } = validateStaticAssetInput({ ...base, reviewerAttestation: false, legalAcceptanceRef: "" });
  assertEquals(errors.includes("reviewer_attestation_required") && errors.includes("legal_acceptance_ref_required"), true);
});

Deno.test("templates under the 12.10 legal report are refused", () => {
  for (const k of ["predizvestie-za-naem", "parkomyasto-naem", "uchredyavane-eood", "priemo-predavatelen-protokol"])
    assertEquals(validateStaticAssetInput({ ...base, productKey: k }).errors.includes("legal_rework_required"), true);
});

Deno.test("file bytes must match declared type", () => {
  assertEquals(validateStaticAssetInput({ ...base, contentBase64: btoa("PK\u0003\u0004") }).errors.includes("content_type_mismatch"), true);
});

Deno.test("non-staff cannot register", async () => {
  let code = "";
  try { await registerStaticAsset(deps(false), U, base); } catch (e) { code = (e as { code: string }).code; }
  assertEquals(code, "sandbox_forbidden");
});

Deno.test("reviewer is the authenticated staff account, time is server time", async () => {
  const ins: Record<string, unknown>[] = [];
  const r = await registerStaticAsset(deps(true, ins), U, base);
  assertEquals(r.ok, true);
  assertEquals(ins[0].reviewer_ref, `staff:${U}`);
});

Deno.test("order states: refund beats paid, paid needs event proof", () => {
  assertEquals(staticOrderState({ stripe_session_id: "cs_test_1" }, { paid_at: "x", stripe_event_id: "evt", revoked_at: "y" }), "refunded");
  assertEquals(staticOrderState({ stripe_session_id: "cs_test_1" }, { paid_at: "x" }), "pending");
  assertEquals(staticOrderState({ stripe_session_id: null }, null), "failed");
});

Deno.test("orders list is denied to non-staff in sandbox mode", async () => {
  let code = "";
  try { await listStaticOrders(deps(false), U); } catch (e) { code = (e as { code: string }).code; }
  assertEquals(code, "sandbox_forbidden");
});
