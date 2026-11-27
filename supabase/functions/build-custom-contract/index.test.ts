// Интеграционни тестове за auth контракта на build-custom-contract.
//
// КОНТРАКТ (умишлена промяна): при невалиден или липсващ токен функцията връща
// 401 с { error, code: "auth_required", requires_login: true } и НЕ разкрива
// диагностика (kid/alg/reason) към клиента. Диагностиката остава само в
// сървърните логове, защото издава детайли за подписващите ключове.
// Затова тук се проверява именно ОТСЪСТВИЕТО на `diag` в тялото.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/build-custom-contract`;

function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Синтактично валиден, но непроверим JWT — Supabase го отхвърля. */
function fakeJwt(header: Record<string, unknown>, payload: Record<string, unknown>): string {
  return `${b64url(header)}.${b64url(payload)}.AAAA`;
}

async function call(authHeader?: string) {
  return await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({ name: "Test", category: "IT" }),
  });
}

async function assertAuthRequired(res: Response) {
  const body = await res.json();
  assertEquals(res.status, 401);
  assertEquals(body.code, "auth_required");
  assertEquals(body.requires_login, true);
  assert(typeof body.error === "string" && body.error.length > 0);
  // Никаква диагностика за ключовете не изтича към клиента.
  assertEquals(body.diag, undefined);
  assertEquals(/kid|ES256|HS256|getClaims|getUser/.test(JSON.stringify(body)), false);
}

Deno.test("401 + auth_required при липсващ Authorization хедър", async () => {
  await assertAuthRequired(await call());
});

Deno.test("401 + auth_required при неправилно оформен Bearer токен", async () => {
  await assertAuthRequired(await call("Bearer not-a-jwt"));
});

Deno.test("401 + auth_required при невалиден ES256 токен, без изтичане на kid/alg", async () => {
  const token = fakeJwt(
    { alg: "ES256", typ: "JWT", kid: "test-kid-es256" },
    { sub: "00000000-0000-0000-0000-000000000000", exp: Math.floor(Date.now() / 1000) + 3600 },
  );
  await assertAuthRequired(await call(`Bearer ${token}`));
});

Deno.test("401 + auth_required при невалиден legacy HS256 токен", async () => {
  const token = fakeJwt(
    { alg: "HS256", typ: "JWT" },
    { sub: "00000000-0000-0000-0000-000000000000", exp: Math.floor(Date.now() / 1000) + 3600 },
  );
  await assertAuthRequired(await call(`Bearer ${token}`));
});
