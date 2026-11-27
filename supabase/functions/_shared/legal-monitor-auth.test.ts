import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorizeMonitorRequest, type MonitorAuthDeps } from "./legal-monitor-auth.ts";

const KEY = "service-role-key-abcdef";

function deps(overrides: Partial<MonitorAuthDeps> = {}): MonitorAuthDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    serviceKey: KEY,
    getUser: (t) => {
      calls.push(`getUser:${t}`);
      return Promise.resolve({ userId: "user-1" });
    },
    isStaff: (id) => {
      calls.push(`isStaff:${id}`);
      return Promise.resolve({ staff: true });
    },
    ...overrides,
  };
}

Deno.test("exact service key is accepted without any auth lookup", async () => {
  const d = deps();
  const res = await authorizeMonitorRequest(d, KEY);
  assertEquals(res, { ok: true, isServiceRole: true, actorId: null });
  assertEquals(d.calls, []);
});

Deno.test("unsigned role claim is never trusted", async () => {
  const forged = `header.${btoa(JSON.stringify({ role: "service_role" }))}.sig`;
  const d = deps({ getUser: () => Promise.resolve({ userId: null }) });
  const res = await authorizeMonitorRequest(d, forged);
  assertEquals(res, { ok: false, status: 401, error: "unauthorized" });
});

Deno.test("missing token fails closed", async () => {
  assertEquals(await authorizeMonitorRequest(deps(), ""), {
    ok: false,
    status: 401,
    error: "unauthorized",
  });
});

Deno.test("near-miss service key falls back to user auth", async () => {
  const d = deps();
  const res = await authorizeMonitorRequest(d, `${KEY}x`);
  assert(res.ok && res.isServiceRole === false && res.actorId === "user-1");
  assertEquals(d.calls, [`getUser:${KEY}x`, "isStaff:user-1"]);
});

Deno.test("staff user is accepted, non-staff is forbidden", async () => {
  const ok = await authorizeMonitorRequest(deps(), "user-token");
  assertEquals(ok, { ok: true, isServiceRole: false, actorId: "user-1" });

  const nonStaff = await authorizeMonitorRequest(
    deps({ isStaff: () => Promise.resolve({ staff: false }) }),
    "user-token",
  );
  assertEquals(nonStaff, { ok: false, status: 403, error: "forbidden" });
});

Deno.test("auth and rpc errors fail closed", async () => {
  assertEquals(
    await authorizeMonitorRequest(deps({ getUser: () => Promise.resolve({ userId: null, error: { message: "bad" } }) }), "t"),
    { ok: false, status: 401, error: "unauthorized" },
  );
  assertEquals(
    await authorizeMonitorRequest(deps({ getUser: () => Promise.reject(new Error("net")) }), "t"),
    { ok: false, status: 401, error: "unauthorized" },
  );
  assertEquals(
    await authorizeMonitorRequest(deps({ isStaff: () => Promise.resolve({ staff: false, error: { message: "rpc" } }) }), "t"),
    { ok: false, status: 403, error: "forbidden" },
  );
  assertEquals(
    await authorizeMonitorRequest(deps({ isStaff: () => Promise.reject(new Error("rpc")) }), "t"),
    { ok: false, status: 403, error: "forbidden" },
  );
});

Deno.test("missing configured service key never grants service role", async () => {
  const d = deps({ serviceKey: "" });
  const res = await authorizeMonitorRequest(d, KEY);
  assert(res.ok === false || res.isServiceRole === false);
});

const HEX = "b".repeat(64);

Deno.test("dedicated cron candidate is accepted with service semantics and no user auth", async () => {
  const seen: string[] = [];
  const d = deps({
    verifyDedicated: (c) => {
      seen.push(c);
      return Promise.resolve(true);
    },
  });
  const res = await authorizeMonitorRequest(d, HEX);
  assertEquals(res, { ok: true, isServiceRole: true, actorId: null });
  assertEquals(seen, [HEX]);
  assertEquals(d.calls, []);
});

Deno.test("wrong or unverifiable dedicated candidate is 403 and never falls through", async () => {
  for (const verify of [
    () => Promise.resolve(false),
    () => Promise.reject(new Error("verifier down")),
    undefined,
  ]) {
    const d = deps(verify ? { verifyDedicated: verify } : {});
    const res = await authorizeMonitorRequest(d, HEX);
    assertEquals(res, { ok: false, status: 403, error: "forbidden" });
    assertEquals(d.calls, []);
  }
});

Deno.test("monitor source uses the shared guard and no claim decoding", async () => {
  const src = await Deno.readTextFile("supabase/functions/legal-source-monitor/index.ts");
  assert(src.includes("authorizeMonitorRequest"));
  assert(!src.includes("getClaims"));
  // dry_run на sync_registry остава без запис.
  const sync = src.slice(src.indexOf('action === "sync_registry"'), src.indexOf('action === "health"'));
  const dryBlock = sync.slice(sync.indexOf("if (dryRun)"), sync.indexOf("const { error }"));
  assert(!dryBlock.includes("upsert") && !dryBlock.includes("insert") && !dryBlock.includes("update"));
});
