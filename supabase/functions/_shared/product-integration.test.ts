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
  productGatewayEnvelopeContract,
  productGatewayEnvelopeKey,
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
  isProductMigrationApplied,
  PRODUCT_EXPECTED_MIGRATION,
  PRODUCT_MIGRATION_CAPABILITY_RPC,
  productCheckoutBlockers,
  productFulfillmentBlockers,
  productFulfillmentIntegrationBlockers,
  productIntegrationReadiness,
  productPrepaymentBlockers,
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
    fetchImpl: okFetch(envelope({ items: [{ id: "f1" }] }), (url, init) => {
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
  assertEquals(messages.length, 3);
  assertEquals(messages[0].content, PRODUCT_GATEWAY_SYSTEM_CONTRACT);
  assertEquals(messages[1].content, productGatewayEnvelopeContract("review"));
  assertEquals(messages[2].content, JSON.stringify(REQUEST.payload));
  assertEquals(seenHeaders["Idempotency-Key"], "call-1");
  assertEquals(result.inputTokens, 10);
  assertEquals(result.outputTokens, 20);
  // Масивните етапи пристигат в обвивка и се разгъват до чист масив.
  assertEquals(result.output, [{ id: "f1" }]);
});

Deno.test("gateway enforces exactly one server-owned envelope per route class", async () => {
  const arrayRoutes = ["review", "review_repair", "corrections", "corrections_repair"] as const;
  const objectRoutes = ["passport", "negotiation", "messages", "synthesis", "refinement"] as const;
  for (const routeKey of arrayRoutes) {
    assertEquals(productGatewayEnvelopeKey(routeKey), "items");
    const port = createProductModelPort({
      apiKey: "key",
      fetchImpl: okFetch(envelope({ items: [] })),
    });
    // Празният масив е честен отговор: липсата на находки е факт, не грешка.
    assertEquals(await (await port.invoke({ ...REQUEST, routeKey })).output, []);
  }
  for (const routeKey of objectRoutes) {
    assertEquals(productGatewayEnvelopeKey(routeKey), "result");
    const port = createProductModelPort({
      apiKey: "key",
      fetchImpl: okFetch(envelope({ result: { a: 1 } })),
    });
    assertEquals((await port.invoke({ ...REQUEST, routeKey })).output, { a: 1 });
  }
});

Deno.test("gateway rejects wrong wrapper, extra keys and wrong wrapped types", async () => {
  const cases: Array<[ProductModelRequest["routeKey"], unknown]> = [
    ["review", { result: [] }],
    ["review", { items: {} }],
    ["review", { items: [], extra: 1 }],
    ["review", []],
    ["passport", { items: {} }],
    ["passport", { result: [] }],
    ["passport", { result: {}, extra: 1 }],
    ["passport", { result: "низ" }],
  ];
  for (const [routeKey, content] of cases) {
    const port = createProductModelPort({ apiKey: "key", fetchImpl: okFetch(envelope(content)) });
    const error = await assertRejects(
      () => port.invoke({ ...REQUEST, routeKey }),
      ProductModelGatewayError,
    );
    assertEquals(error.reason, "invalid_envelope");
  }
});

