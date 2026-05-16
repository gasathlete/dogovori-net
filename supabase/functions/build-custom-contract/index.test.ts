// Integration tests for build-custom-contract auth handling.
// Verifies the function returns 401 + { code: "auth_required" } for:
//   - missing Authorization header
//   - malformed Bearer token
//   - expired/invalid ES256 token
//   - expired/invalid legacy HS256 token
// and includes diagnostic `diag` (kid/alg/reason) so we can debug 401s in prod.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/build-custom-contract`;

function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Build a syntactically-valid but unverifiable JWT — Supabase will reject it
// during getClaims/getUser, which is exactly what we want to exercise.
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

Deno.test("401 + auth_required when Authorization header missing", async () => {
  const res = await call();
  const body = await res.json();
  assertEquals(res.status, 401);
  assertEquals(body.code, "auth_required");
  assertEquals(body.requires_login, true);
  assert(typeof body.error === "string" && body.error.length > 0);
  assertEquals(body.diag?.reason, "missing_bearer");
});

Deno.test("401 + auth_required when Bearer token is malformed", async () => {
  const res = await call("Bearer not-a-jwt");
  const body = await res.json();
  assertEquals(res.status, 401);
  assertEquals(body.code, "auth_required");
  // header decode fails for a non-JWT string
  assert(body.diag);
});

Deno.test("401 + auth_required for invalid ES256 token (diag includes kid/alg)", async () => {
  const token = fakeJwt(
    { alg: "ES256", typ: "JWT", kid: "test-kid-es256" },
    { sub: "00000000-0000-0000-0000-000000000000", exp: Math.floor(Date.now() / 1000) + 3600 },
  );
  const res = await call(`Bearer ${token}`);
  const body = await res.json();
  assertEquals(res.status, 401);
  assertEquals(body.code, "auth_required");
  assertEquals(body.diag?.alg, "ES256");
  assertEquals(body.diag?.kid, "test-kid-es256");
  assert(typeof body.diag?.reason === "string");
});

Deno.test("401 + auth_required for invalid legacy HS256 token", async () => {
  const token = fakeJwt(
    { alg: "HS256", typ: "JWT" },
    { sub: "00000000-0000-0000-0000-000000000000", exp: Math.floor(Date.now() / 1000) + 3600 },
  );
  const res = await call(`Bearer ${token}`);
  const body = await res.json();
  assertEquals(res.status, 401);
  assertEquals(body.code, "auth_required");
  assertEquals(body.diag?.alg, "HS256");
  assert(typeof body.diag?.reason === "string");
});
