import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");
const REVIEW_ARTIFACT = join(
  process.cwd(),
  "docs/migrations/stage2a_product_checkout_entitlements.sql",
);
const GENERATION_ARTIFACT_FILE = join(process.cwd(), "drizzle/migrations/0022_product_generation_artifacts.sql");
const GENERATION_ARTIFACT_REVIEW = join(process.cwd(), "docs/migrations/stage2b1b2_product_generation_artifacts.sql");
const GENERATION_CORRECTION_FILE = join(process.cwd(), "drizzle/migrations/0023_product_generation_artifacts_correction.sql");
const GENERATION_CORRECTION_REVIEW = join(process.cwd(), "docs/migrations/stage2b1b2_product_generation_artifacts_correction.sql");
const RUNTIME_SAFETY_FILE = join(process.cwd(), "drizzle/migrations/0024_product_generation_runtime_safety_correction.sql");
const RUNTIME_SAFETY_REVIEW = join(process.cwd(), "docs/migrations/stage2b1b2_product_generation_runtime_safety_correction.sql");

function migrationFile(): string {
  const name = readdirSync(MIGRATIONS_DIR).find((f) =>
    f.includes("product_checkout_entitlements")
  );
  expect(name, "Stage 2A миграцията липсва в supabase/migrations").toBeTruthy();
  return readFileSync(join(MIGRATIONS_DIR, name as string), "utf8");
}