Deno.test("gateway refuses a model outside the immutable policy bound", async () => {
  const port = createProductModelPort({ apiKey: "key", fetchImpl: okFetch(envelope({ items: [] })) });
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
        ...envelope({ items: [] }),
        choices: [{ finish_reason: "length", message: { content: "{}" } }],
      },
      "response_truncated",
    ],
    [
      { ...envelope({ items: [] }), choices: [envelope({ items: [] }).choices[0], envelope({ items: [] }).choices[0]] },
      "invalid_envelope",
    ],
    [{ ...envelope({ items: [] }), choices: [] }, "invalid_envelope"],
    [
      { ...envelope({ items: [] }), choices: [{ finish_reason: "stop", message: { content: "не е json" } }] },
      "invalid_json",
    ],
    [
      { ...envelope({ items: [] }), choices: [{ finish_reason: "stop", message: { content: "\"низ\"" } }] },
      "invalid_envelope",
    ],
    [{ ...envelope({ items: [] }), usage: undefined }, "usage_unsafe"],
    [{ ...envelope({ items: [] }), usage: { prompt_tokens: -1, completion_tokens: 1 } }, "usage_unsafe"],
    [{ ...envelope({ items: [] }), usage: { prompt_tokens: 1, completion_tokens: 501 } }, "usage_over_bound"],
  ];
  for (const [body, reason] of cases) {
    const port = createProductModelPort({ apiKey: "key", fetchImpl: okFetch(body) });
    const error = await assertRejects(() => port.invoke(REQUEST), ProductModelGatewayError);
    assertEquals(error.reason, reason);
  }
});

