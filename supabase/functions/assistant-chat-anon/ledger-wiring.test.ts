import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);
const bubble = await Deno.readTextFile(
  new URL("../../../src/components/DogovAIBubble.tsx", import.meta.url),
);

Deno.test("старият псевдо-резерв през брояча за натоварване е премахнат", () => {
  for (
    const forbidden of [
      "anon-entitlement",
      "reserveAnonOperation",
      "consumeAnonDelivered",
      "readAnonEntitlement",
      "releaseAnonOperation",
    ]
  ) {
    assertEquals(src.includes(forbidden), false, forbidden);
  }
});

Deno.test("правото минава през трайния леджър", () => {
  assertStringIncludes(src, "_shared/anon-delivery-ledger.ts");
  assertStringIncludes(src, "reserveAnonDelivery(");
  assertStringIncludes(src, "commitAnonDelivery(");
  assertStringIncludes(src, "cancelAnonDelivery(");
  assertStringIncludes(src, "anonRequestDigest(");
});

Deno.test("анти-абюз лимитът е ОТДЕЛЕН и fail-closed", () => {
  assertStringIncludes(src, "checkRateLimitStrict(");
  assertStringIncludes(src, "anon-chat-abuse:");
  // Старият пропускащ catch около ограничителя не съществува.
  assertEquals(src.includes("checkRateLimit(`anon-chat:"), false);
});

Deno.test("UUID на заявката е задължителен преди резервация", () => {
  const idx = src.indexOf("request_id_required");
  const reserve = src.indexOf("reserveAnonDelivery(");
  assertEquals(idx > 0 && idx < reserve, true);
});

Deno.test("резервацията и потвърждаването са преди и след доставката", () => {
  const reserve = src.indexOf("reserveAnonDelivery(");
  const model = src.indexOf("MODEL");
  const commit = src.indexOf("commitAnonDelivery(");
  assertEquals(reserve < commit, true);
  assertEquals(model > 0, true);
  // Потвърждаването е последната стъпка преди отговора към клиента.
  // Потвърждаването е преди връщането на точния отговор към клиента.
  assertEquals(commit < src.lastIndexOf("JSON.stringify(committed.response)"), true);
});

Deno.test("точното повторение връща запазения отговор без нов модел", () => {
  assertStringIncludes(src, 'res.kind === "replay"');
  assertStringIncludes(src, "json(res.response");
});

Deno.test("балонът пази ключа само за същия обхват на заявката", () => {
  assertStringIncludes(bubble, "pendingScopeRef");
  assertStringIncludes(bubble, "pendingScopeRef.current = scope");
  assertStringIncludes(bubble, "pendingScopeRef.current = null");
  assertStringIncludes(bubble, "operation_in_progress");
  assertStringIncludes(bubble, "request_binding_conflict");
});
