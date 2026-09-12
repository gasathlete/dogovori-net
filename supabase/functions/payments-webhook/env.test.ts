import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { invalidEnvResponse, parseWebhookEnv } from "./env.ts";

Deno.test("valid envs are preserved", () => {
  assertEquals(parseWebhookEnv("https://x.test/webhook?env=sandbox"), "sandbox");
  assertEquals(parseWebhookEnv("https://x.test/webhook?env=live"), "live");
});

Deno.test("missing or invalid env yields null", () => {
  for (const url of [
    "https://x.test/webhook",
    "https://x.test/webhook?env=",
    "https://x.test/webhook?env=Live",
    "https://x.test/webhook?env=live%20",
    "https://x.test/webhook?env=production",
    "https://x.test/webhook?environment=live",
    "not a url",
  ]) {
    assertEquals(parseWebhookEnv(url), null, url);
  }
});

Deno.test("invalid env answers a generic 400 JSON, never 2xx", async () => {
  const res = invalidEnvResponse();
  assertEquals(res.status, 400);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await res.json();
  assertEquals(body, { error: "invalid_request" });
});

Deno.test("index guards before provider, signature and database work", async () => {
  const src = await Deno.readTextFile("supabase/functions/payments-webhook/index.ts");
  const guardEnd = src.indexOf("return invalidEnvResponse();");
  assert(guardEnd > 0, "invalid env must short-circuit");
  const before = src.slice(src.indexOf("Deno.serve"), guardEnd);
  for (const forbidden of ["verifyWebhook(", "dispatchEvent(", "createStripe(", "getSupabase()"]) {
    assert(!before.includes(forbidden), `${forbidden} must not run before the env guard`);
  }
  // Никакъв 2xx на този път.
  assert(!src.includes('received: true, ignored'), "invalid env must not answer 2xx");
});
