import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveIgnorePersonalData, reviewRatePolicy } from "./review-access.ts";

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

Deno.test("удостоверен потребител се ограничава по своя идентификатор", () => {
  const p = reviewRatePolicy({ userId: "u-1", manifestContentFingerprint: "fp" });
  assertEquals(p, { key: "review-document:user:u-1", max: 20, windowSeconds: 3600 });
});

Deno.test("без вход манифестът дава само еднократен пропуск за същото съдържание", () => {
  const p = reviewRatePolicy({ userId: null, manifestContentFingerprint: "fp-abc" });
  assertEquals(p.key, "review-document:content:fp-abc");
  assertEquals(p.max, 1);
  assertEquals(p.windowSeconds, 24 * 3600);
});

Deno.test("дължината на документа вече не е ключ за ограничението", () => {
  const a = reviewRatePolicy({ userId: null, manifestContentFingerprint: null });
  assertEquals(a.key, "review-document:content:unknown");
  assertEquals(a.max, 1);
});
