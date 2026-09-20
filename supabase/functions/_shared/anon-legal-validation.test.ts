import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  allowedCitationKeys,
  validateGroundedReply,
} from "./anon-legal-validation.ts";

const CITATIONS = [
  { short_code: "ЗЗД", citation_label: "[ЗЗД, чл. 79]", version: "2026-01" },
  { short_code: "КТ", citation_label: "[КТ, чл. 328]", version: "2026-01" },
];

Deno.test("допустимите обозначения идват само от извлечените източници", () => {
  const keys = allowedCitationKeys(CITATIONS);
  assert(keys.some((k) => k.includes("ззд")));
  assertEquals(keys.some((k) => k.includes("зут")), false);
});

Deno.test("отговор с цитат от извлечен източник е валиден", () => {
  const r = validateGroundedReply("Съгласно [ЗЗД, чл. 79] дължите обезщетение.", CITATIONS);
  assertEquals(r.ok, true);
});

Deno.test("измислен общ режим се отхвърля", () => {
  const r = validateGroundedReply("Приложимо е [приложим общ режим по ЗЗДН].", CITATIONS);
  assertEquals(r.ok, false);
  assert(r.reasons.includes("fabricated_general_regime_marker"));
});

Deno.test("цитат извън извлечения набор се отхвърля", () => {
  const r = validateGroundedReply("Вижте [ЗУТ, чл. 137].", CITATIONS);
  assertEquals(r.ok, false);
  assert(r.reasons.some((x) => x.startsWith("citation_not_retrieved")));
});

Deno.test("празен отговор се отхвърля", () => {
  assertEquals(validateGroundedReply("   ", CITATIONS).ok, false);
});

Deno.test("вътрешните маркери [S1] не се броят за правно твърдение", () => {
  assertEquals(validateGroundedReply("Текст [S1] с бележка.", CITATIONS).ok, true);
});
