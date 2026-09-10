import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");
const REVIEW_ARTIFACT = join(
  process.cwd(),
  "docs/migrations/stage2a_product_checkout_entitlements.sql",
);

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
    expect(patch.trimStart().startsWith("--") || patch.includes("BEGIN;")).toBe(true);
    expect(patch).toContain("BEGIN;");
    expect(patch.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(patch).not.toMatch(/DROP TABLE|TRUNCATE|DROP COLUMN|DELETE FROM|INSERT INTO|UPDATE public\./i);
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

