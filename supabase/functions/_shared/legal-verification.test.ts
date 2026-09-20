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
