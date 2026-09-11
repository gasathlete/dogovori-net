import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PRODUCT_ALLOWED_MODELS,
  PRODUCT_GENERATION_POLICY_VERSION,
} from "./product-generation-policy.ts";
import type { ProductModelRequest } from "./product-generation-runtime.ts";
import type { LegalBasis } from "./product-result-contract.ts";
import {
  createProductModelPort,
  PRODUCT_GATEWAY_SYSTEM_CONTRACT,
  PRODUCT_GATEWAY_TEMPERATURE,
  PRODUCT_GATEWAY_URL,
  ProductModelGatewayError,
} from "./product-model-gateway.ts";
import {
  createProductLegalBasisPort,
  isLegalKnowledgeBaseReady,
  loadActiveLegalInventory,
  type LegalDbClient,
} from "./product-legal-basis.ts";
import {
  isProductAiResidencyAllowed,
  PRODUCT_EXPECTED_MIGRATION,
  productCheckoutBlockers,
  productFulfillmentBlockers,
  productIntegrationReadiness,
  readProductIntegrationConfig,
} from "./product-integration.ts";

// ---------------------------------------------------------------- gateway port

const REQUEST: ProductModelRequest = Object.freeze({
  callId: "call-1",
  routeKey: "review",
  model: "google/gemini-3.8-flash",
  maxInputTokens: 1000,
  maxOutputTokens: 500,
  payload: { stage: "review", chunk: "⟦PD_1⟧ текст" },
});

function envelope(content: unknown, extra: Record<string, unknown> = {}) {
  return {
    model: "google/gemini-3.8-flash",
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
    ...extra,
  };
}

function okFetch(body: unknown, capture?: (url: string, init: RequestInit) => void): typeof fetch {
  return ((url: string, init: RequestInit) => {
    capture?.(url, init);
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }) as unknown as typeof fetch;
}

Deno.test("gateway sends only the redacted payload with the fixed server contract", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  let seenHeaders: Record<string, string> = {};
  const port = createProductModelPort({
    apiKey: "key",
    fetchImpl: okFetch(envelope({ findings: [] }), (url, init) => {
      seenUrl = url;
      seenBody = JSON.parse(String(init.body));
      seenHeaders = init.headers as Record<string, string>;
    }),
  });
  const result = await port.invoke(REQUEST);
  assertEquals(seenUrl, PRODUCT_GATEWAY_URL);
  assertEquals(seenBody.model, "google/gemini-3.8-flash");
  assertEquals(seenBody.temperature, PRODUCT_GATEWAY_TEMPERATURE);
  assertEquals(seenBody.max_tokens, 500);
  assertEquals(seenBody.response_format, { type: "json_object" });
  assertEquals(seenBody.user, "call-1");
  const messages = seenBody.messages as Array<Record<string, string>>;
  assertEquals(messages.length, 2);
  assertEquals(messages[0].content, PRODUCT_GATEWAY_SYSTEM_CONTRACT);
  assertEquals(messages[1].content, JSON.stringify(REQUEST.payload));
  assertEquals(seenHeaders["Idempotency-Key"], "call-1");
  assertEquals(result.inputTokens, 10);
  assertEquals(result.outputTokens, 20);
  assertEquals(result.output, { findings: [] });
});

Deno.test("gateway refuses a model outside the immutable policy bound", async () => {
  const port = createProductModelPort({ apiKey: "key", fetchImpl: okFetch(envelope({})) });
  assert(PRODUCT_ALLOWED_MODELS.includes("google/gemini-3.1-flash-lite"));
  const error = await assertRejects(
    () => port.invoke({ ...REQUEST, model: "google/gemini-2.5-flash" }),
    ProductModelGatewayError,
  );
  assertEquals(error.reason, "model_not_allowed");
});

