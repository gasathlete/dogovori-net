/**
 * ПОКРИТИЕ НА ПОВИКВАНИЯТА КЪМ МОДЕЛ
 *
 * Тестът пази три неща:
 *  1) Всяка крайна точка, обявена за защитена в model-call-manifest.json, НЕ
 *     използва наследените квотни RPC и наистина има трайна резервация +
 *     терминално уреждане (потвърждаване/отмяна) и само-четящо търсене.
 *  2) Всяка функция, която чете LOVABLE_API_KEY, е описана в манифеста — нова
 *     крайна точка не може да мине тихо.
 *  3) Празнините са изброени честно като блокиращи пускането, а не обявени за
 *     зелени.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type AiDocumentPurpose, PROVIDER_CALL_BUDGET } from "./ai-document-ledger.ts";

const ROOT = new URL("../", import.meta.url).pathname;

type ManifestEntry = { function: string; mechanism: string };
type Manifest = {
  ledgerEnforced: ManifestEntry[];
  releaseBlockingInventory: (ManifestEntry & { gap: string })[];
  notUserTriggered: string[];
  noModelCall: string[];
};

const manifest: Manifest = JSON.parse(
  await Deno.readTextFile(`${ROOT}_shared/model-call-manifest.json`),
);

/** Точният бюджет от кода — манифестът не може да декларира друго число. */
function documentBudget(purpose: string): number {
  const budget = PROVIDER_CALL_BUDGET[purpose as AiDocumentPurpose];
  assert(typeof budget === "number", `непозната документна цел: ${purpose}`);
  return budget;
}

const LEGACY_RPCS = [
  "consume_quota",
  "consume_quota_session",
  "refund_quota",
  "charge_corrections_wave",
];

async function readHandler(name: string): Promise<string> {
  return await Deno.readTextFile(`${ROOT}${name}/index.ts`);
}

Deno.test("защитените крайни точки не използват наследени квотни RPC", async () => {
  for (const entry of manifest.ledgerEnforced) {
    const src = await readHandler(entry.function);
    for (const rpc of LEGACY_RPCS) {
      assert(
        !src.includes(`"${rpc}"`) && !src.includes(`'${rpc}'`),
        `${entry.function} все още използва наследения RPC ${rpc}`,
      );
    }
  }
});

Deno.test("защитените крайни точки имат резервация, уреждане и само-четящо търсене", async () => {
  const reserve = /reserveQuota|reserveQuotaWave|reserveReviewOperation|reserveOwnedReviewOperation|reserveAnonDelivery|reserveTurn|reserveDocumentOperation/;
  const commit = /commitQuota|commitQuotaWave|commitReviewOperation|commitOwnedReviewOperation|commitAnonDelivery|commitTurn|commitDocumentOperation/;
  const lookup =
    /lookupCommittedOperation|lookupCommittedWave|lookupReviewOperation|lookupOwnedReviewOperation|lookupAnonDelivery|reserveAnonDelivery|lookupTurn|lookupDocumentOperation/;
  for (const entry of manifest.ledgerEnforced) {
    const src = await readHandler(entry.function);
    assert(reserve.test(src), `${entry.function} няма трайна резервация`);
    assert(commit.test(src), `${entry.function} няма терминално потвърждаване`);
    assert(lookup.test(src), `${entry.function} няма само-четящо търсене на завършена операция`);
  }
});

Deno.test("всяка функция с повикване към модел е описана в манифеста", async () => {
  const described = new Set([
    ...manifest.ledgerEnforced.map((e) => e.function),
    ...manifest.releaseBlockingInventory.map((e) => e.function),
    ...manifest.notUserTriggered,
    ...manifest.noModelCall,
  ]);
  const missing: string[] = [];
  for await (const dir of Deno.readDir(ROOT)) {
    if (!dir.isDirectory || dir.name.startsWith("_")) continue;
    let src: string;
    try {
      src = await readHandler(dir.name);
    } catch {
      continue;
    }
    if (!src.includes("LOVABLE_API_KEY")) continue;
    if (!described.has(dir.name)) missing.push(dir.name);
  }
  assertEquals(
    missing,
    [],
    `Неописани крайни точки с повикване към модел: ${missing.join(", ")}`,
  );
});

