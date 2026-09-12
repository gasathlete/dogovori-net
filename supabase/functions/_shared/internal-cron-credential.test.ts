// Статични проверки за посветения вътрешен cron ключ:
//   * SQL миграцията не съдържа кредентиал и не изнася очакваната стойност;
//   * шестте функции с ръчна авторизация имат verify_jwt = false.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION = "docs/migrations/stage2b1e_internal_operational_cron_secret.sql";
const IDENTIFIER = "internal_operational_cron_secret_v1";

Deno.test("migration contains no credential material", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  // Никакъв 64-символен hex литерал (regex шаблоните са с квантификатор, не литерал).
  assert(!/[0-9a-f]{64}/.test(sql), "migration must not contain a 64-hex literal");
  assert(!/gen_random_bytes\(32\),\s*'hex'\)\s*(AS|INTO)/i.test(sql));
  // Стойността се генерира на сървъра, вътре в vault.create_secret.
  const create = sql.slice(sql.indexOf("vault.create_secret("));
  assert(create.includes("encode(extensions.gen_random_bytes(32), 'hex')"));
  assert(sql.includes(IDENTIFIER));
  // Очакваната стойност никога не се връща, не се логва и не се селектира навън.
  assert(!/RETURN\s+v_expected/i.test(sql));
  assert(!/RAISE[^\n]*v_expected/i.test(sql));
  assert(!/SELECT\s+decrypted_secret/i.test(sql));
  assert(!/RETURNS\s+text/i.test(sql));
});

Deno.test("verifier is hardened: fixed hash loop, privileges, safe search_path", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assert(sql.includes("CREATE OR REPLACE FUNCTION public.verify_internal_cron_secret(_candidate text)"));
  assert(sql.includes("RETURNS boolean"));
  assert(sql.includes("SECURITY DEFINER"));
  assert(sql.includes("STABLE"));
  assert(sql.includes("SET search_path = public, extensions, vault"));
  assert(sql.includes("'^[0-9a-f]{64}$'"));
  assert(sql.includes("extensions.digest(_candidate, 'sha256')"));
  assert(sql.includes("FOR i IN 0..31 LOOP"));
  assert(sql.includes("get_byte(v_cand_hash, i) # get_byte(v_exp_hash, i)"));
  for (const role of ["PUBLIC", "anon", "authenticated"]) {
    assert(
      sql.includes(`REVOKE ALL ON FUNCTION public.verify_internal_cron_secret(text) FROM ${role};`),
      `must revoke from ${role}`,
    );
  }
  assert(
    sql.includes("GRANT EXECUTE ON FUNCTION public.verify_internal_cron_secret(text) TO service_role;"),
  );
});

Deno.test("job rewiring is guarded, identifier-only and keeps the jobs paused", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  for (const pair of [
    ["7", "retention-sweeper-hourly"],
    ["8", "ai-post-market-rollup-daily"],
    ["9", "expire-pro-notify-daily"],
    ["10", "notify-due-reminders-daily"],
  ]) {
    assert(sql.includes(`'${pair[0]}', '${pair[1]}'`), `must guard job ${pair[0]}`);
  }
  assert(sql.includes("must stay paused before rewiring"));
  assert(sql.includes("mixed cron credential state"));
  assert(sql.includes("expected exactly 4 operational cron jobs"));
  assert(sql.includes("replace(r.command, v_old_id, v_new_id)"));
  assert(sql.includes("cron.alter_job(job_id := r.jobid, command := v_new_command, active := false)"));
  assert(sql.includes("post-rewire assertion failed"));
  // Никакво разпаузиране и никаква несвързана SQL.
  assert(!/active\s*:=\s*true/i.test(sql));
  for (const forbidden of ["DROP ", "TRUNCATE", "DELETE FROM", "cron.schedule(", "cron.unschedule("]) {
    assert(!sql.includes(forbidden), `migration must not contain ${forbidden}`);
  }
});

Deno.test("exactly the six manually authorized functions have verify_jwt = false", async () => {
  const toml = await Deno.readTextFile("supabase/config.toml");
  const expected = [
    "retention-sweeper",
    "ai-post-market-rollup",
    "expire-pro-notify",
    "notify-unfinished-docs",
    "notify-due-reminders",
    "legal-source-monitor",
  ];
  for (const name of expected) {
    const at = toml.indexOf(`[functions.${name}]`);
    assert(at > 0, `${name} must be configured`);
    const block = toml.slice(at, at + 200);
    const value = block.match(/verify_jwt\s*=\s*(true|false)/);
    assertEquals(value?.[1], "false", `${name} must have verify_jwt = false`);
  }
  // Нито една от шестте не остава с gateway проверка.
  assert(!/\[functions\.(retention-sweeper|ai-post-market-rollup|expire-pro-notify|notify-unfinished-docs|notify-due-reminders|legal-source-monitor)\]\s*\n\s*verify_jwt = true/.test(toml));
});