Deno.test("gateway rejects mismatched model, truncation, multiple and invalid choices", async () => {
  const cases: Array<[unknown, string]> = [
    [envelope({}, { model: "google/gemini-3.1-flash-lite" }), "model_mismatch"],
    [
      {
        ...envelope({}),
        choices: [{ finish_reason: "length", message: { content: "{}" } }],
      },
      "response_truncated",
    ],
    [
      { ...envelope({}), choices: [envelope({}).choices[0], envelope({}).choices[0]] },
      "invalid_envelope",
    ],
    [{ ...envelope({}), choices: [] }, "invalid_envelope"],
    [
      { ...envelope({}), choices: [{ finish_reason: "stop", message: { content: "не е json" } }] },
      "invalid_json",
    ],
    [
      { ...envelope({}), choices: [{ finish_reason: "stop", message: { content: "\"низ\"" } }] },
      "invalid_json",
    ],
    [{ ...envelope({}), usage: undefined }, "usage_unsafe"],
    [{ ...envelope({}), usage: { prompt_tokens: -1, completion_tokens: 1 } }, "usage_unsafe"],
    [{ ...envelope({}), usage: { prompt_tokens: 1, completion_tokens: 501 } }, "usage_over_bound"],
  ];
  for (const [body, reason] of cases) {
    const port = createProductModelPort({ apiKey: "key", fetchImpl: okFetch(body) });
    const error = await assertRejects(() => port.invoke(REQUEST), ProductModelGatewayError);
    assertEquals(error.reason, reason);
  }
});

Deno.test("gateway marks 429/5xx retryable and 4xx terminal without a hidden retry", async () => {
  let calls = 0;
  const status = (code: number) =>
    createProductModelPort({
      apiKey: "key",
      fetchImpl: (() => {
        calls++;
        return Promise.resolve(new Response("boom", { status: code }));
      }) as unknown as typeof fetch,
    });
  const rate = await assertRejects(() => status(429).invoke(REQUEST), ProductModelGatewayError);
  assertEquals(rate.reason, "gateway_unavailable");
  assert(rate.retryable);
  const bad = await assertRejects(() => status(400).invoke(REQUEST), ProductModelGatewayError);
  assertEquals(bad.reason, "gateway_rejected");
  assertFalse(bad.retryable);
  // Точно едно излизане в мрежата за всяко извикване: няма скрит повторен опит.
  assertEquals(calls, 2);
});

Deno.test("gateway network failure is retryable and never fabricates output", async () => {
  const port = createProductModelPort({
    apiKey: "key",
    fetchImpl: (() => Promise.reject(new Error("net"))) as unknown as typeof fetch,
  });
  const error = await assertRejects(() => port.invoke(REQUEST), ProductModelGatewayError);
  assertEquals(error.reason, "gateway_unavailable");
  assert(error.retryable);
});

Deno.test("gateway requires an api key", () => {
  let thrown: unknown = null;
  try {
    createProductModelPort({ apiKey: "  ", fetchImpl: okFetch(envelope({})) });
  } catch (e) {
    thrown = e;
  }
  assert(thrown instanceof ProductModelGatewayError);
  assertEquals((thrown as ProductModelGatewayError).reason, "config_missing");
});

// ------------------------------------------------------------- legal resolver

const PROVISION = "11111111-1111-4111-8111-111111111111";
const VERSION = "22222222-2222-4222-8222-222222222222";
const SOURCE = "33333333-3333-4333-8333-333333333333";
const URL_OK = "https://lex.bg/laws/zzd";

interface Rows {
  chunk?: Record<string, unknown> | null;
  document?: Record<string, unknown> | null;
  source?: Record<string, unknown> | null;
  error?: unknown;
}

function legalDb(rows: Rows): LegalDbClient {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              const data = table === "legal_chunks"
                ? rows.chunk ?? null
                : table === "legal_documents"
                ? rows.document ?? null
                : rows.source ?? null;
              return {
                maybeSingle: () => Promise.resolve({ data, error: rows.error ?? null }),
                limit: () =>
                  Promise.resolve({
                    data: rows.source ? [rows.source] : [],
                    error: rows.error ?? null,
                  }),
              };
            },
          };
        },
      };
    },
  } as unknown as LegalDbClient;
}

