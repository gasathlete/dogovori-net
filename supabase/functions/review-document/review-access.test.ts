import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveIgnorePersonalData, reviewAbusePolicy } from "./review-access.ts";

Deno.test("флаг от клиента сам по себе си не изключва проверката за лични данни", () => {
  assertEquals(
    resolveIgnorePersonalData({
      clientFlag: true,
      staffOverride: false,
      manifestDefersPersonal: false,
    }),
    false,
  );
});

Deno.test("проверен манифест или щабно изключение отлагат личните данни", () => {
  assertEquals(
    resolveIgnorePersonalData({
      clientFlag: false,
      staffOverride: false,
      manifestDefersPersonal: true,
    }),
    true,
  );
  assertEquals(
    resolveIgnorePersonalData({
      clientFlag: true,
      staffOverride: true,
      manifestDefersPersonal: false,
    }),
    true,
  );
});

Deno.test("ограничителят за натоварване се води по ОТОРИЗИРАН собственик", () => {
  assertEquals(reviewAbusePolicy({ ownerId: "u-1" }), {
    key: "review-document:owner:u-1",
    max: 20,
    windowSeconds: 3600,
  });
});

Deno.test("ограничителят никога не се води по отпечатък на съдържанието", () => {
  const p = reviewAbusePolicy({ ownerId: null });
  assertEquals(p.key, "review-document:owner:unbound");
  assertEquals(p.max, 20);
});
