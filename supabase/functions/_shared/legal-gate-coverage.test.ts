import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AI_ENDPOINT_POLICIES } from "./ai-endpoint-policy.ts";

const DIR = new URL("../", import.meta.url).pathname;

async function src(name: string): Promise<string> {
  return await Deno.readTextFile(`${DIR}${name}/index.ts`);
}

/** Индексът на първото срещане или Infinity, ако го няма. */
function at(text: string, needle: string): number {
  const i = text.indexOf(needle);
  return i < 0 ? Number.POSITIVE_INFINITY : i;
}

const BILLING_MUTATIONS = [
  "consume_quota",
  "consume_quota_session",
  "charge_corrections_wave",
  "consume_ai_message",
  "consume_assistant_message",
];

Deno.test("пре"+"градата стои преди всяка таксуваща мутация", async () => {
  const gated = AI_ENDPOINT_POLICIES.filter((p) => p.requiresStrictLegalGate && p.name !== "generate-job");
  for (const policy of gated) {
    const text = await src(policy.name);
    const gate = Math.min(
      at(text, "legalVerificationUnavailableResponse"),
      at(text, "legal_verification_unavailable"),
    );
    if (!Number.isFinite(gate)) continue;
    for (const rpc of BILLING_MUTATIONS) {
      const charge = at(text, `"${rpc}"`);
      if (!Number.isFinite(charge)) continue;
      assert(
        gate < charge,
        `${policy.name}: ${rpc} се извиква преди правната преграда`,
      );
    }
  }
});

Deno.test("няма резервен промпт без проверени извадки", async () => {
  for (const policy of AI_ENDPOINT_POLICIES.filter((p) => p.requiresStrictLegalGate)) {
    const text = await src(policy.name);
    assert(
      !/hasMatches\s*\?\s*\w+\s*:\s*\w+/.test(text),
      `${policy.name} има резервен промпт при липса на съвпадение`,
    );
  }
});

Deno.test("стар кеш не се поднася без проверим правен манифест", async () => {
  const negotiation = await src("negotiation-strategy");
  const gate = at(negotiation, "legalVerificationUnavailableResponse");
  const cacheRead = at(negotiation, 'from("negotiation_strategy")');
  assert(
    !Number.isFinite(cacheRead) || cacheRead > gate,
    "negotiation-strategy чете кеша преди заземяването",
  );

  const blank = await src("download-blank");
  const blankGate = at(blank, "legalVerificationUnavailableResponse");
  const blankCache = at(blank, 'from("document_blanks")');
  assert(
    !Number.isFinite(blankCache) || blankCache > blankGate,
    "download-blank поднася стара бланка преди заземяването",
  );

  const analyze = await src("analyze-contract");
  assert(
    !analyze.includes("resolveCachedAnalysis("),
    "analyze-contract поднася стар кеш без проверим манифест",
  );
});

Deno.test("предварителното пълнене създава само чернова", async () => {
  const warm = await src("warm-blank-cache");
  assert(!warm.includes('.from("document_blanks")\n          .upsert'), "warm-blank-cache вписва публична бланка");
  assert(warm.includes("draft/"), "warm-blank-cache не пише в отделно черново пространство");
});
