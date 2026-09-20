import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isApprovedUrl,
  isInForce,
  isStrictLegalKnowledgeBaseReady,
  usableRegistryEntries,
  verifyLegalChunk,
  verifyRegisteredSource,
} from "./legal-verification.ts";
import {
  APPROVED_ENTRY,
  APPROVED_REGISTRY,
  CHUNK_ID,
  DOCUMENT_ID,
  FIXED_NOW,
  fixtureDb,
  type FixtureRows,
  LEX_URL,
  OFFICIAL_URL,
  READY_ROWS,
  SOURCE_ID,
} from "./legal-verification.fixture.ts";
import { retrieveLegalContext } from "./legal-rag.ts";
import { createProductLegalBasisPort, isLegalKnowledgeBaseReady } from "./product-legal-basis.ts";

const deps = { registry: APPROVED_REGISTRY, now: FIXED_NOW };

function rows(patch: FixtureRows): FixtureRows {
  return { ...READY_ROWS, ...patch };
}

Deno.test("production registry has no usable source — readiness is false and costs zero queries", async () => {
  assertEquals(usableRegistryEntries().length, 0);
  const db = fixtureDb();
  assertFalse(await isStrictLegalKnowledgeBaseReady(db));
  assertEquals(Object.keys(db.calls).length, 0);
});

Deno.test("a fully approved and fresh injected chain is accepted", async () => {
  assert(await isStrictLegalKnowledgeBaseReady(fixtureDb(), deps));
  const verified = await verifyRegisteredSource(fixtureDb(), APPROVED_ENTRY.sourceKey, deps);
  assert(verified.ok);
  const chunk = await verifyLegalChunk(fixtureDb(), CHUNK_ID, deps);
  assert(chunk.ok);
  assertEquals(chunk.chunk.canonical_url, OFFICIAL_URL);
  assertEquals(chunk.chunk.citation_label, "чл. 79, ал. 1 ЗЗД");
});

Deno.test("registry gates: disabled, unapproved, watch-only, mismatch, stale, failed run, no snapshot", async () => {
  const cases: Array<[string, FixtureRows, Parameters<typeof verifyRegisteredSource>[2]]> = [
    ["disabled code entry", READY_ROWS, {
      registry: [{ ...APPROVED_ENTRY, enabled: false }],
      now: FIXED_NOW,
    }],
    ["unapproved code entry", READY_ROWS, {
      registry: [{ ...APPROVED_ENTRY, reviewStatus: "needs_access_review" as const }],
      now: FIXED_NOW,
    }],
    ["watch-only code entry", READY_ROWS, {
      registry: [{ ...APPROVED_ENTRY, watchOnly: true }],
      now: FIXED_NOW,
    }],
    ["missing db row", rows({ registry: null }), deps],
    [
      "origin mismatch",
      rows({ registry: { ...READY_ROWS.registry!, origin: "https://evil.example" } }),
      deps,
    ],
    [
      "parser mismatch",
      rows({ registry: { ...READY_ROWS.registry!, parser_version: "v9" } }),
      deps,
    ],
    ["db row disabled", rows({ registry: { ...READY_ROWS.registry!, enabled: false } }), deps],
    ["db row watch-only", rows({ registry: { ...READY_ROWS.registry!, watch_only: true } }), deps],
    [
      "freshness not fresh",
      rows({ registry: { ...READY_ROWS.registry!, freshness_state: "stale" } }),
      deps,
    ],
    [
      "last success too old",
      rows({ registry: { ...READY_ROWS.registry!, last_success_at: "2026-01-01T00:00:00Z" } }),
      deps,
    ],
    ["no ingestion run", rows({ run: null }), deps],
    ["run unfinished", rows({ run: { ...READY_ROWS.run!, finished_at: null } }), deps],
    ["run failed", rows({ run: { ...READY_ROWS.run!, outcome: "failed" } }), deps],
    ["run needs review", rows({ run: { ...READY_ROWS.run!, outcome: "needs_review" } }), deps],
    ["no snapshot", rows({ snapshot: null }), deps],
    [
      "snapshot stale",
      rows({ snapshot: { ...READY_ROWS.snapshot!, retrieved_at: "2025-01-01T00:00:00Z" } }),
      deps,
    ],
    [
      "snapshot off-origin",
      rows({ snapshot: { ...READY_ROWS.snapshot!, canonical_url: LEX_URL } }),
      deps,
    ],
    [
      "snapshot parser mismatch",
      rows({ snapshot: { ...READY_ROWS.snapshot!, parser_version: "v9" } }),
      deps,
    ],
    ["db error", rows({ error: { message: "db down" } }), deps],
  ];
  for (const [name, r, d] of cases) {
    const res = await verifyRegisteredSource(fixtureDb(r), APPROVED_ENTRY.sourceKey, d);
    assertFalse(res.ok, name);
    assertFalse(await isStrictLegalKnowledgeBaseReady(fixtureDb(r), d), name);
  }
});