describe("Stage 2A миграция — платежна истина", () => {
  const sql = migrationFile();

  it("е идентична с файла за преглед", () => {
    expect(sql).toBe(readFileSync(REVIEW_ARTIFACT, "utf8"));
  });

  it("премахва опасната клиентска INSERT политика върху order_snapshots", () => {
    expect(sql).toContain(
      "DROP POLICY IF EXISTS order_snapshots_user_insert ON public.order_snapshots",
    );
  });

  it("не създава втора базова миграция за същата поправка", () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.includes("product_checkout_entitlements")
    );
    expect(names.length).toBe(1);
  });


  it("старата INSERT политика остава премахната", () => {
    expect(sql).toContain(
      "DROP POLICY IF EXISTS order_snapshots_user_insert ON public.order_snapshots",
    );
  });

  it("не дава на браузъра запис върху новите таблици", () => {
    for (const table of ["product_checkout_intakes", "product_entitlements"]) {
      expect(sql).toContain(`GRANT SELECT ON public.${table} TO authenticated;`);
      expect(sql).toContain(`GRANT ALL ON public.${table} TO service_role;`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).not.toMatch(
        new RegExp(`CREATE POLICY[^;]*ON public\\.${table} FOR (INSERT|UPDATE|DELETE)`),
      );
    }
  });

  it("ограничава продуктите до трите канонични", () => {
    const canonical = "'contract_check', 'contract_improve', 'negotiation_package'";
    expect(sql).toContain(`CHECK (product_id IN (${canonical}))`);
  });

  it("разширява purchase_kind с product без да губи старите видове", () => {
    for (const kind of ["'product'", "'subscription'", "'topup'", "'strict_unlock'", "'branding'"]) {
      expect(sql).toContain(kind);
    }
  });

  it("дава EXECUTE само на service_role за платежните функции", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC");
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    for (const fn of [
      "record_product_purchase",
      "begin_product_fulfillment",
      "complete_product_fulfillment",
      "fail_product_fulfillment",
      "claim_product_refinement",
      "complete_product_refinement",
      "fail_product_refinement",
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    }
  });

  it("всяка SECURITY DEFINER функция ползва празен search_path", () => {
    const definers = sql.match(/SECURITY DEFINER SET search_path = '[^']*'/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(7);
    // Нито един ред не разчита на public в search_path.
    expect(sql).not.toMatch(/SECURITY DEFINER SET search_path = public/);
    for (const d of definers) expect(d).toBe("SECURITY DEFINER SET search_path = ''");
  });

  it("покупката и доказателството за поръчка се записват в една транзакция", () => {
    // Едно извикване прави и правото, и order snapshot-а — няма половин покупка.
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.record_product_purchase("));
    const body = fn.slice(0, fn.indexOf("END $$"));
    expect(body).toContain("FROM public.product_checkout_intakes");
    expect(body).toContain("FOR UPDATE");
    expect(body).toContain("INSERT INTO public.product_entitlements");
    expect(body).toContain("INSERT INTO public.order_snapshots");
    expect(body).toContain("product_entitlement_conflict");
    expect(body).toContain("product_snapshot_conflict");
    expect(body).toContain("product_source_changed");
    // Никакви кредити/операции от продуктова покупка.
    expect(body).not.toMatch(/credit_topup_ops|download_quota/);
  });

  it("изисква ЦЯЛ източник за платено право", () => {
    expect(sql).toContain("CHECK (source_extraction_status = 'full')");
    expect(sql).toContain("source_extraction_status = 'full'");
  });

  it("включва точно едно уточнение само за пълния пакет", () => {
    expect(sql).toContain(
      "AND stripe_price_lookup_key = 'negotiation_package_799' AND refinements_included = 1",
    );
    expect(sql).toContain(
      "AND stripe_price_lookup_key = 'contract_check_299' AND refinements_included = 0",
    );
    expect(sql).toContain(
      "AND stripe_price_lookup_key = 'contract_improve_399' AND refinements_included = 0",
    );
  });

  it("уточнението се отчита само след успешно завършване", () => {
    const claim = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.claim_product_refinement("));
    const claimBody = claim.slice(0, claim.indexOf("END $$"));
    // Заявяването НЕ увеличава използваните уточнения.
    expect(claimBody).not.toMatch(/refinements_used\s*=\s*refinements_used\s*\+\s*1/);
    const complete = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.complete_product_refinement("),
    );
    expect(complete.slice(0, complete.indexOf("END $$"))).toMatch(
      /refinements_used\s*=\s*refinements_used\s*\+\s*1/,
    );
    const failed = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.fail_product_refinement("));
    const failedBody = failed.slice(0, failed.indexOf("END $$"));
    // Неуспехът не изразходва уточнение и запазва готовия резултат.
    expect(failedBody).not.toMatch(/refinements_used\s*=\s*refinements_used\s*\+\s*1/);
    expect(failedBody).not.toMatch(/status\s*=\s*'failed'/);
  });

  it("не съдържа разрушителни операции", () => {
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DROP COLUMN|DELETE FROM/i);
  });

  // ---- Доказателство за плащане -------------------------------------------
  const purchaseFn = (() => {
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.record_product_purchase("));
    return fn.slice(0, fn.indexOf("END $$"));
  })();

  it("моментът на плащане и подписаното събитие са задължителни", () => {
    expect(purchaseFn).toContain("p_stripe_event_id text");
    expect(purchaseFn).toContain("product_paid_at_missing");
    expect(purchaseFn).toContain("product_event_missing");
    // Никакъв измислен час: без COALESCE(now()) и без now() като момент на плащане.
    expect(purchaseFn).not.toMatch(/COALESCE\(p_paid_at/);
    expect(purchaseFn).not.toMatch(/paid_at\s*=\s*now\(\)/);
    expect(sql).toContain(
      "'public.record_product_purchase(uuid,text,text,text,text,text,integer,text,uuid,timestamptz,integer,text)'",
    );
  });

  it("заключва и заявката, и реда на документа", () => {
    expect(purchaseFn).toContain("FROM public.product_checkout_intakes\n    WHERE id = p_intake_id FOR UPDATE");
    expect(purchaseFn).toContain("FROM public.uploaded_contracts");
    expect(purchaseFn).toMatch(/uploaded_contracts[\s\S]*FOR UPDATE/);
  });

  it("преизчислява SHA-256 върху съхранения текст или се проваля затворено", () => {
    expect(purchaseFn).toContain("extensions.digest(v_doc.extracted_text, 'sha256')");
    expect(purchaseFn).toContain("product_source_hash_unverifiable");
    expect(purchaseFn).toContain("product_source_hash_conflict");
  });

  it("сверява точното съответствие продукт → сума, ключ и уточнения", () => {
    for (const token of [
      "v_expected_amount := 299",
      "v_expected_amount := 399",
      "v_expected_amount := 799",
      "v_expected_refinements := 1",
      "product_commercial_conflict",
    ]) {
      expect(purchaseFn).toContain(token);
    }
  });

  it("позволява първо даване само от checkout_created и повторение само от paid", () => {
    expect(purchaseFn).toContain("v_intake.status NOT IN ('checkout_created', 'paid')");
    expect(purchaseFn).toContain("product_intake_state_conflict");
    expect(purchaseFn).toContain(
      "IF v_intake.status = 'paid' AND (v_ent.id IS NULL OR v_snapshot.id IS NULL) THEN",
    );
    expect(purchaseFn).toContain("product_replay_incomplete");
  });

  it("при заварено право сравнява всяко неизменно поле", () => {
    const block = purchaseFn.slice(
      purchaseFn.indexOf("IF v_ent.id IS NOT NULL THEN"),
      purchaseFn.indexOf("product_entitlement_conflict"),
    );
    for (const field of [
      "v_ent.user_id",
      "v_ent.product_id",
      "v_ent.environment",
      "v_ent.amount_cents",
      "v_ent.currency",
      "v_ent.stripe_price_id",
      "v_ent.stripe_price_lookup_key",
      "v_ent.refinements_included",
      "v_ent.intake_id",
      "v_ent.source_document_id",
      "v_ent.source_hash",
      "v_ent.source_updated_at",
      "v_ent.source_char_count",
      "v_ent.source_extraction_status",
      "v_ent.paid_at",
      "v_ent.stripe_event_id",
    ]) {
      expect(block, field).toContain(field);
    }
  });

  it("при заварен order snapshot сравнява всяко неизменно продуктово поле", () => {
    const block = purchaseFn.slice(
      purchaseFn.indexOf("IF v_snapshot.id IS NOT NULL THEN"),
      purchaseFn.indexOf("product_snapshot_conflict"),
    );
    for (const field of [
      "v_snapshot.user_id",
      "v_snapshot.purchase_kind",
      "v_snapshot.product_id",
      "v_snapshot.price_amount",
      "v_snapshot.currency",
      "v_snapshot.environment",
      "v_snapshot.payment_status",
      "v_snapshot.stripe_price_id",
      "v_snapshot.stripe_price_lookup_key",
      "v_snapshot.stripe_event_id",
      "v_snapshot.paid_at",
      "v_snapshot.product_intake_id",
      "v_snapshot.product_source_document_id",
      "v_snapshot.product_source_hash",
      "v_snapshot.product_source_updated_at",
      "v_snapshot.product_source_char_count",
      "v_snapshot.product_source_extraction_status",
      "v_snapshot.terms_accepted",
      "v_snapshot.ai_ack_accepted",
      "v_snapshot.immediate_performance_consent",
      "v_snapshot.withdrawal_loss_acknowledged",
      "v_snapshot.consent_recorded_at",
      "v_snapshot.terms_version",
      "v_snapshot.privacy_version",
      "v_snapshot.refund_version",
      "v_snapshot.withdrawal_version",
      "v_snapshot.ai_notice_version",
      "v_snapshot.vat_included",
      "v_snapshot.tax_behavior",
    ]) {
      expect(block, field).toContain(field);
    }
  });

  it("продуктовият snapshot изисква цялото доказателство", () => {
    const ck = sql.slice(
      sql.indexOf("ADD CONSTRAINT order_snapshots_product_id_ck"),
      sql.indexOf("-- E) Атомарни функции"),
    );
    for (const token of [
      "product_source_updated_at IS NOT NULL",
      "product_source_char_count BETWEEN 80 AND 60000",
      "product_source_extraction_status = 'full'",
      "paid_at IS NOT NULL",
      "stripe_event_id IS NOT NULL",
      "vat_included IS TRUE",
      "tax_behavior = 'inclusive'",
      "ai_notice_version IS NOT NULL",
      "terms_version IS NOT NULL",
      "withdrawal_version IS NOT NULL",
      "refund_version IS NOT NULL",
      "consent_recorded_at IS NOT NULL",
    ]) {
      expect(ck, token).toContain(token);
    }
  });

  // ---- Данъчна истина ------------------------------------------------------
  it("не измисля ставка 20% от tax_behavior", () => {
    expect(sql).toContain("ALTER TABLE public.order_snapshots ALTER COLUMN vat_rate DROP NOT NULL;");
    // Продуктовият запис оставя ставката празна и пише само доказаното поведение.
    expect(purchaseFn).toContain("vat_included, vat_rate, tax_behavior");
    expect(purchaseFn).toContain("'EUR', true, NULL, 'inclusive'");
    expect(purchaseFn).not.toMatch(/vat_rate\s*(=|,)\s*20\b/);
    expect(purchaseFn).not.toMatch(/true,\s*20\b/);
  });

  // ---- Чист основен статус -------------------------------------------------
  it("основният статус на резултата не носи остатъчни refinement стойности", () => {
    expect(sql).toContain(
      "CHECK (status IN ('paid', 'processing', 'ready', 'failed', 'refunded'))",
    );
    expect(sql).not.toContain("'refinement_ready'");
    expect(sql).not.toContain("'refinement_processing'");
    expect(sql).not.toContain("'exhausted'");
  });
  // ---- Половин състояние ---------------------------------------------------
  it("отказва половин състояние вместо да го лекува тихо", () => {
    expect(purchaseFn).toContain("IF (v_ent.id IS NULL) <> (v_snapshot.id IS NULL) THEN");
    expect(purchaseFn).toContain("product_half_state");
    expect(purchaseFn).toContain("IF v_intake.status = 'checkout_created'");
  });

  // ---- Точен вид на източника ---------------------------------------------
  it("пренася и сверява точния вид на файла и страниците", () => {
    expect(sql).toContain("ADD CONSTRAINT product_checkout_intakes_source_kind_ck");
    expect(sql).toContain("CHECK (source_kind IN ('pdf', 'docx'))");
    expect(sql).toContain(
      "ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS product_source_kind text;",
    );
    expect(purchaseFn).toContain("v_doc.product_source_kind IS DISTINCT FROM v_intake.source_kind");
    expect(purchaseFn).toContain("v_ent.source_kind IS DISTINCT FROM v_intake.source_kind");
    expect(purchaseFn).toContain(
      "v_snapshot.product_source_kind IS DISTINCT FROM v_intake.source_kind",
    );
    expect(purchaseFn).toContain(
      "v_snapshot.product_source_pages IS DISTINCT FROM v_intake.source_page_count",
    );
  });

  // ---- Една мерна единица за дължина --------------------------------------
  it("пази една канонична мерна единица за дължината на източника", () => {
    expect(sql).toContain("CHECK (source_char_unit = 'unicode_code_points')");
    expect(sql).toContain("AND product_source_char_unit = 'unicode_code_points'");
    expect(purchaseFn).toContain(
      "v_intake.source_char_unit IS DISTINCT FROM 'unicode_code_points'",
    );
    expect(purchaseFn).toContain("v_ent.source_char_unit IS DISTINCT FROM 'unicode_code_points'");
  });

  // ---- Пълно данъчно доказателство ----------------------------------------
  it("продуктовият snapshot няма ставка и сума на данъка без подпис", () => {
    const ck = sql.slice(
      sql.indexOf("ADD CONSTRAINT order_snapshots_product_id_ck"),
      sql.indexOf("-- E) Атомарни функции"),
    );
    expect(ck).toContain("AND vat_rate IS NULL");
    expect(ck).toContain("AND tax_amount_cents IS NULL");
    expect(purchaseFn).toContain("v_snapshot.vat_rate IS NOT NULL");
    expect(purchaseFn).toContain("v_snapshot.tax_amount_cents IS NOT NULL");
  });
});

// ---------------------------------------------------------------------------
// Коригиращата миграция: базовата остава защитена и НЕПРОМЕНЕНА, затова точната
// проверка по схема v2 живее в отделен, все още неприложен файл.
// ---------------------------------------------------------------------------
const PATCH_FILE = join(
  process.cwd(),
  "drizzle/migrations/0018_product_result_v2_binding_patch.sql",
);
const PATCH_REVIEW = join(
  process.cwd(),
  "docs/migrations/stage2a_product_result_v2_binding_patch.sql",
);
const ROLLOUT_NOTE = join(process.cwd(), "docs/migrations/STAGE2A_ROLLOUT_ORDER.md");

describe("Stage 2B1A коригираща миграция — обвързване по схема v2", () => {
  const patch = readFileSync(PATCH_FILE, "utf8");

  it("е идентична с файла за преглед", () => {
    expect(patch).toBe(readFileSync(PATCH_REVIEW, "utf8"));
  });

  it("прилага се атомарно и не пипа данни", () => {
    expect(patch).toContain("BEGIN;");
    expect(patch.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(patch).not.toMatch(/DROP TABLE|TRUNCATE|DROP COLUMN|DELETE FROM|INSERT INTO/i);
    // Единствените UPDATE редове са в телата на двете функции — миграцията сама
    // не попълва и не поправя нито един продуктов или клиентски ред.
    const updates = patch.match(/UPDATE public\.[a-z_]+/g) ?? [];
    expect(updates).toEqual([
      "UPDATE public.product_entitlements",
      "UPDATE public.product_entitlements",
    ]);
  });


  it("заменя ограничението и двете писащи резултат функции", () => {
    expect(patch).toContain(
      "DROP CONSTRAINT IF EXISTS product_entitlements_ready_ck",
    );
    expect(patch).toContain("ADD CONSTRAINT product_entitlements_ready_ck CHECK (");
    expect(patch).toContain("CREATE OR REPLACE FUNCTION public.complete_product_fulfillment(");
    expect(patch).toContain("CREATE OR REPLACE FUNCTION public.complete_product_refinement(");
    expect(patch.match(/SECURITY DEFINER SET search_path = ''/g)?.length).toBe(2);
  });

  it("не остава нито един стар плосък път на обвързването", () => {
    // Само изпълнимият SQL: обяснителните коментари цитират стария път нарочно.
    const code = patch
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(code).not.toContain("result ->> 'source_hash'");
    expect(code).not.toContain("p_result ->> 'source_hash'");
  });


  it("готов резултат изисква точно версия 2 и ЦЯЛОТО вложено обвързване", () => {
    for (const fragment of [
      "result_schema_version = 2",
      "result -> 'schema_version' = '2'::jsonb",
      "result ->> 'product_id' = product_id",
      "result -> 'source' ->> 'document_id' = source_document_id::text",
      "lower(result -> 'source' ->> 'source_hash') = lower(source_hash)",
      "result -> 'source' ->> 'source_kind' = source_kind",
      "result -> 'source' -> 'char_count' = to_jsonb(source_char_count)",
      "result -> 'source' ->> 'char_unit' = source_char_unit",
      "(result -> 'source' ->> 'source_updated_at')::timestamptz = source_updated_at",
      "result -> 'source' -> 'page_count' = 'null'::jsonb",
      "result -> 'source' -> 'page_count' = to_jsonb(source_page_count)",
    ]) {
      expect(patch, `липсва проверка: ${fragment}`).toContain(fragment);
    }
  });

  it("двете функции проверяват едно и също обвързване, не частично", () => {
    for (const fragment of [
      "AND p_result_schema_version = 2",
      "AND COALESCE(p_result_schema_version, result_schema_version) = 2",
      "AND p_result -> 'schema_version' = '2'::jsonb",
      "AND p_result -> 'source' ->> 'document_id' = source_document_id::text",
      "AND lower(p_result -> 'source' ->> 'source_hash') = lower(source_hash)",
      "AND p_result -> 'source' ->> 'source_kind' = source_kind",
      "AND p_result -> 'source' -> 'char_count' = to_jsonb(source_char_count)",
      "AND p_result -> 'source' ->> 'char_unit' = source_char_unit",
      "AND (p_result -> 'source' ->> 'source_updated_at')::timestamptz = source_updated_at",
    ]) {
      expect(patch, `липсва проверка: ${fragment}`).toContain(fragment);
    }
    expect(
      patch.match(/p_result -> 'source' -> 'page_count' = to_jsonb\(source_page_count\)/g)?.length,
    ).toBe(2);
    expect(patch.match(/p_result -> 'source' -> 'page_count' = 'null'::jsonb/g)?.length).toBe(2);
  });

  it("базовата миграция остава непроменена и все още носи стария път", () => {
    const base = readFileSync(
      join(MIGRATIONS_DIR, "20260910090000_product_checkout_entitlements.sql"),
      "utf8",
    );
    // Честно: поправката НЕ е в базовата миграция, а в коригиращата.
    expect(base).toContain("result ->> 'source_hash'");
    expect(base).toBe(readFileSync(REVIEW_ARTIFACT, "utf8"));
  });

  it("редът на прилагане е документиран: база първо, поправка веднага след нея", () => {
    const note = readFileSync(ROLLOUT_NOTE, "utf8");
    const base = note.indexOf("20260910090000_product_checkout_entitlements.sql");
    const fix = note.indexOf("0018_product_result_v2_binding_patch.sql");
    expect(base).toBeGreaterThan(-1);
    expect(fix).toBeGreaterThan(-1);
    expect(base).toBeLessThan(fix);
  });

  it("поправката не влиза в дневника на миграциите", () => {
    const journal = readFileSync(
      join(process.cwd(), "drizzle/migrations/meta/_journal.json"),
      "utf8",
    );
    expect(journal).not.toContain("0018_product_result_v2_binding_patch");
  });
});

// ---------------------------------------------------------------------------
// Stage 2B1B1 — задачи, наем, контролни точки. Пак само източник.
// ---------------------------------------------------------------------------
const JOBS_FILE = join(process.cwd(), "drizzle/migrations/0019_product_fulfillment_jobs.sql");
const JOBS_REVIEW = join(process.cwd(), "docs/migrations/stage2a_product_fulfillment_jobs.sql");

describe("Stage 2B1B1 миграция — състояние на платеното изпълнение", () => {
  const sql = readFileSync(JOBS_FILE, "utf8");

  it("е идентична с файла за преглед", () => {
    expect(sql).toBe(readFileSync(JOBS_REVIEW, "utf8"));
  });

  it("прилага се атомарно и не пипа данни", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DROP COLUMN|DELETE FROM|UPDATE public\.uploaded_contracts/i);
  });

  it("браузърът не пипа задачите и контролните точки", () => {
    for (const table of ["product_fulfillment_jobs", "product_fulfillment_checkpoints"]) {
      expect(sql).toContain(`REVOKE ALL ON public.${table} FROM authenticated;`);
      expect(sql).toContain(`GRANT ALL ON public.${table} TO service_role;`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
      expect(sql).not.toMatch(new RegExp(`GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]*public\\.${table} TO authenticated`));
    }
    // Само безопасният статус е достъпен за влезлия потребител.
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.product_job_status(uuid) TO authenticated;");
    expect(sql).toContain("AND j.user_id = auth.uid()");
  });

  it("контролните точки са само за добавяне и неизменни", () => {
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.product_fulfillment_checkpoints");
    expect(sql).toContain("product_fulfillment_checkpoints is append-only");
    expect(sql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS product_fulfillment_checkpoints_step_uq",
    );
  });

  it("задачата е обвързана с ЦЕЛИЯ източник и с резултат v2", () => {
    for (const token of [
      "result_schema_version = 2",
      "source_hash ~ '^[0-9a-f]{64}$'",
      "source_kind IN ('pdf', 'docx')",
      "source_char_count BETWEEN 80 AND 60000",
      "source_char_unit = 'unicode_code_points'",
      "source_page_count IS NULL OR source_page_count > 0",
      "entitlement_id uuid NOT NULL UNIQUE",
    ]) {
      expect(sql, token).toContain(token);
    }
  });

  it("разходът не може да надхвърли изчислените граници", () => {
    expect(sql).toContain("usage_calls <= budget_max_calls");
    expect(sql).toContain("usage_input_tokens + usage_output_tokens <= budget_max_tokens");
    expect(sql).toContain("usage_cost_milli_cents <= budget_hard_cost_milli_cents");
  });

  it("заявяването е атомарно, с наем, половин състояние и точна политика", () => {
    const claim = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.claim_product_job("));
    const body = claim.slice(0, claim.indexOf("END $$"));
    expect(body).toContain("FROM public.product_entitlements\n   WHERE id = p_entitlement_id AND user_id = p_user_id\n     FOR UPDATE");
    expect(body).toContain("'half_state'");
    expect(body).toContain("'policy_changed'");
    expect(body).toContain("'source_changed'");
    expect(body).toContain("'lease_active'");
    expect(body).toContain("'attempts_exhausted'");
    expect(body).toContain("'already_completed'");
    // Върнатият етап е СЛЕД заявяването, не остарелият.
    expect(body).toContain("-- Връщаме състоянието СЛЕД заявяването");
    expect(body).not.toMatch(/'attempt', v_job\.attempt \+ 1/);
    // Никакви общи операции/квоти от платена задача.
    expect(body).not.toMatch(/download_quota|consume_quota|credit_topup_ops/);
  });

  it("контролната точка изисква валиден наем, цял курсор и само напредване", () => {
    const fn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.record_product_job_checkpoint("),
    );
    const body = fn.slice(0, fn.indexOf("END $$"));
    for (const token of [
      "'lease_invalid'",
      "'terminal'",
      "'cursor_invalid'",
      "'stage_inconsistent'",
      "'cursor_not_advancing'",
      "ON CONFLICT (job_id, cursor_key) DO NOTHING",
      "'already_recorded', true",
      "completed_at = CASE",
    ]) {
      expect(body, token).toContain(token);
    }
    // Курсорът вече не се „поправя наум“ с COALESCE.
    expect(body).not.toContain("COALESCE(p_next_cursor ->> 'stage', stage)");
    expect(body).not.toContain("COALESCE(p_next_cursor, cursor)");
  });

  it("всяка SECURITY DEFINER функция ползва празен search_path", () => {
    const definers = sql.match(/SECURITY DEFINER SET search_path = '[^']*'/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(5);
    for (const d of definers) expect(d).toBe("SECURITY DEFINER SET search_path = ''");
  });

  it("редът на прилагане е документиран след поправката", () => {
    const note = readFileSync(ROLLOUT_NOTE, "utf8");
    const fix = note.indexOf("0018_product_result_v2_binding_patch.sql");
    const jobs = note.indexOf("0019_product_fulfillment_jobs.sql");
    expect(jobs).toBeGreaterThan(-1);
    expect(fix).toBeLessThan(jobs);
    expect(note).toContain("docs/migrations/stage2a_product_fulfillment_jobs.sql");
  });

  it("задачите не влизат в дневника на миграциите", () => {
    const journal = readFileSync(
      join(process.cwd(), "drizzle/migrations/meta/_journal.json"),
      "utf8",
    );
    expect(journal).not.toContain("0019_product_fulfillment_jobs");
  });
});

// ---------------------------------------------------------------------------
// Stage 2B1B1 КОРЕКЦИЯ (0020) — 0019 е приета и защитена, затова се поправя с
// отделна ДОБАВЯЩА миграция. Пак само източник, нищо не е изпълнено.
// ---------------------------------------------------------------------------
const FIX_FILE = join(
  process.cwd(),
  "drizzle/migrations/0020_product_fulfillment_jobs_correction.sql",
);
const FIX_REVIEW = join(
  process.cwd(),
  "docs/migrations/stage2b1b1_product_fulfillment_jobs_correction.sql",
);
const POLICY_BINDING_FILE = join(
  process.cwd(),
  "drizzle/migrations/0021_product_policy_binding_patch.sql",
);
const POLICY_BINDING_REVIEW = join(
  process.cwd(),
  "docs/migrations/stage2b1b1_product_policy_binding_patch.sql",
);

describe("Stage 2B1B1 корекция 0020 — micro-USD, строг курсор и наем", () => {
  const sql = readFileSync(FIX_FILE, "utf8");

  it("е идентична с файла за преглед", () => {
    expect(sql).toBe(readFileSync(FIX_REVIEW, "utf8"));
  });

  it("приетата 0019 остава непокътната", () => {
    const jobs = readFileSync(JOBS_FILE, "utf8");
    expect(jobs).toBe(readFileSync(JOBS_REVIEW, "utf8"));
    // Старата единица си остава в 0019; корекцията идва от 0020.
    expect(jobs).toContain("usage_cost_milli_cents");
    expect(sql).toContain("RENAME COLUMN usage_cost_milli_cents TO usage_cost_micro_usd");
    expect(sql).toContain(
      "RENAME COLUMN budget_hard_cost_milli_cents TO budget_hard_cost_micro_usd",
    );
  });

  it("прилага се атомарно и не пипа нито един ред с данни", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DROP COLUMN|DELETE FROM/i);
    expect(sql).not.toMatch(/download_quota|consume_quota|credit_topup_ops/);
  });

  it("въвежда отделни граници и разход по контролна точка", () => {
    for (const token of [
      "ADD COLUMN IF NOT EXISTS budget_max_input_tokens bigint NOT NULL DEFAULT 0",
      "ADD COLUMN IF NOT EXISTS budget_max_output_tokens bigint NOT NULL DEFAULT 0",
      "ADD COLUMN IF NOT EXISTS usage_cost_micro_usd bigint NOT NULL DEFAULT 0",
      "usage_calls <= budget_max_calls",
      "usage_input_tokens <= budget_max_input_tokens",
      "usage_output_tokens <= budget_max_output_tokens",
      "usage_input_tokens + usage_output_tokens <= budget_max_tokens",
      "usage_cost_micro_usd <= budget_hard_cost_micro_usd",
    ]) {
      expect(sql, token).toContain(token);
    }
    expect(sql).not.toContain("milli_cents <=");
  });

  it("етапът НИКОГА не се разминава с курсора, а индексите са цели и неотрицателни", () => {
    expect(sql).toContain("cursor ->> 'stage' = stage");
    expect(sql).toContain("(cursor -> 'batch_index')::numeric >= 0");
    expect(sql).toContain("(cursor -> 'chunk_index')::numeric >= 0");
    expect(sql).toContain("(cursor -> 'batch_index')::numeric = trunc((cursor -> 'batch_index')::numeric)");
    // Постоянната грешка е крайна.
    expect(sql).toContain("error_class IS DISTINCT FROM 'permanent' OR stage = 'failed'");
  });

  it("ключът на стъпката се извежда от курсора, не от извикващия", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.product_job_cursor_key(p_cursor jsonb)");
    expect(sql).toContain("v_key := public.product_job_cursor_key(p_next_cursor);");
    expect(sql).toContain("cursor_key LIKE stage || ':%'");
    // Никакъв каскаден подпис с ключ/етап от извикващия не остава извикваем.
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.record_product_job_checkpoint(uuid,uuid,text,text,jsonb,integer,bigint,bigint,bigint,text,boolean);",
    );
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.claim_product_job(uuid,uuid,text,text,integer,bigint,bigint,integer);",
    );
  });

  it("преходите са продуктови и строго нарастващи", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.product_job_stage_sequence(p_product_id text)");
    expect(sql).toContain("'queued', 'awaiting_generation', 'passport', 'review', 'synthesis', 'completed'");
    expect(sql).toContain("v_stage_pos > v_current_pos + 1");
    expect(sql).toContain("'cursor_not_advancing'");
    expect(sql).toContain("'use_fail_product_job'");
    expect(sql).toContain("IF v_next_batch <> 0 OR v_next_chunk <> 0 THEN");
  });

  it("точното повторение не начислява втори път и не заклещва наема", () => {
    expect(sql).toContain("ON CONFLICT (job_id, cursor_key) DO NOTHING");
    expect(sql).toContain("'already_recorded', true");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.release_product_job_lease(");
    expect(sql).toContain("SET lease_token = NULL, lease_expires_at = NULL, updated_at = now()");
    expect(sql).toContain("WHEN v_release OR v_next_stage = 'completed'");
  });

  it("бюджетът се проверява ПРЕДИ записа, за да падне всичко заедно", () => {
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.record_product_job_checkpoint("));
    const body = fn.slice(0, fn.indexOf("END $$"));
    const budget = body.indexOf("'budget_exceeded'");
    const insert = body.indexOf("INSERT INTO public.product_fulfillment_checkpoints");
    expect(budget).toBeGreaterThan(-1);
    expect(budget).toBeLessThan(insert);
  });

  it("състоянието на правото остава съгласувано със задачата", () => {
    expect(sql).toContain("SET status = 'processing', updated_at = now()");
    expect(sql).toContain("SET status = 'failed', updated_at = now()");
    expect(sql).toContain("'failed_permanent'");
  });

  it("изменящите функции са само за службата, статусът — за собственика", () => {
    expect(sql).toContain(
      "'public.claim_product_job(uuid,uuid,text,integer,bigint,bigint,bigint,bigint,integer)'",
    );
    expect(sql).toContain(
      "'public.record_product_job_checkpoint(uuid,uuid,jsonb,integer,bigint,bigint,bigint,text,boolean)'",
    );
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.product_job_status(uuid) TO authenticated;");
  });

  it("всяка SECURITY DEFINER функция ползва празен search_path", () => {
    const definers = sql.match(/SECURITY DEFINER SET search_path = '[^']*'/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(4);
    for (const d of definers) expect(d).toBe("SECURITY DEFINER SET search_path = ''");
  });

  it("редът е база -> 0018 -> 0019 -> 0020 -> 0021 -> 0022 -> 0023 -> 0024", () => {
    const note = readFileSync(ROLLOUT_NOTE, "utf8");
    const base = note.indexOf("20260910090000_product_checkout_entitlements.sql");
    const fix = note.indexOf("0018_product_result_v2_binding_patch.sql");
    const jobs = note.indexOf("0019_product_fulfillment_jobs.sql");
    const corr = note.indexOf("0020_product_fulfillment_jobs_correction.sql");
    const binding = note.indexOf("0021_product_policy_binding_patch.sql");
    const generation = note.indexOf("0022_product_generation_artifacts.sql");
    const generationCorrection = note.indexOf("0023_product_generation_artifacts_correction.sql");
    expect(base).toBeGreaterThan(-1);
    expect(base).toBeLessThan(fix);
    expect(fix).toBeLessThan(jobs);
    expect(jobs).toBeLessThan(corr);
    expect(corr).toBeLessThan(binding);
    expect(binding).toBeLessThan(generation);
    expect(generation).toBeLessThan(generationCorrection);
    expect(note).toContain("0024_product_generation_runtime_safety_correction.sql");
  });

  it("корекцията не влиза в дневника на миграциите", () => {
    const journal = readFileSync(
      join(process.cwd(), "drizzle/migrations/meta/_journal.json"),
      "utf8",
    );
    expect(journal).not.toContain("0020_product_fulfillment_jobs_correction");
  });
});

