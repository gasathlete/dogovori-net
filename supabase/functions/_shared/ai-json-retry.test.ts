// Unit tests за стълбицата parse → repair → regenerate при неразборим AI JSON.
// Изпълняват се с: deno test --allow-net --allow-env supabase/functions/_shared/ai-json-retry.test.ts
//
// Мрежата е заменена с fake fetch: всяко извикване към AI gateway връща
// следващия отговор от скрипта. Така се проверява, че:
//   - валиден JSON не прави нито едно AI извикване (и не се таксува повторно);
//   - счупен JSON минава през repair, а при неуспех — през regenerate със
//     същите оригинални съобщения;
//   - когато всичко се провали, се хвърля AiJsonUnparsableError с correlation id.

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AiJsonUnparsableError, parseAiJsonWithRetry, type AiMessage } from "./ai-json-retry.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface Captured {
  url: string;
  body: Record<string, unknown>;
}

/** Замества fetch; връща записаните заявки към gateway-а. */
function stubGateway(script: Array<string | null | { status: number }>): { calls: Captured[]; restore: () => void } {
  const calls: Captured[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url !== GATEWAY) {
      // Диагностични fire-and-forget логове — никога не трябва да чупят теста.
      return Promise.resolve(new Response("{}", { status: 200 }));
    }
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, body });
    const next = script.shift();
    if (next && typeof next === "object") {
      return Promise.resolve(new Response("upstream error", { status: next.status }));
    }
    const content = next ?? "";
    return Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

const MESSAGES: AiMessage[] = [
  { role: "system", content: "Ти си юрист." },
  { role: "user", content: "Договор за наем, наемодател ЮЛ, срок 12 месеца." },
];

const baseOpts = { messages: MESSAGES, model: "test-model", apiKey: "sk-test", fn: "unit-test" };

Deno.test("parseAiJsonWithRetry: валиден JSON → stage=direct, нито едно AI извикване", async () => {
  const g = stubGateway([]);
  try {
    const r = await parseAiJsonWithRetry<{ title: string }>({ ...baseOpts, content: '{"title":"Договор"}' });
    assertEquals(r.stage, "direct");
    assertEquals(r.attempts, 1);
    assertEquals(r.parsed.title, "Договор");
    assertEquals(g.calls.length, 0);
  } finally {
    g.restore();
  }
});

Deno.test("parseAiJsonWithRetry: markdown ограждане се парсва локално без repair", async () => {
  const g = stubGateway([]);
  try {
    const r = await parseAiJsonWithRetry<{ ok: boolean }>({ ...baseOpts, content: '```json\n{"ok":true}\n```' });
    assertEquals(r.stage, "direct");
    assertEquals(r.parsed.ok, true);
    assertEquals(g.calls.length, 0);
  } finally {
    g.restore();
  }
});

Deno.test("parseAiJsonWithRetry: отрязан JSON се възстановява локално (без AI извикване)", async () => {
  const g = stubGateway([]);
  try {
    const r = await parseAiJsonWithRetry<{ clauses: string[] }>({
      ...baseOpts,
      content: '{"title": "Договор", "clauses": ["a", "b"',
    });
    assertEquals(r.stage, "direct");
    assertEquals(g.calls.length, 0);
  } finally {
    g.restore();
  }
});

Deno.test("parseAiJsonWithRetry: неразборим изход → repair извикването получава суровия изход и връща поправения", async () => {
  const broken = 'Ето договора: title = "Договор", clauses = a; b (без JSON структура)';
  const g = stubGateway(['{"title":"Договор","clauses":["a","b"]}']);
  try {
    const r = await parseAiJsonWithRetry<{ clauses: string[] }>({ ...baseOpts, content: broken });
    assertEquals(r.stage, "repair");
    assertEquals(r.attempts, 2);
    assertEquals(r.parsed.clauses.length, 2);
    assertEquals(g.calls.length, 1);
    const msgs = g.calls[0].body.messages as AiMessage[];
    assertEquals(msgs[0].role, "system");
    assert(msgs[1].content.includes(broken), "repair промптът трябва да носи счупения изход");
    assertEquals(g.calls[0].body.response_format, { type: "json_object" });
  } finally {
    g.restore();
  }
});