const ACTIVE: Rows = {
  chunk: {
    id: PROVISION,
    source_id: SOURCE,
    document_id: VERSION,
    citation_label: "чл. 79, ал. 1 ЗЗД",
  },
  document: {
    id: VERSION,
    source_id: SOURCE,
    effective_from: "2020-01-01T00:00:00Z",
    effective_to: null,
  },
  source: { id: SOURCE, active: true, official_url: URL_OK, short_code: "ЗЗД", title: "ЗЗД" },
};

const CANDIDATE: LegalBasis = Object.freeze({
  provision_id: PROVISION,
  version_id: VERSION,
  source_id: SOURCE,
  canonical_url: URL_OK,
  label: "чл. 79, ал. 1 ЗЗД",
});

Deno.test("legal resolver returns exactly the active server-owned tuple", async () => {
  const port = createProductLegalBasisPort(legalDb(ACTIVE));
  const resolved = await port.resolve(CANDIDATE);
  assert(resolved);
  assertEquals(resolved?.active, true);
  assertEquals(resolved?.canonical_url, URL_OK);
  assertEquals(resolved?.label, "чл. 79, ал. 1 ЗЗД");
});

Deno.test("legal resolver fails closed on retired, superseded, missing, ambiguous and db errors", async () => {
  const superseded: Rows = {
    ...ACTIVE,
    document: { ...ACTIVE.document, effective_to: "2021-01-01T00:00:00Z" },
  };
  const notYet: Rows = {
    ...ACTIVE,
    document: { ...ACTIVE.document, effective_from: "2999-01-01T00:00:00Z" },
  };
  const inactive: Rows = { ...ACTIVE, source: { ...ACTIVE.source, active: false } };
  const wrongDoc: Rows = {
    ...ACTIVE,
    chunk: { ...ACTIVE.chunk, document_id: SOURCE },
  };
  const wrongSource: Rows = { ...ACTIVE, document: { ...ACTIVE.document, source_id: VERSION } };
  const missing: Rows = { ...ACTIVE, chunk: null };
  const dbError: Rows = { ...ACTIVE, error: { message: "db down" } };
  for (const rows of [superseded, notYet, inactive, wrongDoc, wrongSource, missing, dbError]) {
    const port = createProductLegalBasisPort(legalDb(rows));
    assertEquals(await port.resolve(CANDIDATE), null);
  }
});

Deno.test("a model-supplied label or url never creates authority", async () => {
  const port = createProductLegalBasisPort(legalDb(ACTIVE));
  assertEquals(await port.resolve({ ...CANDIDATE, label: "чл. 999 ЗЗД" }), null);
  assertEquals(
    await port.resolve({ ...CANDIDATE, canonical_url: "https://example.com/x" }),
    null,
  );
  assertEquals(await port.resolve({ ...CANDIDATE, canonical_url: "http://lex.bg" }), null);
  assertEquals(await port.resolve({ ...CANDIDATE, provision_id: "not-a-uuid" }), null);
});

Deno.test("legal knowledge base readiness is a boolean over active sources only", async () => {
  assert(await isLegalKnowledgeBaseReady(legalDb(ACTIVE)));
  assertFalse(await isLegalKnowledgeBaseReady(legalDb({})));
  const inventory = await loadActiveLegalInventory(legalDb(ACTIVE));
  assertEquals(inventory.length, 1);
  assertEquals(inventory[0].short_code, "ЗЗД");
});

// -------------------------------------------------------- configuration gates

const FULL_ENV: Record<string, string> = {
  LOVABLE_API_KEY: "key",
  PRODUCT_AI_ZERO_RETENTION_VERIFIED: "true",
  PRODUCT_CHECKOUT_ENABLED: "true",
  PRODUCT_AI_FULFILLMENT_ENABLED: "true",
  SUPABASE_URL: "https://db",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  STRIPE_SANDBOX_API_KEY: "sk_test",
  PAYMENTS_SANDBOX_WEBHOOK_SECRET: "whsec_test",
  STRIPE_LIVE_API_KEY: "sk_live",
  PAYMENTS_LIVE_WEBHOOK_SECRET: "whsec_live",
};

