import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const CHECKOUT = readFileSync("supabase/functions/create-product-checkout/index.ts", "utf8");
const FULFILL = readFileSync("supabase/functions/fulfill-product/index.ts", "utf8");
const JOBS = readFileSync("supabase/functions/_shared/product-jobs.ts", "utf8");
const POLICY = readFileSync("supabase/functions/_shared/product-generation-policy.ts", "utf8");

describe("Заявката се отказва ПРЕДИ плащане, ако документът не може да се обработи", () => {
  it("допустимостта се проверява преди ВСЯКО обръщение към Stripe", () => {
    const eligibility = CHECKOUT.indexOf("evaluateProductEligibility({");
    expect(eligibility).toBeGreaterThan(-1);
    // Не само създаването на сесия: клиентът, цените, четенето, изтичането и
    // клиентският запис също стоят СЛЕД проверката.
    const sites = [...CHECKOUT.matchAll(/\bstripe\.[a-zA-Z.]+\(|createStripeClient\(|resolveOrCreateCustomer\(/g)]
      .map((m) => m.index ?? -1)
      .filter((i) => i >= 0);
    expect(sites.length).toBeGreaterThanOrEqual(5);
    for (const site of sites) expect(site).toBeGreaterThan(eligibility);
  });

  it("контекстът минава общата строга проверка, а не местна", () => {
    expect(CHECKOUT).toContain("validateProductContext(body.context, spec.id)");
  });

  it("особено чувствителните данни се отказват от общата проверка преди Stripe", () => {
    const ELIGIBILITY = readFileSync("supabase/functions/_shared/product-eligibility.ts", "utf8");
    expect(ELIGIBILITY).toContain(
      'if (classification.contains_special_category_data) return reject("processing_not_allowed")',
    );
    expect(CHECKOUT.indexOf("evaluateProductEligibility({")).toBeLessThan(
      CHECKOUT.indexOf("createStripeClient(environment)"),
    );
  });

  it("преизползва сесия само при ТОЧНО съвпадение на версията на политиката", () => {
    expect(CHECKOUT).toContain(
      "existingIntake.generation_policy_version !== PRODUCT_GENERATION_POLICY_VERSION",
    );
    expect(CHECKOUT).not.toContain(
      "existingIntake.generation_policy_version ?? PRODUCT_GENERATION_POLICY_VERSION",
    );
    expect(CHECKOUT).toContain("generation_policy_version: PRODUCT_GENERATION_POLICY_VERSION");
  });

  it("платената заявка не пипа общи операции и квоти", () => {
    for (const src of [CHECKOUT, FULFILL]) {
      expect(src).not.toMatch(/consume_quota|download_quota|credit_topup_ops|ocr-contract/);
    }
  });
});

describe("Изпълнението е устойчиво и остава без активен live provider", () => {
  it("приема САМО entitlement_id и изисква влязъл потребител", () => {
    expect(FULFILL).toContain('ALLOWED_BODY_KEYS = Object.freeze(["entitlement_id"])');
    expect(FULFILL).toContain('if (!authHeader?.startsWith("Bearer "))');
    expect(FULFILL).toContain("ent.user_id !== userId");
  });

  it("изисква доказателство по двойки: право И продуктов order snapshot", () => {
    expect(FULFILL).toContain('.eq("purchase_kind", "product")');
    expect(FULFILL).toContain('snapshot.payment_status !== "paid"');
    expect(FULFILL).toContain("snapshot.stripe_event_id !== ent.stripe_event_id");
    expect(FULFILL).toContain('snapshot.product_source_extraction_status !== "full"');
  });

  it("сверява точната канонична цена, средата и продукта", () => {
    expect(FULFILL).toContain("ent.amount_cents !== spec.amountCents");
    expect(FULFILL).toContain("ent.stripe_price_lookup_key !== spec.lookupKey");
    expect(FULFILL).toContain('ent.environment !== "live" && ent.environment !== "sandbox"');
  });

  it("преизчислява източника от сървъра и отказва при промяна", () => {
    expect(FULFILL).toContain("verifyStoredProductSource(doc");
    expect(FULFILL).toContain('return fail("source_changed", 409, headers, cid)');
    expect(FULFILL).toContain("verified.pageCount !== (ent.source_page_count ?? null)");
  });

  it("и ДВЕТЕ копия на версията на политиката трябва да са налични и равни", () => {
    expect(FULFILL).toContain("const intakePolicy = intake.generation_policy_version;");
    expect(FULFILL).toContain("const entitlementPolicy = ent.generation_policy_version;");
    expect(FULFILL).toContain("intakePolicy !== entitlementPolicy");
    expect(FULFILL).toContain("intakePolicy !== PRODUCT_GENERATION_POLICY_VERSION");
    // Никакво „едно от двете“.
    expect(FULFILL).not.toMatch(/generation_policy_version\s*\?\?\s*/);
  });

  it("сверява съгласията и данъчното доказателство от order snapshot", () => {
    for (const token of [
      "snapshot.terms_accepted !== true",
      "snapshot.immediate_performance_consent !== true",
      "snapshot.withdrawal_loss_acknowledged !== true",
      "!snapshot.consent_recorded_at",
      'snapshot.tax_behavior !== "inclusive"',
      "snapshot.tax_amount_cents > spec.amountCents",
      "intake.ai_notice_version !== snapshot.ai_notice_version",
    ]) {
      expect(FULFILL, token).toContain(token);
    }
  });

  it("готовият резултат минава схема v2 И пълното обвързване с източника", () => {
    expect(FULFILL).toContain("const ready = readyProductResult(");
    expect(FULFILL).toContain("ent.result_schema_version !== 2 || !ready.ok");
    expect(FULFILL).toContain('return json({ status: "ready", result: ent.result');
    // Никакъв резервен вариант „последното право“.
    expect(FULFILL).not.toMatch(/order\("created_at".*ascending: false/);
  });

  it("заявява най-много една стъпка с изведен ключ и граници в micro-USD", () => {
    expect(FULFILL).toContain('admin.rpc("claim_product_job"');
    expect(FULFILL).toContain('admin.rpc("record_product_generation_artifact"');
    expect(FULFILL).toContain("p_budget_max_input_tokens: bounds.maxInputTokens");
    expect(FULFILL).toContain("p_budget_max_output_tokens: bounds.maxOutputTokens");
    expect(FULFILL).toContain("p_budget_hard_cost_micro_usd: bounds.hardCostMicroUsd");
    expect(FULFILL).toContain("p_usage_cost_micro_usd: 0");
    // Ключът на стъпката НЕ идва от функцията, а се изчислява в базата.
    expect(FULFILL).toContain("p_current_cursor_key: currentCursorKey");
    expect(FULFILL).not.toContain("milli_cents");
  });

  it("повторяемият провал освобождава наема веднага и не лъже с резултат", () => {
    expect(FULFILL).toContain('if (claimedStage === "queued")');
    expect(FULFILL).toContain('admin.rpc("release_product_job_lease"');
    expect(FULFILL).toContain('status: "processing"');
  });

  it("никакъв провал след заявката не оставя мъртъв наем", () => {
    // Централизирана обработка: проверката на артефакта и записите стоят В блока.
    const handler = FULFILL.indexOf("const handlePostClaimFailure");
    const release = FULFILL.indexOf("const releaseRetryable");
    expect(handler).toBeGreaterThan(0);
    expect(release).toBeGreaterThan(0);
    expect(FULFILL).toContain("return await handlePostClaimFailure(error);");
    expect(FULFILL).toContain("return await releaseRetryable();");
    // Валидацията вече не хвърля извън блока.
    expect(FULFILL.lastIndexOf('throw new ProductGenerationError("invalid_cursor")')).toBeGreaterThan(handler);
    expect(FULFILL.lastIndexOf('throw new ProductGenerationError("invalid_model_output")')).toBeGreaterThan(handler);
    // Записът никога не връща 503 без освобождаване на наема.
    expect(FULFILL).not.toMatch(/\?\.ok !== true\) return fail\("failed_retryable"/);
  });

  it("четенето на трайното състояние и разчитането на артефактите са ВЪТРЕ в защитената граница", () => {
    const claim = FULFILL.indexOf("const claimedStage");
    const release = FULFILL.indexOf("const releaseRetryable");
    const handler = FULFILL.indexOf("const handlePostClaimFailure");
    const tryStart = FULFILL.indexOf("\n    try {", handler);
    const load = FULFILL.indexOf('admin.rpc("load_product_generation_state"');
    const parse = FULFILL.indexOf("await parseGenerationArtifacts({");
    const usage = FULFILL.indexOf("const usageRaw");
    const checkpoint = FULFILL.indexOf('admin.rpc("record_product_job_checkpoint"');
    // Помощниците се дефинират веднага след заявяването, преди всяка друга работа.
    expect(release).toBeGreaterThan(claim);
    expect(handler).toBeGreaterThan(claim);
    expect(tryStart).toBeGreaterThan(handler);
    for (const position of [checkpoint, load, parse, usage]) {
      expect(position).toBeGreaterThan(tryStart);
    }
    // Проблем при ЧЕТЕНЕ на състоянието е повторим, не окончателен.
    expect(FULFILL).not.toContain('p_error_code: "resume_state_invalid"');
    expect(FULFILL).not.toContain('p_error_code: "checkpoint_failed"');
  });

  it("активен наем, завършена и постоянно пропаднала задача се обработват честно", () => {
    expect(FULFILL).toContain('if (reason === "lease_active")');
    expect(FULFILL).toContain('if (reason === "already_completed")');
    expect(FULFILL).toContain('return fail("failed_permanent", 409, headers, cid)');
  });

  it("НЯМА неявен live provider, фикстури или частичен резултат", () => {
    expect(FULFILL).not.toMatch(/generateText|previewData|fixtures?\//);
    expect(JOBS).toContain("resolveProductGenerationDependencies");
    expect(FULFILL).toContain("adapter: factory(ports.model, ports.legal, calls)");
    expect(FULFILL).toContain("PRODUCT_AI_ZERO_RETENTION_VERIFIED");
  });

  it("свързва трайния call store и атомарния финален commit", () => {
    // Трайният запис на извикванията живее в общия модул, за да е проверим
    // мрежово тихо; функцията само го свързва с наема на задачата.
    const CALL_STORE = read("supabase/functions/_shared/product-call-store.ts");
    expect(CALL_STORE).toContain('admin.rpc("reserve_product_generation_call"');
    expect(CALL_STORE).toContain('admin.rpc("complete_product_generation_call"');
    expect(FULFILL).toContain("buildProductCallStore(admin as unknown as CallStoreRpcClient");
    expect(FULFILL).toContain('admin.rpc("commit_product_generation_result"');
    expect(FULFILL).not.toContain('admin.rpc("finish_product_generation"');
    expect(FULFILL).toContain("const callStore = createProductCallStore");
    expect(FULFILL).toContain("p_generation_timestamp: durableState.generation_timestamp");
  });

  it("границите идват от една сървърна политика, която браузърът не избира", () => {
    expect(POLICY).toContain("PRODUCT_GENERATION_POLICY_VERSION");
    expect(FULFILL).toContain("eligibility.policy.bounds");
    expect(FULFILL).toContain("p_budget_max_calls: bounds.maxModelCalls");
    expect(FULFILL).not.toMatch(/body\.(model|classification|budget)/);
  });

  it("бъдещият адаптер получава затворен договор за редакция и повторна класификация", () => {
    for (const token of [
      "redactionRequired",
      "redactionCompleted",
      "postRedactionReclassificationRequired",
      "postRedactionReclassificationCompleted",
      "userConfirmationRequired",
      "userConfirmationCompleted",
      "modelCallAllowed",
    ]) {
      expect(JOBS).toContain(token);
    }
  });

  it("грешките са безопасни и не носят съдържание на документа", () => {
    expect(FULFILL).toContain('console.error("fulfill-product error", { cid');
    expect(FULFILL).not.toMatch(/console\.(log|error)\([^)]*extracted_text/);
  });
});