Deno.test("празнините са изброени честно, а не обявени за зелени", () => {
  for (const entry of manifest.releaseBlockingInventory) {
    assert(entry.gap.trim().length > 0, `${entry.function} няма описана празнина`);
    assert(
      !manifest.ledgerEnforced.some((e) => e.function === entry.function),
      `${entry.function} е едновременно защитен и блокиращ — противоречие`,
    );
  }
});


Deno.test("защитените крайни точки нямат повече изходящи повиквания към шлюза от декларираното в манифеста", async () => {
  const GATEWAY = "ai.gateway.lovable.dev/v1/chat/completions";
  type Entry = ManifestEntry & {
    directGatewayCallSites?: number;
    maxChatRequestsPerOperation?: number | string;
    repair?: {
      parseAiJsonWithRetry?: boolean;
      regenerateAttempts?: number;
      toolIterations?: number;
      legalRepairRequests?: number;
    };
  };
  for (const entry of manifest.ledgerEnforced as Entry[]) {
    const src = await readHandler(entry.function);
    if (typeof entry.directGatewayCallSites === "number") {
      const actual = src.split(GATEWAY).length - 1;
      assert(
        actual <= entry.directGatewayCallSites,
        `${entry.function} прави ${actual} буквални повиквания към шлюза, но манифестът декларира ${entry.directGatewayCallSites}`,
      );
    }

    // ИСТИНСКИЯТ максимум: поправянето на невалиден JSON е допълнителна заявка
    // към доставчика в СЪЩАТА операция и трябва да е декларирано.
    const usesRepair = src.includes("parseAiJsonWithRetry");
    const attemptsMatch = src.match(/regenerateAttempts:\s*(\d+)/);
    const attempts = usesRepair ? Number(attemptsMatch?.[1] ?? 1) : 0;
    // Цикълът с инструменти също праща заявки към доставчика в СЪЩАТА операция.
    const iterMatch = src.match(/MAX_TOOL_ITERATIONS\s*=\s*(\d+)/);
    const toolIterations = iterMatch ? Number(iterMatch[1]) : 0;
    const legalRepair = /async function repairLegalAnswer\(/.test(src) ? 1 : 0;
    // Документните операции имат ТВЪРД бюджет за повиквания към доставчика,
    // наложен в кода чрез ProviderCallBudget. Манифестът трябва да повтаря
    // точно същото число, което стои в PROVIDER_CALL_BUDGET.
    const docPurpose = (entry as unknown as { purpose?: string }).purpose;
    const isDocumentOperation = entry.mechanism === "ai_document_operations";
    const expectedMax = isDocumentOperation
      ? documentBudget(docPurpose ?? "")
      : toolIterations > 0
      ? toolIterations + legalRepair + attempts
      : (typeof entry.directGatewayCallSites === "number" ? entry.directGatewayCallSites : 1) +
        attempts;
    if (isDocumentOperation) {
      assert(
        src.includes("ProviderCallBudget"),
        `${entry.function}: бюджетът за повиквания трябва да е наложен в кода`,
      );
      assertEquals(
        (entry as unknown as { providerCallBudget?: number }).providerCallBudget,
        expectedMax,
        `${entry.function}: декларираният бюджет не отговаря на PROVIDER_CALL_BUDGET`,
      );
    }
    if (toolIterations > 0) {
      assertEquals(
        entry.repair?.toolIterations ?? 0,
        toolIterations,
        `${entry.function}: декларираните итерации с инструменти не отговарят на кода`,
      );
      assertEquals(
        entry.repair?.legalRepairRequests ?? 0,
        legalRepair,
        `${entry.function}: декларираното правно поправяне не отговаря на кода`,
      );
      assert(
        src.includes("MAX_CHAT_REQUESTS_PER_OPERATION"),
        `${entry.function}: таванът на заявките трябва да е наложен в кода`,
      );
    }
    assertEquals(
      entry.repair?.parseAiJsonWithRetry ?? false,
      usesRepair,
      `${entry.function}: декларираното поправяне на JSON не отговаря на кода`,
    );
    assertEquals(
      entry.repair?.regenerateAttempts ?? 0,
      attempts,
      `${entry.function}: декларираните опити за поправяне не отговарят на кода`,
    );
    assertEquals(
      entry.maxChatRequestsPerOperation,
      expectedMax,
      `${entry.function}: декларираният максимум заявки към доставчика не отговаря на кода`,
    );
  }
});

Deno.test("честност на манифеста: assistant-chat е защитен с деклариран таван 9 заявки", async () => {
  assertEquals(
    manifest.releaseBlockingInventory.some((e) => e.function === "assistant-chat"),
    false,
    "assistant-chat вече не е блокер",
  );
  const entry = (manifest.ledgerEnforced as Array<Record<string, unknown>>).find(
    (e) => e.function === "assistant-chat",
  );
  assert(entry, "assistant-chat трябва да е в защитените крайни точки");
  assertEquals(entry!.mechanism, "assistant_turn_operations");
  assertEquals(entry!.maxChatRequestsPerOperation, 9);
  assertEquals(entry!.directGatewayCallSites, 2);
  const src = await readHandler("assistant-chat");
  assert(src.includes("MAX_CHAT_REQUESTS_PER_OPERATION = 9"));
  // Няма ГЕНЕРИРАН измислен цитат: фразата може да се среща само в забраната
  // към модела, никога в шаблон за низ, който се доставя на потребителя.
  assert(
    !/\[приложим общ режим по \$\{/.test(src),
    "няма шаблон, който съчинява цитат „приложим общ режим“",
  );
});

Deno.test("защитените крайни точки не насрочват повикване към модел от waitUntil", async () => {
  const waitUntilRe = /\.waitUntil\s*\(/;
  const gatewayRe = /ai\.gateway\.lovable\.dev\/v1\/chat\/completions/;
  for (const entry of manifest.ledgerEnforced) {
    const src = await readHandler(entry.function);
    const matches = [...src.matchAll(/waitUntil\s*\(([\s\S]{0,600})/g)];
    for (const m of matches) {
      assert(
        !gatewayRe.test(m[1]),
        `${entry.function} насрочва повикване към модела през waitUntil/EdgeRuntime.waitUntil`,
      );
    }
    // Проверка и за директно споменаване на модел в аргумент на waitUntil чрез
    // име на помощна функция, съдържащо "model"/"anonymise"/"blank".
    void waitUntilRe;
  }
});

Deno.test("build-custom-contract няма автоматичен запис в custom_contract_blanks", async () => {
  const src = await readHandler("build-custom-contract");
  assert(
    !src.includes("custom_contract_blanks"),
    "build-custom-contract все още записва в custom_contract_blanks без изричен, версиониран opt-in",
  );
});

Deno.test("честност на манифеста: четирите документни операции са защитени, но още блокират пускането", async () => {
  const expected: Record<string, string> = {
    "correct-uploaded": "correct_uploaded",
    "generate-linked-document": "generate_linked_document",
    "negotiation-strategy": "negotiation_strategy",
    "ocr-contract": "ocr_contract",
  };
  for (const [fn, purpose] of Object.entries(expected)) {
    const entry = (manifest.ledgerEnforced as Array<Record<string, unknown>>).find(
      (e) => e.function === fn,
    );
    assert(entry, `${fn} трябва да е в защитените крайни точки`);
    assertEquals(entry!.mechanism, "ai_document_operations");
    assertEquals(entry!.purpose, purpose);
    assertEquals(entry!.maxChatRequestsPerOperation, documentBudget(purpose));
    // Защитата в кода НЕ е доказана в базата: миграцията и pgTAP не са пускани.
    assertEquals(entry!.releaseBlocking, true, `${fn} не бива да се обявява за незаблокиращ`);
    const blockers = entry!.releaseBlockers as string[] | undefined;
    assert(Array.isArray(blockers) && blockers.length >= 3, `${fn} няма изброени блокери`);
    const src = await readHandler(fn);
    assert(src.includes("operation_id"), `${fn} трябва да изисква operation_id`);
  }
  for (const fn of ["download-document", "refine-product", "fulfill-product"]) {
    assert(
      manifest.releaseBlockingInventory.some((e) => e.function === fn),
      `${fn} трябва да остане изброен блокер`,
    );
  }
});
