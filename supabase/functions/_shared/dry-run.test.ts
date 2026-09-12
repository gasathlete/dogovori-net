import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dryRunResponse, isDryRunRequest } from "./dry-run.ts";

function post(body?: string): Request {
  return new Request("https://example.test/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body }),
  });
}

Deno.test("only exact boolean true activates dry-run", async () => {
  assertEquals(await isDryRunRequest(post(JSON.stringify({ dry_run: true }))), true);
  for (const body of [
    JSON.stringify({ dry_run: false }),
    JSON.stringify({ dry_run: "true" }),
    JSON.stringify({ dry_run: 1 }),
    JSON.stringify({ dry_run: null }),
    JSON.stringify({}),
    JSON.stringify([{ dry_run: true }]),
    JSON.stringify("dry_run"),
    "{not json",
    "",
  ]) {
    assertEquals(await isDryRunRequest(post(body)), false, `body: ${body}`);
  }
  assertEquals(await isDryRunRequest(post()), false);
});

Deno.test("parsing a clone leaves the original body readable", async () => {
  const req = post(JSON.stringify({ dry_run: false, days: 30 }));
  assertEquals(await isDryRunRequest(req), false);
  assertEquals(await req.json(), { dry_run: false, days: 30 });
});

Deno.test("dry-run response is a bare no-op payload", async () => {
  const res = dryRunResponse("retention-sweeper", { "Access-Control-Allow-Origin": "*" });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  const text = await res.text();
  assertEquals(JSON.parse(text), {
    ok: true,
    dry_run: true,
    side_effects: false,
    function: "retention-sweeper",
  });
  assertEquals(Object.keys(JSON.parse(text)).sort(), ["dry_run", "function", "ok", "side_effects"]);
  // Никакви данни: без идентификатори, имейли, имена, документи или броячи.
  for (const forbidden of ["@", "id", "email", "name", "count", "user", "title", "document"]) {
    assert(!text.toLowerCase().includes(forbidden), `payload must not contain "${forbidden}"`);
  }
});

const EXPECTED_DRY_RUN_FUNCTIONS = [
  "ai-post-market-rollup",
  "expire-pro-notify",
  "notify-due-reminders",
  "notify-unfinished-docs",
  "retention-sweeper",
];

async function cronImporters(): Promise<string[]> {
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

Deno.test("all five cron consumers gate dry-run after auth and before any side effect", async () => {
  const importers = await cronImporters();
  assertEquals(importers, EXPECTED_DRY_RUN_FUNCTIONS);

  const sideEffects = [
    "createClient(",
    ".from(",
    ".storage",
    "auth.admin",
    "sendAppEmail(",
    "fetch(",
    ".insert(",
    ".upsert(",
    ".update(",
    ".delete(",
  ];

  for (const name of importers) {
    const path = `supabase/functions/${name}/index.ts`;
    const src = await Deno.readTextFile(path);
    const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

    const auth = code.indexOf("requireServiceRole(req)");
    const dry = code.indexOf("isDryRunRequest(req)");
    const respond = code.indexOf(`dryRunResponse("${name}"`);
    assert(auth >= 0, `${path} must guard with requireServiceRole(req)`);
    assert(dry > auth, `${path} must check dry-run only after auth`);
    assert(respond >= dry, `${path} must return the exact-named dry-run response`);

    for (const marker of sideEffects) {
      const at = code.indexOf(marker);
      if (at < 0) continue;
      assert(at > respond, `${path}: "${marker}" must come after the dry-run return`);
    }
  }
});