Deno.test("legacy corpus gates: lex.bg, missing version, stale index, bad dates, version mismatch", async () => {
  const cases: Array<[string, FixtureRows]> = [
    ["lex.bg origin", rows({ source: { ...READY_ROWS.source!, official_url: LEX_URL } })],
    ["inactive source", rows({ source: { ...READY_ROWS.source!, active: false } })],
    ["no current_version", rows({ source: { ...READY_ROWS.source!, current_version: null } })],
    [
      "stale last_indexed_at",
      rows({ source: { ...READY_ROWS.source!, last_indexed_at: "2026-06-11T00:00:00Z" } }),
    ],
    ["missing effective_from", rows({ document: { ...READY_ROWS.document!, effective_from: null } })],
    [
      "unparseable effective_from",
      rows({ document: { ...READY_ROWS.document!, effective_from: "не е дата" } }),
    ],
    [
      "future effective_from",
      rows({ document: { ...READY_ROWS.document!, effective_from: "2999-01-01T00:00:00Z" } }),
    ],
    [
      "expired effective_to",
      rows({ document: { ...READY_ROWS.document!, effective_to: "2026-01-01T00:00:00Z" } }),
    ],
    ["document version mismatch", rows({ document: { ...READY_ROWS.document!, version: "2019-01-01" } })],
    ["document of another source", rows({ document: { ...READY_ROWS.document!, source_id: CHUNK_ID } })],
    ["empty citation_label", rows({ chunk: { ...READY_ROWS.chunk!, citation_label: "  " } })],
    ["empty content", rows({ chunk: { ...READY_ROWS.chunk!, content: "" } })],
    ["missing chunk", rows({ chunk: null })],
  ];
  for (const [name, r] of cases) {
    const res = await verifyLegalChunk(fixtureDb(r), CHUNK_ID, deps);
    assertFalse(res.ok, name);
    assertFalse(await isStrictLegalKnowledgeBaseReady(fixtureDb(r), deps), name);
  }
});

Deno.test("url allowlist and in-force helpers are explicit", () => {
  assert(isApprovedUrl(OFFICIAL_URL, APPROVED_ENTRY));
  assertFalse(isApprovedUrl(LEX_URL, APPROVED_ENTRY));
  assertFalse(isApprovedUrl("http://dv.parliament.bg/DVWeb/x", APPROVED_ENTRY));
  assertFalse(isApprovedUrl("https://dv.parliament.bg.evil.com/DVWeb/x", APPROVED_ENTRY));
  const now = Date.parse("2026-09-20T00:00:00Z");
  assert(isInForce("2020-01-01", null, now));
  assertFalse(isInForce(null, null, now));
  assertFalse(isInForce("2999-01-01", null, now));
  assertFalse(isInForce("2020-01-01", "2021-01-01", now));
});

Deno.test("product legal basis resolves only server-verified values", async () => {
  const candidate = {
    provision_id: CHUNK_ID,
    version_id: DOCUMENT_ID,
    source_id: SOURCE_ID,
    canonical_url: "https://example.com/made-up",
    label: "чл. 999 ЗЗД",
  };
  const port = createProductLegalBasisPort(fixtureDb() as never, {
    now: FIXED_NOW,
    verifier: deps,
  });
  const resolved = await port.resolve(candidate);
  assert(resolved);
  // Връзката и етикетът от модела НЕ се връщат.
  assertEquals(resolved?.canonical_url, OFFICIAL_URL);
  assertEquals(resolved?.label, "чл. 79, ал. 1 ЗЗД");

  // Неодобрен легаси източник → отказ.
  const lex = createProductLegalBasisPort(
    fixtureDb(rows({ source: { ...READY_ROWS.source!, official_url: LEX_URL } })) as never,
    { now: FIXED_NOW, verifier: deps },
  );
  assertEquals(await lex.resolve(candidate), null);

  // Несъответстващи идентификатори → отказ.
  assertEquals(await port.resolve({ ...candidate, version_id: SOURCE_ID }), null);
  assertEquals(await port.resolve({ ...candidate, provision_id: "not-a-uuid" }), null);
});