Deno.test("parseAiJsonWithRetry: неуспешен repair → regenerate със СЪЩИТЕ оригинални съобщения", async () => {
  const g = stubGateway([
    "все още не е JSON", // repair
    '{"title":"Регенериран"}', // regenerate-1
  ]);
  try {
    const r = await parseAiJsonWithRetry<{ title: string }>({ ...baseOpts, content: "<<<не е json>>>" });
    assertEquals(r.stage, "regenerate");
    assertEquals(r.attempts, 3);
    assertEquals(r.parsed.title, "Регенериран");
    assertEquals(g.calls.length, 2);
    const regen = g.calls[1].body.messages as AiMessage[];
    // Оригиналната заявка на потребителя е запазена, добавен е само strict-JSON reminder.
    assertEquals(regen[0], MESSAGES[0]);
    assertEquals(regen[1], MESSAGES[1]);
    assertEquals(regen.length, MESSAGES.length + 1);
    assertEquals(regen[regen.length - 1].role, "system");
  } finally {
    g.restore();
  }
});

Deno.test("parseAiJsonWithRetry: validate отхвърля структурно валиден, но безполезен отговор", async () => {
  const g = stubGateway([
    '{"title":""}', // repair — валиден JSON, но не минава validate
    '{"title":"Пълен"}', // regenerate-1
  ]);
  try {
    const r = await parseAiJsonWithRetry<{ title: string }>({
      ...baseOpts,
      content: '{"title":""}',
      validate: (v) => typeof (v as { title?: string })?.title === "string" && (v as { title: string }).title.length > 0,
    });
    assertEquals(r.stage, "regenerate");
    assertEquals(r.parsed.title, "Пълен");
  } finally {
    g.restore();
  }
});

Deno.test("parseAiJsonWithRetry: gateway 5xx при repair не спира стълбицата", async () => {
  const g = stubGateway([{ status: 502 }, '{"title":"OK"}']);
  try {
    const r = await parseAiJsonWithRetry<{ title: string }>({ ...baseOpts, content: "{broken" });
    assertEquals(r.stage, "regenerate");
    assertEquals(r.parsed.title, "OK");
  } finally {
    g.restore();
  }
});

Deno.test("parseAiJsonWithRetry: regenerateAttempts ограничава броя опити и накрая хвърля типизирана грешка", async () => {
  const g = stubGateway(["x", "y", "z", "w"]);
  try {
    await assertRejects(
      () => parseAiJsonWithRetry({ ...baseOpts, content: "{broken", regenerateAttempts: 2, correlationId: "cid-123" }),
      AiJsonUnparsableError,
    );
    // 1 repair + 2 regenerate = 3 извиквания; четвъртият скриптов отговор остава неизползван.
    assertEquals(g.calls.length, 3);
  } finally {
    g.restore();
  }
});

Deno.test("AiJsonUnparsableError носи correlation id за диагностика без суров текст", async () => {
  const g = stubGateway([null, null]);
  try {
    let caught: unknown = null;
    try {
      await parseAiJsonWithRetry({ ...baseOpts, content: "ЕГН 8001011234 {broken", correlationId: "cid-777" });
    } catch (e) {
      caught = e;
    }
    assert(caught instanceof AiJsonUnparsableError);
    assertEquals((caught as AiJsonUnparsableError).correlationId, "cid-777");
    assert(!(caught as Error).message.includes("8001011234"), "съобщението не трябва да носи PII от суровия изход");
  } finally {
    g.restore();
  }
});

Deno.test("maskSensitive: цитатът от JSON.parse грешката не носи суров фрагмент от входа", async () => {
  const { maskSensitive } = await import("./ai-log.ts");
  const v8 = `Unexpected token 'Е', "ЕГН 800101"... is not valid JSON`;
  const masked = maskSensitive(v8);
  assert(!masked.includes("800101"), masked);
  assert(masked.includes("is not valid JSON"));
  // Пълни идентификатори продължават да се маскират и без цитат.
  assert(!maskSensitive("ЕГН 8001011234 в текста").includes("8001011234"));
});
