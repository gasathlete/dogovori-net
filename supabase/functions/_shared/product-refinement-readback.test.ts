import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadSucceededRefinement } from "./product-refinement-replay.ts";
import type { NegotiationPackageResult, ProductSourceBinding } from "./product-result-contract.ts";
const input = { userId: "owner", entitlementId: "paid", baseDigest: "digest", base: {} as NegotiationPackageResult, binding: {} as ProductSourceBinding };
const deps = { canonical: JSON.stringify, sha256Hex: async () => "digest" };
function db(data: unknown, error: unknown = null) {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data, error }) };
  return { from: () => query };
}
Deno.test("refinement readback fails closed on database error", async () => {
  assertEquals(await loadSucceededRefinement(db(null, "failure"), input, deps), { kind: "unavailable" });
});
Deno.test("no successful refinement does not invent an updated result", async () => {
  assertEquals(await loadSucceededRefinement(db(null), input, deps), { kind: "none" });
});
Deno.test("refinement readback rejects malformed immutable operation metadata", async () => {
  assertEquals(await loadSucceededRefinement(db({ idempotency_key: "key", instruction_digest: "digest", expected_refinement_version: "1" }), input, deps), { kind: "invalid" });
});