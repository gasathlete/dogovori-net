import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mergeRefinementPatch } from "./product-refinement-patch.ts";
Deno.test("refinement preserves exact paid evidence and changes only narrative", () => {
  const base = { source: { source_hash: "exact" }, payload: { corrections: [{ id: "c1", original_text: "exact source" }], messages: [], refinement: { included: 1, used: 0 } } };
  assertEquals(mergeRefinementPatch(base, { messages: ["updated"] }), { ...base, payload: { ...base.payload, messages: ["updated"], refinement: { included: 1, used: 1 } } });
});
Deno.test("refinement cannot overwrite source or corrections", async () => {
  for (const patch of [{ source: {} }, { corrections: [] }]) await assertRejects(async () => { mergeRefinementPatch({ payload: {} }, patch); }, Error, "refined_invalid");
});