Deno.test("gateway proves the exact provider model and fails closed otherwise", async () => {
  // Точното съвпадение е единственият приет случай.
  const exact = createProductModelPort({
    apiKey: "key",
    fetchImpl: okFetch(envelope({ items: [] }, { model: "google/gemini-3.8-flash" })),
  });
  assertEquals((await exact.invoke(REQUEST)).output, []);

  const bad: unknown[] = [
    { ...envelope({ items: [] }), model: undefined },
    { ...envelope({ items: [] }), model: null },
    { ...envelope({ items: [] }), model: 42 },
    { ...envelope({ items: [] }), model: { id: "google/gemini-3.8-flash" } },
    { ...envelope({ items: [] }), model: "google/gemini-3.1-flash-lite" },
  ];
  for (const body of bad) {
    const port = createProductModelPort({ apiKey: "key", fetchImpl: okFetch(body) });
    const error = await assertRejects(() => port.invoke(REQUEST), ProductModelGatewayError);
    assertEquals(error.reason, "model_mismatch");
    assertEquals(error.retryable, false);
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
    createProductModelPort({ apiKey: "  ", fetchImpl: okFetch(envelope({ items: [] })) });
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
import {
  APPROVED_REGISTRY,
  CHUNK_ID,
  DOCUMENT_ID,
  FIXED_NOW,
  fixtureDb,
  OFFICIAL_URL,
  SOURCE_ID,
} from "./legal-verification.fixture.ts";

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

const STRICT_DEPS = { registry: APPROVED_REGISTRY, now: FIXED_NOW };

Deno.test("legal resolver returns exactly the active server-owned tuple", async () => {
  const port = createProductLegalBasisPort(fixtureDb() as never, {
    now: FIXED_NOW,
    verifier: STRICT_DEPS,
  });
  const resolved = await port.resolve(CANDIDATE);
  assert(resolved);
  assertEquals(resolved?.active, true);
  assertEquals(resolved?.canonical_url, OFFICIAL_URL);
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
    // Строгият проверяващ модул отказва и при инжектиран одобрен регистър.
    const port = createProductLegalBasisPort(legalDb(rows), {
      now: FIXED_NOW,
      verifier: STRICT_DEPS,
    });
    assertEquals(await port.resolve(CANDIDATE), null);
  }
});

Deno.test("a model-supplied label or url never creates authority", async () => {
  // Легаси Lex.bg източникът никога не поражда авторитет, независимо какво
  // твърди моделът.
  const lexPort = createProductLegalBasisPort(legalDb(ACTIVE), {
    now: FIXED_NOW,
    verifier: STRICT_DEPS,
  });
  assertEquals(await lexPort.resolve(CANDIDATE), null);

  const port = createProductLegalBasisPort(fixtureDb() as never, {
    now: FIXED_NOW,
    verifier: STRICT_DEPS,
  });
  // Изходът е САМО сървърен: измислен етикет/връзка не се връщат.
  const forged = await port.resolve({
    provision_id: CHUNK_ID,
    version_id: DOCUMENT_ID,
    source_id: SOURCE_ID,
    label: "чл. 999 ЗЗД",
    canonical_url: "https://example.com/x",
  });
  assertEquals(forged?.label, "чл. 79, ал. 1 ЗЗД");
  assertEquals(forged?.canonical_url, OFFICIAL_URL);
  assertEquals(await port.resolve({ ...CANDIDATE, provision_id: "not-a-uuid" }), null);
});

Deno.test("legal knowledge base readiness requires a fully verified chain", async () => {
  // Активен легаси ред сам по себе си НЕ е готовност (днешното състояние).
  assertFalse(await isLegalKnowledgeBaseReady(legalDb(ACTIVE)));
  assertFalse(await isLegalKnowledgeBaseReady(fixtureDb() as never));
  assert(await isLegalKnowledgeBaseReady(fixtureDb() as never, STRICT_DEPS));
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
  // Плащането е пресичане: изключената обработка спира НОВИ покупки веднага.
  assertEquals(
    productCheckoutBlockers(
      readProductIntegrationConfig(reader({ PRODUCT_AI_FULFILLMENT_ENABLED: undefined })),
      "live",
    ),
    ["fulfillment_disabled"],
  );
  assert(
    productCheckoutBlockers(
      readProductIntegrationConfig(reader({ PRODUCT_AI_ZERO_RETENTION_VERIFIED: undefined })),
      "live",
    ).includes("zero_retention_unverified"),
  );
});

function rpcProbe(data: unknown, error: unknown = null) {
  return {
    calls: 0,
    lastName: "",
    lastArgs: {} as Record<string, unknown>,
    rpc(name: string, args: Record<string, unknown>) {
      this.calls++;
      this.lastName = name;
      this.lastArgs = args;
      return Promise.resolve({ data, error });
    },
  };
}

const MIGRATION_CAPABILITY_OK = Object.freeze({
  ok: true,
  migration: "0026_product_acl_hardening",
});

Deno.test("migration is proven only by the server, never by a constant", async () => {
  assertEquals(PRODUCT_MIGRATION_CAPABILITY_RPC, "product_rollout_capability");
  assertEquals(PRODUCT_EXPECTED_MIGRATION, "0026_product_acl_hardening");
  const ok = rpcProbe(MIGRATION_CAPABILITY_OK);
  assert(await isProductMigrationApplied(ok));
  // Читаема, безаргументна проба: не пише и не заявява нищо.
  assertEquals(ok.lastName, "product_rollout_capability");
  assertEquals(ok.lastArgs, {});
  // Липсваща функция, грешка, друга миграция или друг тип → ЗАТВОРЕНО.
  assertFalse(await isProductMigrationApplied(rpcProbe(MIGRATION_CAPABILITY_OK, { code: "42883" })));
  assertFalse(
    await isProductMigrationApplied(rpcProbe({ ok: true, migration: "0025_product_result_selections" })),
  );
  assertFalse(await isProductMigrationApplied(rpcProbe({ ok: false, migration: "0026_product_acl_hardening" })));
  assertFalse(await isProductMigrationApplied(rpcProbe({ ok: "true", migration: "0026_product_acl_hardening" })));
  assertFalse(await isProductMigrationApplied(rpcProbe({ ok: false, reason: "not_found" })));
  assertFalse(await isProductMigrationApplied(rpcProbe(true)));
  assertFalse(await isProductMigrationApplied(rpcProbe(false)));
  assertFalse(await isProductMigrationApplied(rpcProbe(null)));
  assertFalse(
    await isProductMigrationApplied({
      rpc: () => Promise.reject(new Error("down")),
    }),
  );
});

Deno.test("prepayment gate fails closed on legal, migration and residency", async () => {
  const config = readProductIntegrationConfig(reader());
  const open = {
    legalDb: fixtureDb() as never,
    legalVerifier: STRICT_DEPS,
    rpc: rpcProbe(MIGRATION_CAPABILITY_OK),
    residencyDb: profileDb({ allow_third_country_ai: true }),
    userId: "u1",
  };
  // Всички env флагове и всички врати са отворени — остава САМО изходно
  // кодираното затваряне на неудостоверения произход на източника.
  assertEquals(await productPrepaymentBlockers(config, "live", open), ["trusted_source_unavailable"]);
  assertEquals(await productFulfillmentIntegrationBlockers(config, open), ["trusted_source_unavailable"]);
  // Вътрешна тестова зависимост: отворен мост само тук, никога през HTTP/env.
  const bridgeOpen = { trustedSourceBlockers: () => [] as const };
  assertEquals(await productPrepaymentBlockers(config, "live", open, bridgeOpen), []);
  assertEquals(
    await productPrepaymentBlockers(config, "live", { ...open, rpc: rpcProbe(false) }, bridgeOpen),
    ["migration_not_verified"],
  );
  assertEquals(
    await productPrepaymentBlockers(config, "live", { ...open, legalDb: legalDb({}) }, bridgeOpen),
    ["legal_kb_not_ready"],
  );
  assertEquals(
    await productPrepaymentBlockers(config, "live", {
      ...open,
      residencyDb: profileDb({ allow_third_country_ai: false }),
    }, bridgeOpen),
    ["residency_not_allowed"],
  );
  // Липсващ клиент означава ЗАТВОРЕНО, не „приемаме, че е наред“.
  const none = await productPrepaymentBlockers(config, "live", {
    legalDb: null,
    rpc: null,
    residencyDb: null,
    userId: null,
  }, bridgeOpen);
  assertEquals([...none], ["migration_not_verified", "legal_kb_not_ready", "residency_not_allowed"]);
});

Deno.test("prepayment fail-fast: cheap fatal blockers skip every expensive gate", async () => {
  let calls = 0;
  const trap = new Proxy({}, { get: () => { calls++; throw new Error("expensive gate called"); } });
  const gates = { legalDb: trap as never, rpc: trap as never, residencyDb: trap as never, userId: "u1" };
  // Конфигурацията е затворена (празен env) → checkout_disabled, без скъпи извиквания.
  const closed = await productPrepaymentBlockers(readProductIntegrationConfig(() => undefined), "live", gates);
  assert(closed.includes("checkout_disabled"));
  assertFalse(closed.includes("trusted_source_unavailable"));
  // Конфигурацията е отворена, мостът е затворен → само произходът.
  const config = readProductIntegrationConfig(reader());
  assertEquals(await productPrepaymentBlockers(config, "live", gates), ["trusted_source_unavailable"]);
  assertEquals(calls, 0);
});

Deno.test("readiness exposes only safe booleans and codes", async () => {
  const readiness = await productIntegrationReadiness(
    readProductIntegrationConfig(reader()),
    fixtureDb() as never,
    rpcProbe(MIGRATION_CAPABILITY_OK),
    STRICT_DEPS,
  );
  assertFalse(readiness.fulfillment_ready);
  assertFalse(readiness.checkout_ready.live);
  assertFalse(readiness.checkout_ready.sandbox);
  assert(readiness.legal_kb_ready);
  assert(readiness.migration_ready);
  assertEquals(readiness.blockers, ["trusted_source_unavailable"]);
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
  assertFalse(closed.migration_ready);
  assert(closed.blockers.includes("legal_kb_not_ready"));
  assert(closed.blockers.includes("migration_not_verified"));
  // Непроверена схема държи плащането затворено.
  const unproven = await productIntegrationReadiness(
    readProductIntegrationConfig(reader()),
    legalDb(ACTIVE),
    rpcProbe(false),
  );
  assertFalse(unproven.checkout_ready.live);
  assertFalse(unproven.migration_ready);
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
