import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// validateBody е чиста; импортът на index.ts стартира Deno.serve, затова го
// заместваме с no-op само за теста.
(Deno as unknown as { serve: unknown }).serve = () => {};
const { validateBody } = await import("./index.ts");

const id = "3f1c1d2e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const text = "Синтетичен текст за проверка на входа. ".repeat(4);

Deno.test("create accepts allowlisted fields", () => {
  const r = validateBody({ action: "create", id, title: "Т", text });
  assertEquals(r.ok, true);
});
Deno.test("client user_id / team_id / source are refused", () => {
  for (const k of ["user_id", "team_id", "source", "storage_path", "text_hash"]) {
    assertEquals(validateBody({ action: "create", id, title: "Т", text, [k]: "x" }), { ok: false, code: "field_not_allowed" });
  }
});
Deno.test("short or oversized text refused", () => {
  assertEquals(validateBody({ action: "create", id, title: "Т", text: "кратко" }), { ok: false, code: "invalid_text" });
  assertEquals(validateBody({ action: "create", id, title: "Т", text: "а".repeat(200_001) }), { ok: false, code: "invalid_text" });
});
Deno.test("update requires revision", () => {
  assertEquals(validateBody({ action: "update", id, text }), { ok: false, code: "invalid_revision" });
});
Deno.test("product_source must be boolean; product text bounded without truncation", async () => {
  assertEquals(validateBody({ action: "create", id, title: "Т", text, product_source: "yes" }), { ok: false, code: "invalid_product_source" });
  const { productText } = await import("./index.ts");
  assertEquals(productText("кратък"), null);
  assertEquals(productText("а".repeat(60001)), null);
  assertEquals(productText("  а  б\r\n" + "в".repeat(90))?.text, "а б\n" + "в".repeat(90));
});
