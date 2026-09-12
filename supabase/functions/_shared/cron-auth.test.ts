import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authorizeCronRequest,
  isDedicatedCronCandidate,
  requireServiceRole,
} from "./cron-auth.ts";
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

const HEX = "a".repeat(64);

Deno.test("exact service token passes locally without any auth lookup", async () => {
  // Мрежата е забранена в този тест: успехът е чисто локален.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("no network allowed");
  };
  try {
    await withKey(KEY, async () => {
      assertEquals(await requireServiceRole(req(`Bearer ${KEY}`)), null);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("exact service token never reaches the dedicated verifier", async () => {
  let calls = 0;
  const res = await authorizeCronRequest(
    {
      serviceKey: KEY,
      verifyDedicated: () => {
        calls += 1;
        return Promise.resolve(true);
      },
    },
    KEY,
  );
  assertEquals(res, null);
  assertEquals(calls, 0);
});

Deno.test("correct dedicated candidate is authorized via the verifier", async () => {
  const seen: string[] = [];
  const res = await authorizeCronRequest(
    {
      serviceKey: KEY,
      verifyDedicated: (c) => {
        seen.push(c);
        return Promise.resolve(true);
      },
    },
    HEX,
  );
  assertEquals(res, null);
  assertEquals(seen, [HEX]);
});

Deno.test("dedicated candidate failures all fail closed with 403", async () => {
  const cases: Array<{ token: string; verify?: (c: string) => Promise<boolean> }> = [
    { token: HEX, verify: () => Promise.resolve(false) },
    { token: HEX, verify: () => Promise.reject(new Error("rpc down")) },
    { token: HEX },
    { token: HEX.toUpperCase() },
    { token: HEX.slice(0, 63) },
    { token: `${HEX}0` },
    { token: `${HEX.slice(0, 63)}z` },
    { token: "anon.jwt.token" },
  ];
  for (const c of cases) {
    const res = await authorizeCronRequest(
      { serviceKey: KEY, ...(c.verify ? { verifyDedicated: c.verify } : {}) },
      c.token,
    );
    assert(res, `token ${c.token.slice(0, 8)} must be denied`);
    assertEquals(res.status, 403);
    assertEquals(await res.json(), { error: "forbidden" });
  }
});

Deno.test("dedicated candidate format is exactly 64 lowercase hex", () => {
  assert(isDedicatedCronCandidate(HEX));
  assert(isDedicatedCronCandidate("0123456789abcdef".repeat(4)));
  assert(!isDedicatedCronCandidate(HEX.toUpperCase()));
  assert(!isDedicatedCronCandidate(HEX.slice(0, 63)));
  assert(!isDedicatedCronCandidate(`${HEX}a`));
  assert(!isDedicatedCronCandidate(""));
});

Deno.test("missing token is 401", async () => {
  await withKey(KEY, async () => {
    const res = await requireServiceRole(req());
    assert(res);
    assertEquals(res.status, 401);
    assertEquals(await res.json(), { error: "unauthorized" });
  });
});

Deno.test("wrong token is 403", async () => {
  await withKey(KEY, async () => {
    for (const token of [`Bearer ${KEY}x`, `Bearer ${KEY.slice(0, -1)}`, "Bearer anon"]) {
      const res = await requireServiceRole(req(token));
      assert(res);
      assertEquals(res.status, 403);
      assertEquals(await res.json(), { error: "forbidden" });
    }
  });
});

Deno.test("missing configured key fails closed with 403", async () => {
  await withKey(null, async () => {
    const res = await requireServiceRole(req(`Bearer ${KEY}`));
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
