import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const CHECKOUT = readFileSync("supabase/functions/create-product-checkout/index.ts", "utf8");
const FULFILL = readFileSync("supabase/functions/fulfill-product/index.ts", "utf8");
const JOBS = readFileSync("supabase/functions/_shared/product-jobs.ts", "utf8");
const POLICY = readFileSync("supabase/functions/_shared/product-generation-policy.ts", "utf8");

describe("Заявката се отказва ПРЕДИ плащане, ако документът не може да се обработи", () => {
  it("допустимостта се проверява преди цената и преди сесията", () => {
    const eligibility = CHECKOUT.indexOf("evaluateProductEligibility({");
    const price = CHECKOUT.indexOf("stripe.prices.list(");
    const session = CHECKOUT.indexOf("stripe.checkout.sessions.create(");
    expect(eligibility).toBeGreaterThan(-1);
    expect(eligibility).toBeLessThan(price);
    expect(price).toBeLessThan(session);
  });

  it("контекстът минава общата строга проверка, а не местна", () => {
    expect(CHECKOUT).toContain("validateProductContext(body.context, spec.id)");
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

describe("Изпълнението е обвивка без модел (Stage 2B1B1)", () => {
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

  it("липсваща версия на политиката спира обработката (fail closed)", () => {
    expect(FULFILL).toContain("if (storedPolicy !== PRODUCT_GENERATION_POLICY_VERSION)");
    expect(FULFILL).not.toContain("storedPolicy !== null && storedPolicy !==");
  });

  it("готовият резултат се връща само по схема v2 и без преработка", () => {
    expect(FULFILL).toContain("ent.result_schema_version !== 2 || !isValidProductResult(ent.result)");
    expect(FULFILL).toContain('return json({ status: "ready", result: ent.result');
  });

  it("заявява най-много една стъпка и записва детерминистична контролна точка", () => {
    expect(FULFILL).toContain('admin.rpc("claim_product_job"');
    expect(FULFILL).toContain('admin.rpc("record_product_job_checkpoint"');
    expect(FULFILL).toContain("cursorKey(AWAITING_GENERATION_CURSOR)");
    expect(FULFILL).toContain("p_usage_calls: 0");
  });

  it("активен наем и вече завършена задача връщат „обработва се“, не грешка", () => {
    expect(FULFILL).toContain('if (reason === "lease_active")');
    expect(FULFILL).toContain('if (reason === "already_completed")');
    expect(FULFILL).toContain('status: "processing"');
  });

  it("НЯМА извикване на модел, фикстури или частичен резултат", () => {
    expect(FULFILL).not.toMatch(/lovable\/|ai\.gateway|generateText|previewData|fixtures?\//);
    expect(JOBS).toContain("resolveProductGenerationAdapter");
    expect(JOBS).toMatch(/return null/);
  });

  it("границите идват от една сървърна политика, която браузърът не избира", () => {
    expect(POLICY).toContain("PRODUCT_GENERATION_POLICY_VERSION");
    expect(FULFILL).toContain("eligibility.policy.bounds");
    expect(FULFILL).toContain("p_budget_max_calls: bounds.maxModelCalls");
    expect(FULFILL).not.toMatch(/body\.(model|classification|budget)/);
  });

  it("грешките са безопасни и не носят съдържание на документа", () => {
    expect(FULFILL).toContain('console.error("fulfill-product error", { cid');
    expect(FULFILL).not.toMatch(/console\.(log|error)\([^)]*extracted_text/);
  });
});
