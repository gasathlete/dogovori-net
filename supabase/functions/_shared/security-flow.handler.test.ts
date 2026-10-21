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