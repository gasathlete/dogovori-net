import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildStrategyEvidence,
  type StrategySourceRef,
  STRATEGY_EVIDENCE_TTL_S,
  verifyStrategyEvidence,
} from "./strategy-evidence.ts";

const KEY = "test-signing-key";
const ANALYSIS = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const SOURCES: StrategySourceRef[] = [
  { chunk_id: "c1", short_code: "ЗЗД", version: "2026-01:abc" },
];
const strategy = { summary: "Стратегия", next_steps: ["едно"] };

async function envelope(now = new Date()) {
  const evidence = await buildStrategyEvidence({
    analysisId: ANALYSIS,
    userId: USER,
    strategy,
    sources: SOURCES,
    signingKey: KEY,
    now,
  });
  return { ...strategy, __evidence: evidence };
}

function current(): Map<string, string> {
  return new Map([["c1", "2026-01:abc"]]);
}

Deno.test("валиден плик се удостоверява", async () => {
  const res = await verifyStrategyEvidence({
    envelope: await envelope(),
    analysisId: ANALYSIS,
    userId: USER,
    signingKey: KEY,
    currentSources: current(),
  });
  assertEquals(res.ok, true);
});

Deno.test("подправено съдържание се отхвърля", async () => {
  const env = await envelope() as Record<string, unknown>;
  env.summary = "Друга стратегия";
  const res = await verifyStrategyEvidence({
    envelope: env,
    analysisId: ANALYSIS,
    userId: USER,
    signingKey: KEY,
    currentSources: current(),
  });
  assertEquals(res.reason, "content_mismatch");
});

Deno.test("подправен подпис се отхвърля", async () => {
  const env = await envelope() as Record<string, unknown>;
  (env.__evidence as Record<string, unknown>).signature = "0".repeat(64);
  const res = await verifyStrategyEvidence({
    envelope: env,
    analysisId: ANALYSIS,
    userId: USER,
    signingKey: KEY,
    currentSources: current(),
  });
  assertEquals(res.reason, "bad_signature");
});

Deno.test("плик за друг анализ или друг потребител не се приема", async () => {
  const env = await envelope();
  assertEquals(
    (await verifyStrategyEvidence({
      envelope: env,
      analysisId: "друг",
      userId: USER,
      signingKey: KEY,
    })).reason,
    "analysis_mismatch",
  );
  assertEquals(
    (await verifyStrategyEvidence({
      envelope: env,
      analysisId: ANALYSIS,
      userId: "друг",
      signingKey: KEY,
    })).reason,
    "user_mismatch",
  );
});

Deno.test("остарял източник скрива резултата", async () => {
  const res = await verifyStrategyEvidence({
    envelope: await envelope(),
    analysisId: ANALYSIS,
    userId: USER,
    signingKey: KEY,
    currentSources: new Map([["c1", "2026-02:zzz"]]),
  });
  assertEquals(res.reason, "stale_sources");
});

Deno.test("липсващ източник скрива резултата", async () => {
  const res = await verifyStrategyEvidence({
    envelope: await envelope(),
    analysisId: ANALYSIS,
    userId: USER,
    signingKey: KEY,
    currentSources: new Map(),
  });
  assertEquals(res.reason, "stale_sources");
});

Deno.test("стар запис без плик (v1 или нищо) не се приема", async () => {
  assertEquals(
    (await verifyStrategyEvidence({
      envelope: { summary: "стара" },
      analysisId: ANALYSIS,
      userId: USER,
      signingKey: KEY,
    })).reason,
    "missing_envelope",
  );
  assertEquals(
    (await verifyStrategyEvidence({
      envelope: { summary: "стара", __evidence: { version: "v1", analysis_id: ANALYSIS } },
      analysisId: ANALYSIS,
      userId: USER,
      signingKey: KEY,
    })).reason,
    "version_mismatch",
  );
});

Deno.test("изтекъл плик не се приема", async () => {
  const past = new Date(Date.now() - (STRATEGY_EVIDENCE_TTL_S + 60) * 1000);
  const res = await verifyStrategyEvidence({
    envelope: await envelope(past),
    analysisId: ANALYSIS,
    userId: USER,
    signingKey: KEY,
    currentSources: current(),
  });
  assertEquals(res.reason, "expired");
});

Deno.test("липсващ ключ е недостъпност, не разрешение", async () => {
  const res = await verifyStrategyEvidence({
    envelope: await envelope(),
    analysisId: ANALYSIS,
    userId: USER,
    signingKey: null,
  });
  assertEquals(res.ok, false);
  assertEquals(res.reason, "signing_unavailable");
});

Deno.test("плик без източници не се създава", async () => {
  assertEquals(
    await buildStrategyEvidence({
      analysisId: ANALYSIS,
      userId: USER,
      strategy,
      sources: [],
      signingKey: KEY,
    }),
    null,
  );
});
