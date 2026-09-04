// Тестове за токените на анонимните чернови.
// Ключовото свойство: токенът никога не се пази в чист вид, а сравнението не
// приема нищо друго освен точния хеш.
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  generateClaimToken,
  hashToken,
  isSafeRoute,
  isValidClaimToken,
  isValidDraftId,
  isValidFlow,
  payloadTooLarge,
  timingSafeEqual,
} from "./draft-token.ts";

Deno.test("токенът е достатъчно дълъг, URL-безопасен и уникален", () => {
  const a = generateClaimToken();
  const b = generateClaimToken();
  assert(a.length >= 40, `дължина: ${a.length}`);
  assert(/^[A-Za-z0-9_-]+$/.test(a));
  assert(a !== b);
  assert(isValidClaimToken(a));
});

Deno.test("хешът е стабилен, различен от токена и с фиксирана дължина", async () => {
  const token = generateClaimToken();
  const h1 = await hashToken(token);
  const h2 = await hashToken(token);
  assertEquals(h1, h2);
  assertEquals(h1.length, 64);
  assert(h1 !== token);
  assert((await hashToken(token + "x")) !== h1);
});

Deno.test("сравнението приема само идентичния хеш", async () => {
  const h = await hashToken("token-abc");
  assert(timingSafeEqual(h, await hashToken("token-abc")));
  assertFalse(timingSafeEqual(h, await hashToken("token-abd")));
  assertFalse(timingSafeEqual(h, h.slice(0, 63)));
  assertFalse(timingSafeEqual("", h));
});

Deno.test("валидация на входните данни", () => {
  assert(isValidDraftId("11111111-1111-4111-8111-111111111111"));
  assertFalse(isValidDraftId("not-a-uuid"));
  assertFalse(isValidDraftId(123));

  assertFalse(isValidClaimToken("short"));
  assertFalse(isValidClaimToken("има кирилица тук........."));
  assertFalse(isValidClaimToken(null));

  assert(isValidFlow("wizard"));
  assert(isValidFlow("build"));
  assertFalse(isValidFlow("admin"));

  assert(isSafeRoute("/wizard/it?doc=nda"));
  assertFalse(isSafeRoute("//evil.com"));
  assertFalse(isSafeRoute("https://evil.com"));
  assertFalse(isSafeRoute("/" + "x".repeat(500)));
});

Deno.test("прекалено голямо съдържание се отказва", () => {
  assertFalse(payloadTooLarge({ answers: { a: "b" } }));
  assert(payloadTooLarge({ blob: "x".repeat(600 * 1024) }));
  // Циклична структура не може да се сериализира → отказваме.
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert(payloadTooLarge(cyclic));
});
