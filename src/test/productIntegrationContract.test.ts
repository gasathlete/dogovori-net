import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const FULFILL = read("supabase/functions/fulfill-product/index.ts");
const CHECKOUT = read("supabase/functions/create-product-checkout/index.ts");
const GATEWAY = read("supabase/functions/_shared/product-model-gateway.ts");
const LEGAL = read("supabase/functions/_shared/product-legal-basis.ts");
const INTEGRATION = read("supabase/functions/_shared/product-integration.ts");
const CHECKLIST = read("docs/migrations/PRODUCT_INTEGRATION_ROLLOUT.md");

describe("платеният продуктов gateway е отделен от общия рутер", () => {
  it("не ползва стария рутер и стария Gemini 2.5 маршрут", () => {
    expect(GATEWAY).not.toContain("model-router");
    expect(GATEWAY).not.toContain("gemini-2.5");
    expect(GATEWAY).not.toContain("ai-call.ts");
    // Няма скрит резервен модел и няма вътрешен повторен опит.
    expect(GATEWAY).not.toContain("fallback");
    expect(GATEWAY).not.toMatch(/for\s*\(.*retry/i);
  });

  it("изпраща фиксиран сървърен договор, JSON формат и таван от границата", () => {
    expect(GATEWAY).toContain("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(GATEWAY).toContain('response_format: { type: "json_object" }');
    expect(GATEWAY).toContain("max_tokens: request.maxOutputTokens");
    expect(GATEWAY).toContain("PRODUCT_GATEWAY_TEMPERATURE = 0");
    expect(GATEWAY).toContain('"Idempotency-Key": request.callId');
    expect(GATEWAY).toContain("PRODUCT_ALLOWED_MODELS");
  });

  it("не логва и не изнася съдържание при грешка", () => {
    expect(GATEWAY).not.toContain("console.log");
    expect(GATEWAY).not.toContain("await response.text()");
  });
});

describe("правното основание е сървърен факт", () => {
  it("няма embedding/RAG и няма мрежа", () => {
    expect(LEGAL).not.toContain("legal-rag");
    expect(LEGAL).not.toContain("match_legal_chunks");
    expect(LEGAL).not.toContain("await fetch(");
  });

  it("минава през общия строг проверяващ модул и връща само сървърни стойности", () => {
    expect(LEGAL).toContain("verifyLegalChunk(");
    expect(LEGAL).toContain("isStrictLegalKnowledgeBaseReady(");
    expect(LEGAL).toContain("chunk.document_id !== version_id");
    expect(LEGAL).toContain("chunk.source_id !== source_id");
    expect(LEGAL).toContain("canonical_url: chunk.canonical_url");
    expect(LEGAL).toContain("label: chunk.citation_label");
    // Активен легаси ред сам по себе си вече не е готовност.
    expect(LEGAL).not.toContain("return inventory.length > 0");
  });
});

describe("конфигурацията е затворена по подразбиране", () => {
  it("флаг се приема само при точен низ true", () => {
    expect(INTEGRATION).toContain('return env(key) === "true"');
    expect(INTEGRATION).toContain("PRODUCT_CHECKOUT_ENABLED");
    expect(INTEGRATION).toContain("PRODUCT_AI_FULFILLMENT_ENABLED");
    expect(INTEGRATION).toContain("PRODUCT_AI_ZERO_RETENTION_VERIFIED");
  });

  it("не изнася тайни, цени или вътрешни идентификатори в отчета за готовност", () => {
    const readiness = INTEGRATION.slice(INTEGRATION.indexOf("export interface ProductIntegrationReadiness"));
    expect(readiness).not.toContain("price_id");
    expect(readiness).not.toContain("apiKey:");
    expect(readiness).toContain("stripe_configured");
  });

  it("residency се проваля затворено", () => {
    expect(INTEGRATION).toContain('if (error || !data || typeof data !== "object") return false;');
    expect(INTEGRATION).toContain("row.allow_third_country_ai !== false");
  });
});

describe("сглобяването е за една заявка и след всички условия", () => {
  it("fulfill-product проверява интеграцията ПРЕДИ да заяви задача", () => {
    const gate = FULFILL.indexOf("productFulfillmentIntegrationBlockers(integration");
    const claim = FULFILL.indexOf('admin.rpc("claim_product_job"');
    expect(gate).toBeGreaterThan(0);
    expect(claim).toBeGreaterThan(gate);
    expect(FULFILL).toContain("createProductModelPort({");
    expect(FULFILL).toContain("createProductLegalBasisPort(legalDb)");
    // Няма път „без адаптер“, който да заявява задача.
    expect(FULFILL).not.toContain("? factory(ports.model, ports.legal, calls) : null");
    expect(FULFILL).toContain("adapter: factory(ports.model, ports.legal, calls)");
  });

  it("при забранена AI обработка извън ЕИП не се заявява задача и се отказва", () => {
    expect(FULFILL).toContain('"residency_not_allowed"');
    expect(FULFILL).toContain('code === "residency_not_allowed" ? 409 : 503');
  });

  it("провалът на доставчика не оставя мъртъв наем и не изнася подробности", () => {
    expect(FULFILL).toContain("ProductModelGatewayError");
    expect(FULFILL).toContain("release_product_job_lease");
    expect(FULFILL).toContain('p_error_code: gateway ? "provider_contract" : "generation_invalid"');
  });

  it("платеният път не харчи общи операции", () => {
    expect(FULFILL).not.toContain("consume_quota");
    expect(FULFILL).not.toContain("ocr-contract");
    expect(CHECKOUT).not.toContain("consume_quota");
  });

  it("плащането се проверява напълно преди Stripe и преди всеки запис", () => {
    const gate = CHECKOUT.indexOf("productPrepaymentBlockers(integrationConfig");
    expect(gate).toBeGreaterThan(0);
    expect(CHECKOUT.indexOf("createStripeClient(environment)")).toBeGreaterThan(gate);
    expect(CHECKOUT).toContain("readProductIntegrationConfig((key) => Deno.env.get(key))");
    expect(CHECKOUT).not.toContain("productCheckoutBlockers(");
  });
});

describe("операторският списък е пълен и без тайни стойности", () => {
  it("описва миграции, флагове, ред на включване и връщане назад", () => {
    expect(CHECKLIST).toContain("0025_product_result_selections");
    expect(CHECKLIST).toContain("0026_product_acl_hardening");
    expect(CHECKLIST).toContain("product_rollout_capability");
    expect(CHECKLIST).toContain("PRODUCT_CHECKOUT_ENABLED");
    expect(CHECKLIST).toContain("PRODUCT_AI_FULFILLMENT_ENABLED");
    expect(CHECKLIST).toContain("checkout.session.completed");
    expect(CHECKLIST).toContain("Връщане назад");
    expect(CHECKLIST).not.toMatch(/sk_(test|live)_[A-Za-z0-9]/);
    expect(CHECKLIST).not.toMatch(/whsec_[A-Za-z0-9]/);
  });
});
