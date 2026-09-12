import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireServiceRole } from "./cron-auth.ts";
import { isExactServiceRoleToken, timingSafeEqualString } from "./service-token.ts";

const KEY = "service-role-key-abcdef";

function req(auth?: string): Request {
  return new Request("https://example.test/", {
    method: "POST",
    headers: auth ? { Authorization: auth } : {},
  });
}

function withKey<T>(value: string | null, fn: () => T): T {
  const prev = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (value === null) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", value);
  try {
    return fn();
  } finally {
    if (prev === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prev);
  }
}

Deno.test("exact service token passes locally without any auth lookup", () => {
  // Мрежата е забранена в този тест: успехът е чисто локален.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("no network allowed");
  };
  try {
    withKey(KEY, () => {
      assertEquals(requireServiceRole(req(`Bearer ${KEY}`)), null);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("missing token is 401", async () => {
  await withKey(KEY, async () => {
    const res = requireServiceRole(req());
    assert(res);
    assertEquals(res.status, 401);
    assertEquals(await res.json(), { error: "unauthorized" });
  });
});

Deno.test("wrong token is 403", async () => {
  await withKey(KEY, async () => {
    for (const token of [`Bearer ${KEY}x`, `Bearer ${KEY.slice(0, -1)}`, "Bearer anon"]) {
      const res = requireServiceRole(req(token));
      assert(res);
      assertEquals(res.status, 403);
      assertEquals(await res.json(), { error: "forbidden" });
    }
  });
});

Deno.test("missing configured key fails closed with 403", () => {
  withKey(null, () => {
    const res = requireServiceRole(req(`Bearer ${KEY}`));
    assert(res);
    assertEquals(res.status, 403);
  });
});

Deno.test("comparison is exact and length-safe", () => {
  assert(timingSafeEqualString(KEY, KEY));
  assert(!timingSafeEqualString(KEY, `${KEY} `));
  assert(!timingSafeEqualString(KEY, KEY.toUpperCase()));
  assert(!isExactServiceRoleToken("", KEY));
  assert(!isExactServiceRoleToken(KEY, ""));
  assert(!isExactServiceRoleToken(null, KEY));
});

const EXPECTED_IMPORTERS = [
  "ai-post-market-rollup",
  "expire-pro-notify",
  "notify-due-reminders",
  "notify-unfinished-docs",
  "retention-sweeper",
];

/** Динамична инвентаризация: кои функции реално импортират ../_shared/cron-auth.ts. */
async function discoverImporters(): Promise<string[]> {
  const found: string[] = [];
  for await (const entry of Deno.readDir("supabase/functions")) {
    if (!entry.isDirectory || entry.name.startsWith("_")) continue;
    const path = `supabase/functions/${entry.name}/index.ts`;
    let src: string;
    try {
      src = await Deno.readTextFile(path);
    } catch {
      continue;
    }
    if (/from\s+["']\.\.\/_shared\/cron-auth\.ts["']/.test(src)) found.push(entry.name);
  }
  return found.sort();
}

Deno.test("cron-auth importer inventory is exactly the reviewed set of five", async () => {
  assertEquals(await discoverImporters(), EXPECTED_IMPORTERS);
});

Deno.test("no legacy getClaims/getUser service-role path remains in cron auth or importers", async () => {
  const importers = await discoverImporters();
  const files = ["supabase/functions/_shared/cron-auth.ts", ...importers.map((n) =>
    `supabase/functions/${n}/index.ts`
  )];
  for (const path of files) {
    const src = await Deno.readTextFile(path);
    // Само реални извиквания; поясняващите коментари може да споменават имената.
    const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert(!code.includes("getClaims("), `${path} must not call getClaims`);
    assert(!code.includes("auth.getUser("), `${path} must not call auth.getUser`);
  }
  for (const name of importers) {
    const path = `supabase/functions/${name}/index.ts`;
    const src = await Deno.readTextFile(path);
    assert(src.includes("requireServiceRole"), `${path} must guard with requireServiceRole`);
  }
});
