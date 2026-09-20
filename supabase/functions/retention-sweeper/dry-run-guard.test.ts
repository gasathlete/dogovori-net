/**
 * ИЗВОРЕН ПАЗИТЕЛ за `?count_only=1`.
 *
 * Доказва, че режимът се решава преди всяка мутация и че в него се изпълнява
 * САМО само-четящото преброяване. Плюс договора за грешки: навън не излизат
 * DB/storage съобщения, а провалът е 503 с ok:false.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

const MUTATIONS = [
  ".delete()",
  ".update(",
  "storage",
  "sweepExpiredRequestArtifacts",
  "reconcileStaleOperations",
  "sweep_expired_exact_responses",
  "sweep_expired_quota_results",
  "sweep_expired_quota_wave_results",
  "quota_wave_reconcile_stale",
];

Deno.test("режимът count_only се решава преди всяка мутация", () => {
  const modeIdx = src.indexOf("const countOnly = isCountOnly(req)");
  assert(modeIdx > 0, "режимът трябва да се чете явно");
  for (const marker of MUTATIONS) {
    const idx = src.indexOf(marker);
    if (idx < 0) continue;
    assert(idx > modeIdx, `мутацията ${marker} е преди решението за count_only`);
  }
});

Deno.test("count_only връща само преброяване и се връща преди мутиращите помощници", () => {
  const branch = src.indexOf("if (countOnly) {");
  const ret = src.indexOf("return respond();", branch);
  assert(branch > 0 && ret > branch, "липсва ранно връщане за count_only");
  const body = src.slice(branch, ret);
  assert(body.includes("retention_due_counts"), "count_only трябва да брои чрез read-only RPC");
  for (const marker of MUTATIONS) {
    assert(!body.includes(marker), `count_only клонът съдържа мутация: ${marker}`);
  }
  for (const marker of MUTATIONS) {
    const idx = src.indexOf(marker);
    if (idx < 0) continue;
    assert(idx > ret, `мутацията ${marker} не е след ранното връщане на count_only`);
  }
});

Deno.test("read-only RPC се вика без dry_run флаг и без лимит", () => {
  assert(
    src.includes('supabase.rpc("retention_due_counts")'),
    "преброяването трябва да е без параметри — не може да мутира",
  );
});

Deno.test("нормалният sweep пази трите слоя за товар и двата слоя за изравняване", () => {
  for (const rpc of [
    "sweep_expired_exact_responses",
    "sweep_expired_quota_results",
    "sweep_expired_quota_wave_results",
    "quota_wave_reconcile_stale",
  ]) {
    assert(src.includes(rpc), `нормалният sweep трябва да вика ${rpc}`);
  }
  assert(src.includes("reconcileStaleOperations"), "липсва изравняване на единичните операции");
});

Deno.test("никакво DB/storage съобщение не влиза в отговора", () => {
  for (const leak of [
    "Err.message",
    "err.message",
    "e.message",
    "sweep.errors.join",
    "stats.errors",
  ]) {
    assert(!src.includes(leak), `договорът за грешки изтича вътрешен текст: ${leak}`);
  }
  assert(src.includes("failed_stages"), "провалът трябва да се отчита със стабилни имена на етапи");
  assert(src.includes("correlation_id"), "отговорът трябва да носи correlation id");
});

Deno.test("провалът на който и да е етап дава ok:false и 503", () => {
  assert(src.includes('{ ok: false, error: "retention_incomplete"'), "липсва ok:false при провал");
  assert(src.includes("status: failedStages.length > 0 ? 503 : 200"), "провалът трябва да е 503");
});
