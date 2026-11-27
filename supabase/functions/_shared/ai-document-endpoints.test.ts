/**
 * GATE 2 — статичен ред на стъпките в ЧЕТИРИТЕ документни крайни точки.
 * Тестът чете само изходния код (без мрежа, без база) и пази реда:
 * търсене на завършена операция → лимити/ключ/RAG → резервация → трайно
 * начало на модела → повикване към доставчика → атомарно потвърждаване.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const ENDPOINTS: Array<{ fn: string; purpose: string }> = [
  { fn: "correct-uploaded", purpose: "correct_uploaded" },
  { fn: "generate-linked-document", purpose: "generate_linked_document" },
  { fn: "negotiation-strategy", purpose: "negotiation_strategy" },
  { fn: "ocr-contract", purpose: "ocr_contract" },
];

async function src(fn: string): Promise<string> {
  return await Deno.readTextFile(`${ROOT}${fn}/index.ts`);
}

function at(text: string, needle: string): number {
  const i = text.indexOf(needle);
  assert(i >= 0, `липсва „${needle}"`);
  return i;
}

/** Позицията на ИСТИНСКОТО повикване към шлюза, не на константата с адреса. */
function providerCallAt(text: string): number {
  const m = text.match(/fetch\(\s*(?:"https:\/\/ai\.gateway\.lovable\.dev[^"]*"|GATEWAY_URL)/);
  assert(m && typeof m.index === "number", "липсва повикване към шлюза");
  return m!.index!;
}

Deno.test("всяка документна крайна точка изисква клиентски operation_id", async () => {
  for (const { fn } of ENDPOINTS) {
    const s = await src(fn);
    assert(s.includes("asOperationId("), `${fn}: няма проверка на operation_id`);
    assert(
      s.includes("operationIdRequiredResponse("),
      `${fn}: липсва детерминиран отказ без operation_id`,
    );
    assert(
      !/operation_id\s*\?\?\s*crypto\.randomUUID\(\)/.test(s),
      `${fn}: сървърът НЕ бива да измисля operation_id`,
    );
  }
});

Deno.test("редът е: търсене → резервация → трайно начало → доставчик → потвърждаване", async () => {
  for (const { fn } of ENDPOINTS) {
    const s = await src(fn);
    const lookup = at(s, "lookupDocumentOperation(");
    const reserve = at(s, "reserveDocumentOperation(");
    const started = at(s, "markDocumentModelStarted(");
    const provider = providerCallAt(s);
    const commit = at(s, "commitDocumentOperation(");
    assert(lookup < reserve, `${fn}: търсенето трябва да е ПРЕДИ резервацията`);
    assert(reserve < started, `${fn}: началото на модела е след резервацията`);
    assert(started < provider, `${fn}: НЯМА повикване към модела преди трайно начало`);
    assert(provider < commit, `${fn}: потвърждаването е след повикването`);
  }
});

Deno.test("търсенето предхожда ключа на доставчика и правните/RAG предпоставки", async () => {
  for (const { fn } of ENDPOINTS) {
    const s = await src(fn);
    const lookup = at(s, "lookupDocumentOperation(");
    const key = s.indexOf('Deno.env.get("LOVABLE_API_KEY")');
    assert(key < 0 || lookup < key, `${fn}: ключът на доставчика се чете преди повторението`);
  }
});

Deno.test("бюджетът за повиквания се налага в кода на всяка крайна точка", async () => {
  for (const { fn, purpose } of ENDPOINTS) {
    const s = await src(fn);
    assert(
      s.includes(`new ProviderCallBudget("${purpose}")`),
      `${fn}: липсва твърд бюджет за повиквания с цел ${purpose}`,
    );
    const budget = at(s, "budget.take()");
    assert(budget < providerCallAt(s), `${fn}: бюджетът се взима ПРЕДИ повикването към доставчика`);
  }
});

Deno.test("детерминиран провал ПРЕДИ модела отменя, несигурност СЛЕД модела урежда", async () => {
  for (const { fn } of ENDPOINTS) {
    const s = await src(fn);
    assert(
      s.includes("cancelDocumentOperation(") || s.includes("cancelAndRespond("),
      `${fn}: няма отмяна при детерминиран провал преди модела`,
    );
    assert(
      s.includes("markDocumentReconciliation(") || s.includes("reconcileAndRespond("),
      `${fn}: няма уреждане при несигурност след модела`,
    );
    // Никъде не се връща квота автоматично след старта на модела.
    assert(!s.includes("refund_quota"), `${fn}: автоматичното връщане на квота е забранено`);
  }
});

Deno.test("счетоводството и бизнес промяната минават през едно потвърждаване", async () => {
  const withUsage: Record<string, string> = {
    "correct-uploaded": "correct-uploaded",
    "negotiation-strategy": "negotiation-strategy",
    "ocr-contract": "ocr-contract",
    "generate-linked-document": "generate-linked-document",
  };
  for (const { fn } of ENDPOINTS) {
    const s = await src(fn);
    assert(
      s.includes(`usageFunction: "${withUsage[fn]}"`),
      `${fn}: ai_usage трябва да е част от атомарното потвърждаване`,
    );
    const commits = s.split("commitDocumentOperation(").length - 1;
    assertEquals(commits, 1, `${fn}: потвърждаването трябва да е на едно място`);
  }
});

Deno.test("OCR не записва и не журналира байтове или base64", async () => {
  const s = await src("ocr-contract");
  assert(s.includes("ocrPageSequenceDigest("), "OCR обвързването е по отпечатъци на страници");
  const logs = [...s.matchAll(/console\.(log|info|warn|error)\(([\s\S]{0,240}?)\);/g)];
  for (const m of logs) {
    const body = m[2];
    assert(!/base64|dataUrl|images\b|pages\[/i.test(body), `OCR журналира съдържание: ${body}`);
  }
  assert(!/p_result:\s*\{[^}]*images/.test(s), "резултатът за повторение не съдържа изображения");
});

Deno.test("неочакваните изключения се обработват fail-closed във всяка крайна точка", async () => {
  for (const { fn } of ENDPOINTS) {
    const s = await src(fn);
    assert(s.includes("reconcileUnexpectedFailure("), `${fn}: липсва изравняване при неочаквана грешка`);
    assert(s.includes("cancelUnexpectedFailure("), `${fn}: липсва отмяна преди старта на модела`);
    assert(s.includes("internalErrorResponse("), `${fn}: липсва нормализиран вътрешен отговор`);
    assert(/postStart/.test(s), `${fn}: няма следене дали моделът е стартирал трайно`);
  }
});

Deno.test("никъде не се връщат и не се журналират сурови съобщения за грешки", async () => {
  for (const { fn } of ENDPOINTS) {
    const s = await src(fn);
    // Сурово съобщение на ПРИХВАНАТА грешка (e/err/caught), не структурирани
    // полета като pre.error.message, които са наш собствен български текст.
    assert(
      !/(?<![.\w])(?:e|err|caught|ex)\.message/.test(s),
      `${fn}: сурово съобщение за грешка`,
    );
    const logs = [...s.matchAll(/console\.(log|info|warn|error)\(([\s\S]{0,200}?)\);/g)];
    for (const m of logs) {
      const body = m[2];
      assert(
        !/,\s*(e|err|error)\s*\)?\s*$/.test(body.trim()),
        `${fn}: журналира суров обект на грешка: ${body}`,
      );
    }
  }
});

Deno.test("свързаният документ изисква вписан профил преди всеки модел и всяка операция", async () => {
  const s = await src("generate-linked-document");
  const login = at(s, "login_required");
  const lookup = at(s, "lookupDocumentOperation(");
  assert(login < lookup, "отказът за вписване е ПРЕДИ търсенето на операция");
  assert(login < providerCallAt(s), "отказът е ПРЕДИ повикването към доставчика");
  const key = s.indexOf('Deno.env.get("LOVABLE_API_KEY")');
  assert(key < 0 || login < key, "отказът е преди четенето на ключа");
  assert(!/ip_hash:\s*ipHash/.test(s), "анонимен ai_usage по IP не съществува");
  assert(!/user_id:\s*(?:userId\s*)?\?\?\s*null/.test(s), "няма анонимен запис на употреба");
});

Deno.test("OCR не журналира тялото на отговора на доставчика", async () => {
  const s = await src("ocr-contract");
  assert(s.includes("runOcrBatch("), "партидата минава през общия безопасен помощник");
  assert(!/body|text\(\)\s*\)/.test(s.match(/console\.(warn|error)\([\s\S]{0,160}?\);/g)?.join("") ?? ""),
    "тялото на отговора не се журналира");
});

Deno.test("негоциацията чете запазена стратегия без модел и без операция", async () => {
  const s = await src("negotiation-strategy");
  const cached = at(s, "cached_only");
  const reserve = at(s, "reserveDocumentOperation(");
  assert(cached < reserve, "четенето cached_only е преди всяка резервация");
  assert(
    s.includes("usageFunction: \"negotiation-strategy\""),
    "подписаният плик и ai_usage се записват в едно потвърждаване",
  );
});
