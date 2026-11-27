import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

async function invoke(path: string, body: unknown, auth = "Bearer arbitrary") {
  let handler: ((r: Request) => Promise<Response>) | undefined;
  const original = Deno.serve;
  Deno.serve = ((fn: typeof handler) => { handler = fn; return {} as ReturnType<typeof Deno.serve>; }) as typeof Deno.serve;
  try {
    await import(path + "?security=" + crypto.randomUUID());
    if (!handler) throw new Error("handler missing");
    return await handler(new Request("https://internal.test", { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  } finally { Deno.serve = original; }
}

Deno.test("unverified bearer plus tick never reaches privileged QA writes", async () => {
  Deno.env.set("SUPABASE_URL", "https://example.invalid");
  Deno.env.set("SUPABASE_ANON_KEY", "synthetic-test-key");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "invalid_token" }), { status: 401, headers: { "Content-Type": "application/json" } });
  try {
    const response = await invoke("../qa-bot-runner/index.ts", { trigger: "tick" });
    assertEquals(response.status, 401);
  } finally { globalThis.fetch = original; }
});
Deno.test("billing destinations preserve app navigation and reject external redirects", async () => {
  const { requireAppReturnUrl } = await import("./return-destination.ts");
  for (const origin of ["https://dogovori.net", "https://www.dogovori.net", "https://dogovori-net.lovable.app", "http://localhost:8080"]) {
    const url = `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
    assertEquals(requireAppReturnUrl(url), url);
  }
  for (const value of ["https://evil.test/r", "https://dogovori.net.evil.test/r", "https://evil@dogovori.net/r", "javascript:alert(1)", "//dogovori.net/r", "https://dogovori.net:444/r"]) {
    let denied = false;
    try { requireAppReturnUrl(value); } catch { denied = true; }
    assertEquals(denied, true);
  }
});