Deno.test("an active legacy source alone is never readiness", async () => {
  // Точно днешното състояние: активни легаси редове, но нула одобрени източници.
  assertFalse(await isLegalKnowledgeBaseReady(fixtureDb() as never));
  assert(await isLegalKnowledgeBaseReady(fixtureDb() as never, deps));
});

Deno.test("retrieval makes zero provider and rpc calls when readiness is false", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (() => {
    fetchCalls += 1;
    return Promise.reject(new Error("no network allowed"));
  }) as typeof fetch;
  let rpcCalls = 0;
  try {
    const admin = {
      ...fixtureDb(),
      rpc: () => {
        rpcCalls += 1;
        return Promise.resolve({ data: [], error: null });
      },
    };
    const ctx = await retrieveLegalContext(admin as never, "key", "въпрос");
    assertFalse(ctx.hasMatches);
    assertEquals(ctx.citations.length, 0);
    assertEquals(fetchCalls, 0);
    assertEquals(rpcCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("rpc candidates cannot override server facts and low similarity is rejected", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 }),
    )) as typeof fetch;
  try {
    const base = fixtureDb();
    const admin = {
      ...base,
      rpc: () =>
        Promise.resolve({
          data: [
            {
              chunk_id: CHUNK_ID,
              similarity: 0.9,
              text_rank: 0,
              citation_label: "чл. 999 ИЗМИСЛЕН",
              content: "измислено съдържание",
              official_url: "https://example.com/fake",
              source_short_code: "X",
              source_title: "X",
              jurisdiction: "BG",
            },
            {
              chunk_id: CHUNK_ID,
              similarity: 0.01,
              text_rank: 5,
              citation_label: "лексикално",
              content: "низ",
              official_url: LEX_URL,
              source_short_code: "X",
              source_title: "X",
              jurisdiction: "BG",
            },
          ],
          error: null,
        }),
    };
    const ctx = await retrieveLegalContext(admin as never, "key", "въпрос", { verifier: deps });
    assert(ctx.hasMatches);
    // Само силното съвпадение остава; text_rank не заобикаля прага.
    assertEquals(ctx.citations.length, 1);
    assertEquals(ctx.chunks[0].citation_label, "чл. 79, ал. 1 ЗЗД");
    assertEquals(ctx.chunks[0].official_url, OFFICIAL_URL);
    assert(!ctx.promptBlock.includes("измислено съдържание"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("every AI entry point gates before the main model and before quota", async () => {
  const fns = [
    "assistant-chat",
    "analyze-contract",
    "build-custom-contract",
    "generate-contract",
    "apply-corrections",
    "correct-uploaded",
  ];
  for (const fn of fns) {
    const src = await Deno.readTextFile(new URL(`../${fn}/index.ts`, import.meta.url));
    const gate = src.indexOf("legalVerificationUnavailableResponse");
    assert(gate > 0, `${fn}: липсва правната преграда`);
    const model = src.indexOf("ai.gateway.lovable.dev/v1/chat/completions");
    if (fn !== "assistant-chat" && model > 0) {
      assert(gate < model, `${fn}: прегради преди основния модел`);
    }
    for (const marker of ["consume_quota", "charge_corrections_wave", "consumeQuota("]) {
      const q = src.indexOf(marker);
      if (q > 0) assert(gate < q, `${fn}: прегради преди ${marker}`);
    }
  }
});

Deno.test("no entry point keeps a no-match fallback prompt or a cached legal serve", async () => {
  const fns = [
    "assistant-chat",
    "analyze-contract",
    "build-custom-contract",
    "generate-contract",
    "apply-corrections",
    "correct-uploaded",
  ];
  for (const fn of fns) {
    const src = await Deno.readTextFile(new URL(`../${fn}/index.ts`, import.meta.url));
    assert(
      !/hasMatches\s*\?/.test(src),
      `${fn}: не трябва да има резервен промпт при липса на съвпадение`,
    );
    assert(!src.includes("общ режим — "), `${fn}: няма „общ режим“`);
    // Непроверен/легаси кеш не може да се сервира като правен резултат.
    assert(
      !/from\("template_cache"\)[\s\S]{0,200}\.select\(/.test(src),
      `${fn}: не чете стар template_cache като правен изход`,
    );
    // Всяко извикване на модела в пътя на заявката стои СЛЕД преградата.
    // Помощните функции, декларирани на модулно ниво, се извикват само след
    // успешна преграда; затова се брои само тялото на обработчика.
    const handlerStart = src.indexOf("serve(");
    assert(handlerStart > 0, `${fn}: липсва обработчик`);
    const handler = src.slice(handlerStart);
    const gateInHandler = handler.indexOf("legalVerificationUnavailableResponse");
    assert(gateInHandler > 0, `${fn}: преградата не е в обработчика`);
    let at = handler.indexOf("ai.gateway.lovable.dev");
    while (at > 0) {
      assert(gateInHandler < at, `${fn}: повикване към модел преди преградата`);
      at = handler.indexOf("ai.gateway.lovable.dev", at + 1);
    }
  }
});

Deno.test("readiness finds a valid later chunk of the current in-force document", async () => {
  const deps = { registry: APPROVED_REGISTRY, now: FIXED_NOW };
  const db = fixtureDb({
    ...READY_ROWS,
    chunk: undefined,
    chunks: [
      // Първите редове са невалидни (липсва съдържание/документ).
      { id: "aaaaaaaa-0000-4000-8000-000000000001", source_id: SOURCE_ID, document_id: DOCUMENT_ID, citation_label: "", content: "", article_no: null, paragraph_no: null },
      { id: "aaaaaaaa-0000-4000-8000-000000000002", source_id: SOURCE_ID, document_id: DOCUMENT_ID, citation_label: "x", content: "", article_no: null, paragraph_no: null },
      READY_ROWS.chunk as Record<string, unknown>,
    ],
  });
  assertEquals(await isStrictLegalKnowledgeBaseReady(db, deps), true);
});

Deno.test("retrieval fails closed on embedding failure, rpc failure, no candidates and weak similarity", async () => {
  const deps = { registry: APPROVED_REGISTRY, now: FIXED_NOW };
  const originalFetch = globalThis.fetch;
  const embedOk = () =>
    Promise.resolve(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 }),
    ) as unknown as Promise<Response>;

  try {
    // 1) Embedding се проваля → нула RPC, нула съвпадения.
    globalThis.fetch = (() => Promise.resolve(new Response("nope", { status: 500 }))) as typeof fetch;
    let rpcCalls = 0;
    let admin = {
      ...fixtureDb(READY_ROWS),
      rpc: () => {
        rpcCalls++;
        return Promise.resolve({ data: [], error: null });
      },
    };
    let ctx = await retrieveLegalContext(admin as never, "key", "въпрос", { verifier: deps });
    assertEquals(ctx.hasMatches, false);
    assertEquals(rpcCalls, 0);

    globalThis.fetch = embedOk as unknown as typeof fetch;

    // 2) RPC грешка.
    admin = {
      ...fixtureDb(READY_ROWS),
      rpc: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    } as never;
    ctx = await retrieveLegalContext(admin as never, "key", "въпрос", { verifier: deps });
    assertEquals(ctx.hasMatches, false);

    // 3) Няма кандидати.
    admin = {
      ...fixtureDb(READY_ROWS),
      rpc: () => Promise.resolve({ data: [], error: null }),
    } as never;
    ctx = await retrieveLegalContext(admin as never, "key", "въпрос", { verifier: deps });
    assertEquals(ctx.hasMatches, false);

    // 4) Слабо съвпадение под прага — и подаден по-нисък праг НЕ отслабва изданието.
    admin = {
      ...fixtureDb(READY_ROWS),
      rpc: () => Promise.resolve({ data: [{ chunk_id: CHUNK_ID, similarity: 0.45, text_rank: 9 }], error: null }),
    } as never;
    ctx = await retrieveLegalContext(admin as never, "key", "въпрос", {
      verifier: deps,
      minSimilarity: 0.1,
    });
    assertEquals(ctx.hasMatches, false);

    // 5) Верига с невалиден документ → без съвпадение, макар similarity да е висока.
    admin = {
      ...fixtureDb({ ...READY_ROWS, document: { ...(READY_ROWS.document as Record<string, unknown>), version: "2019-01-01" } }),
      rpc: () => Promise.resolve({ data: [{ chunk_id: CHUNK_ID, similarity: 0.95 }], error: null }),
    } as never;
    ctx = await retrieveLegalContext(admin as never, "key", "въпрос", { verifier: deps });
    assertEquals(ctx.hasMatches, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("готовността намира валидна верига и след бившите тавани", async () => {
  // 260 невалидни чънка преди валидния: старите тавани (5 документа, 4×50
  // чънка) биха го скрили. Пълният обхват го намира.
  const noise = Array.from({ length: 260 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    source_id: SOURCE_ID,
    document_id: DOCUMENT_ID,
    citation_label: "",
    content: "",
    article_no: null,
    paragraph_no: null,
  }));
  const chunks = [...noise, READY_ROWS.chunk as Record<string, unknown>];
  assert(chunks.length > 200, "наборът е по-голям от бившия таван");
  assert(
    await isStrictLegalKnowledgeBaseReady(fixtureDb(rows({ chunks })), deps),
    "валиден чънк след бившия таван трябва да бъде намерен",
  );
});

Deno.test("извличането не обхожда корпуса преди RPC и не плаща за неготов контрол", async () => {
  const originalFetch = globalThis.fetch;
  let embedCalls = 0;
  globalThis.fetch = (() => {
    embedCalls += 1;
    return Promise.resolve(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { status: 200 }),
    );
  }) as typeof fetch;
  try {
    // 1) Готов контролен слой: преди RPC няма нито едно изброяване на чънкове.
    const base = fixtureDb(READY_ROWS);
    let chunkCallsAtRpc = -1;
    const admin = {
      ...base,
      rpc: () => {
        chunkCallsAtRpc = base.calls["legal_chunks"] ?? 0;
        return Promise.resolve({ data: [{ chunk_id: CHUNK_ID, similarity: 0.91 }], error: null });
      },
    };
    const ctx = await retrieveLegalContext(admin as never, "key", "въпрос", { verifier: deps });
    assert(ctx.hasMatches, "проверен кандидат дава съвпадение");
    assertEquals(chunkCallsAtRpc, 0);
    assertEquals(embedCalls, 1);

    // 2) Неготов контролен слой (застоял регистърен ред) → нула embedding, нула RPC.
    embedCalls = 0;
    let rpcCalls = 0;
    const stale = {
      ...fixtureDb(rows({ registry: { ...READY_ROWS.registry!, freshness_state: "stale" } })),
      rpc: () => {
        rpcCalls += 1;
        return Promise.resolve({ data: [], error: null });
      },
    };
    const blocked = await retrieveLegalContext(stale as never, "key", "въпрос", { verifier: deps });
    assertFalse(blocked.hasMatches);
    assertEquals(embedCalls, 0);
    assertEquals(rpcCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("лекият контролен слой не зависи от корпуса, но остава строг", async () => {
  const { isLegalControlPlaneReady } = await import("./legal-verification.ts");
  assert(await isLegalControlPlaneReady(fixtureDb(READY_ROWS), deps));
  // Без одобрен code-owned източник — нула заявки.
  const db = fixtureDb();
  assertFalse(await isLegalControlPlaneReady(db));
  assertEquals(Object.keys(db.calls).length, 0);
  // Неприето последно изпълнение → отказ.
  assertFalse(
    await isLegalControlPlaneReady(
      fixtureDb(rows({ run: { ...READY_ROWS.run!, outcome: "failed" } })),
      deps,
    ),
  );
});

Deno.test("отказът на веригата на кандидата остава без съвпадение", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ data: [{ embedding: [0.1] }] }), { status: 200 }),
    )) as typeof fetch;
  try {
    const admin = {
      ...fixtureDb(rows({ source: { ...READY_ROWS.source!, official_url: LEX_URL } })),
      rpc: () => Promise.resolve({ data: [{ chunk_id: CHUNK_ID, similarity: 0.99 }], error: null }),
    };
    const ctx = await retrieveLegalContext(admin as never, "key", "въпрос", { verifier: deps });
    assertFalse(ctx.hasMatches);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