describe("Stage 2B1B1 корекция 0021 — неизменна версия на платената политика", () => {
  const sql = readFileSync(POLICY_BINDING_FILE, "utf8");

  it("е идентична с файла за преглед и пази защитените 0019/0020", () => {
    expect(sql).toBe(readFileSync(POLICY_BINDING_REVIEW, "utf8"));
    expect(readFileSync(JOBS_FILE, "utf8")).toBe(readFileSync(JOBS_REVIEW, "utf8"));
    expect(readFileSync(FIX_FILE, "utf8")).toBe(readFileSync(FIX_REVIEW, "utf8"));
  });

  it("е атомарна, добавяща и няма backfill или изтриване", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).not.toMatch(/UPDATE public\.|INSERT INTO|DELETE FROM|DROP TABLE|DROP COLUMN|TRUNCATE/i);
    expect(sql).toContain("product_intake_policy_preapply_gate_failed");
    expect(sql).toContain("NOT VALID");
    expect(sql).toContain("VALIDATE CONSTRAINT product_checkout_intakes_generation_policy_ck");
  });

  it("INSERT взема точната intake версия и отказва липса, празнота и разминаване", () => {
    expect(sql).toContain("BEFORE INSERT OR UPDATE ON public.product_entitlements");
    expect(sql).toContain("SELECT * INTO v_intake");
    expect(sql).toContain("WHERE id = NEW.intake_id");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("product_entitlement_intake_missing");
    expect(sql).toContain("product_intake_policy_missing");
    expect(sql).toContain("product_entitlement_intake_binding_conflict");
    expect(sql).toContain("product_entitlement_policy_conflict");
    expect(sql).toContain("NEW.generation_policy_version := v_intake.generation_policy_version");
  });

  it("сверява потребител, продукт и цялото source binding", () => {
    for (const token of [
      "v_intake.user_id IS DISTINCT FROM NEW.user_id",
      "v_intake.product_id IS DISTINCT FROM NEW.product_id",
      "v_intake.uploaded_contract_id IS DISTINCT FROM NEW.source_document_id",
      "lower(v_intake.source_hash) IS DISTINCT FROM lower(NEW.source_hash)",
      "v_intake.source_updated_at IS DISTINCT FROM NEW.source_updated_at",
      "v_intake.source_char_count IS DISTINCT FROM NEW.source_char_count",
      "v_intake.source_char_unit IS DISTINCT FROM NEW.source_char_unit",
      "v_intake.source_kind IS DISTINCT FROM NEW.source_kind",
      "v_intake.source_page_count IS DISTINCT FROM NEW.source_page_count",
      "v_intake.source_extraction_status IS DISTINCT FROM NEW.source_extraction_status",
    ]) expect(sql).toContain(token);
  });

  it("UPDATE е неизменен, а легитимният replay със същата версия остава допустим", () => {
    expect(sql).toContain("IF TG_OP = 'UPDATE' THEN");
    expect(sql).toContain(
      "IF NEW.generation_policy_version IS DISTINCT FROM OLD.generation_policy_version THEN",
    );
    expect(sql).toContain("product_entitlement_policy_immutable");
    expect(sql).toContain("IF NEW.intake_id IS DISTINCT FROM OLD.intake_id THEN");
    expect(sql.indexOf("SELECT * INTO v_intake")).toBeGreaterThan(sql.indexOf("IF TG_OP = 'UPDATE' THEN"));
    expect(sql).toContain("RETURN NEW;");
  });

  it("функцията е с празен search_path и изпълнима само от service_role", () => {
    expect(sql).toContain("SECURITY DEFINER\nSET search_path = ''");
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(sql).toContain(
        `REVOKE ALL ON FUNCTION public.bind_product_entitlement_policy() FROM ${role};`,
      );
    }
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.bind_product_entitlement_policy() TO service_role;",
    );
  });

  it("не е записана в Drizzle journal и 0026 остава запазена", () => {
    const journal = readFileSync(
      join(process.cwd(), "drizzle/migrations/meta/_journal.json"),
      "utf8",
    );
    expect(journal).not.toContain("0021_product_policy_binding_patch");
    const note = readFileSync(ROLLOUT_NOTE, "utf8");
    expect(note).toContain("Номер `0026`");
  });
});