const reader = (overrides: Record<string, string | undefined> = {}) =>
(key: string) => {
  const merged = { ...FULL_ENV, ...overrides };
  return merged[key];
};

Deno.test("integration defaults are closed and require exact true flags", () => {
  const empty = readProductIntegrationConfig(() => undefined);
  assertFalse(empty.checkoutEnabled);
  assertFalse(empty.fulfillmentEnabled);
  assertFalse(empty.zeroRetentionVerified);
  assertFalse(empty.gatewayKeyPresent);
  assertFalse(empty.databaseBound);
  assertEquals(empty.policyVersion, PRODUCT_GENERATION_POLICY_VERSION);
  assertEquals(empty.expectedMigration, PRODUCT_EXPECTED_MIGRATION);
  const loose = readProductIntegrationConfig(reader({ PRODUCT_CHECKOUT_ENABLED: "1" }));
  assertFalse(loose.checkoutEnabled);
});

Deno.test("checkout and fulfillment blockers name the exact missing configuration", () => {
  const full = readProductIntegrationConfig(reader());
  assertEquals(productCheckoutBlockers(full, "live"), []);
  assertEquals(productFulfillmentBlockers(full), []);
  assertEquals(
    productCheckoutBlockers(
      readProductIntegrationConfig(reader({ PRODUCT_CHECKOUT_ENABLED: undefined })),
      "live",
    ),
    ["checkout_disabled"],
  );
  assertEquals(
    productCheckoutBlockers(
      readProductIntegrationConfig(reader({ PAYMENTS_LIVE_WEBHOOK_SECRET: undefined })),
      "live",
    ),
    ["stripe_not_configured"],
  );
  assertEquals(
    productFulfillmentBlockers(
      readProductIntegrationConfig(reader({ PRODUCT_AI_ZERO_RETENTION_VERIFIED: "false" })),
    ),
    ["zero_retention_unverified"],
  );
  assertEquals(
    productFulfillmentBlockers(
      readProductIntegrationConfig(reader({ LOVABLE_API_KEY: undefined })),
    ),
    ["gateway_key_missing"],
  );
});

Deno.test("readiness exposes only safe booleans and codes", async () => {
  const readiness = await productIntegrationReadiness(
    readProductIntegrationConfig(reader()),
    legalDb(ACTIVE),
  );
  assert(readiness.fulfillment_ready);
  assert(readiness.checkout_ready.live);
  assert(readiness.legal_kb_ready);
  assertEquals(readiness.blockers, []);
  const serialized = JSON.stringify(readiness);
  assertFalse(serialized.includes("sk_live"));
  assertFalse(serialized.includes("whsec_live"));
  assertFalse(serialized.includes("service"));
  assertFalse(serialized.includes("https://db"));
  const closed = await productIntegrationReadiness(
    readProductIntegrationConfig(() => undefined),
    null,
  );
  assertFalse(closed.fulfillment_ready);
  assertFalse(closed.legal_kb_ready);
  assert(closed.blockers.includes("legal_kb_not_ready"));
});

function profileDb(data: unknown, error: unknown = null) {
  return {
    from() {
      return {
        select() {
          return { eq() { return { maybeSingle: () => Promise.resolve({ data, error }) }; } };
        },
      };
    },
  } as unknown as Parameters<typeof isProductAiResidencyAllowed>[0];
}

Deno.test("residency check fails closed on db error and missing profile", async () => {
  assert(await isProductAiResidencyAllowed(profileDb({ allow_third_country_ai: true }), "u1"));
  assert(await isProductAiResidencyAllowed(profileDb({ allow_third_country_ai: null }), "u1"));
  assertFalse(await isProductAiResidencyAllowed(profileDb({ allow_third_country_ai: false }), "u1"));
  // Легаси поведението „при грешка разрешавай“ НЕ се пренася.
  assertFalse(await isProductAiResidencyAllowed(profileDb(null, { message: "down" }), "u1"));
  assertFalse(await isProductAiResidencyAllowed(profileDb(null), "u1"));
  assertFalse(await isProductAiResidencyAllowed(profileDb({}), ""));
});