describe("Stage 2B1B2 миграция 0022 — трайно и точно възстановяване", () => {
  const sql = readFileSync(GENERATION_ARTIFACT_FILE, "utf8");

  it("има байтова идентичност с review копието и не редактира 0018–0021", () => {
    expect(sql).toBe(readFileSync(GENERATION_ARTIFACT_REVIEW, "utf8"));
    expect(sql).toContain("product_generation_artifacts_preapply_zero_row_gate_failed");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("добавя service-only артефакти и точни call-ID разписки", () => {
    for (const table of ["product_generation_calls", "product_generation_artifacts"]) {
      expect(sql).toContain(`CREATE TABLE public.${table}`);
      expect(sql).toContain(`GRANT ALL ON public.${table} TO service_role;`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
    }
    expect(sql).not.toMatch(/GRANT .* ON public\.product_generation_(calls|artifacts) TO (anon|authenticated)/);
    expect(sql).toContain("UNIQUE (job_id, call_id)");
    expect(sql).toContain("UNIQUE (job_id,cursor_key)");
  });

  it("проверява действителния digest и точната source/policy връзка", () => {
    expect(sql).toContain("extensions.digest(convert_to(redacted_artifact_canonical,'UTF8'),'sha256')");
    expect(sql).toContain("redacted_artifact_canonical::jsonb = redacted_artifact");
    expect(sql).toContain("extensions.digest(convert_to(payload_canonical,'UTF8'),'sha256')");
    expect(sql).toContain("payload_canonical::jsonb = payload");
    for (const field of ["source_document_id", "source_hash", "source_kind", "source_char_count", "source_char_unit", "source_updated_at", "generation_policy_version"]) {
      expect(sql).toContain(field);
    }
  });

  it("RPC договорът е lease/budget/replay безопасен и само за service_role", () => {
    for (const fn of ["reserve_product_generation_call", "complete_product_generation_call", "record_product_generation_artifact", "load_product_generation_state", "finish_product_generation"]) {
      expect(sql).toContain(`FUNCTION public.${fn}`);
    }
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("'lease_invalid'");
    expect(sql).toContain("'budget_exceeded'");
    expect(sql).toContain("'replay_mismatch'");
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
  });
});

describe("Stage 2B1B2 корекция 0023 — точен курсор и атомарен финал", () => {
  const sql = readFileSync(GENERATION_CORRECTION_FILE, "utf8");

  it("е byte-identical с review копието и запазва zero-row gate", () => {
    expect(sql).toBe(readFileSync(GENERATION_CORRECTION_REVIEW, "utf8"));
    expect(sql).toContain("product_generation_artifacts_correction_preapply_zero_row_gate_failed");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("разделя текущата идентичност от следващия курсор и сверява целия replay", () => {
    expect(sql).toContain("p_current_cursor_key text,p_artifact_stage text,p_next_cursor jsonb");
    expect(sql).toContain("public.product_job_cursor_key(j.cursor)<>p_current_cursor_key");
    expect(sql).toContain("public.product_job_cursor_advances(j.product_id,j.cursor,p_next_cursor)");
    for (const token of ["existing.stage", "existing.payload_digest", "existing.payload_canonical", "existing.call_ids", "existing.entitlement_id", "existing.source_hash", "existing.generation_policy_version", "existing.generation_timestamp", "'next_cursor',p_next_cursor"]) expect(sql).toContain(token);
  });

  it("завършва synthesis артефакта и ready резултата в една функция", () => {
    const fn = sql.slice(sql.indexOf("FUNCTION public.commit_product_generation_result("));
    expect(fn).toContain("INSERT INTO public.product_generation_artifacts");
    expect(fn).toContain("UPDATE public.product_entitlements SET status='ready'");
    expect(fn).toContain("UPDATE public.product_fulfillment_jobs SET usage_calls=");
    expect(fn).toContain("stage='completed'");
    expect(fn).toContain("(p_result->>'generated_at')::timestamptz IS DISTINCT FROM j.generation_timestamp");
  });

  it("не дублира резервирано извикване и поддържа object и array отговори", () => {
    expect(sql).toContain("'status','pending','reason','call_completion_unknown'");
    expect(sql).toContain("jsonb_typeof(p_redacted_artifact) NOT IN ('object','array')");
    expect(sql).toContain("redacted_artifact_canonical::jsonb<>p_redacted_artifact");
    expect(sql).toContain("pending_calls+1>j.budget_max_calls");
  });

  it("остава service-only с FORCE RLS", () => {
    expect(sql).toContain("REVOKE ALL ON public.product_generation_calls FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("REVOKE ALL ON public.product_generation_artifacts FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
  });
});

describe("Stage 2B1B2 корекция 0024 — runtime safety", () => {
  const sql = readFileSync(RUNTIME_SAFETY_FILE, "utf8");

  it("е byte-identical с review копието и запазва zero-row gate", () => {
    expect(sql).toBe(readFileSync(RUNTIME_SAFETY_REVIEW, "utf8"));
    expect(sql).toContain("product_generation_runtime_safety_preapply_zero_row_gate_failed");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("инициализира timestamp под lease lock и го пази неизменен", () => {
    expect(sql).toContain("WHERE id=p_job_id FOR UPDATE");
    expect(sql).toContain("IF j.generation_timestamp IS NULL THEN UPDATE");
    expect(sql).toContain("NEW.generation_timestamp IS DISTINCT FROM OLD.generation_timestamp");
  });

  it("записва истинския passport на текущия курсор и преминава към review", () => {
    expect(sql).toContain("p_current_cursor_key text,p_artifact_stage text,p_next_cursor jsonb");
    expect(sql).toContain("p_artifact_stage='passport' AND p_next_cursor->>'stage'='review'");
    expect(sql).toContain("p_generation_timestamp IS DISTINCT FROM j.generation_timestamp");
    expect(sql).toContain("public.product_job_cursor_advances");
  });

  it("е service-only и резервира 0026", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    expect(readFileSync(ROLLOUT_NOTE, "utf8")).toContain("Номер `0026`");
  });
});

