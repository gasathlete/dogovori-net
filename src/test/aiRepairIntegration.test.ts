/**
 * Интеграционни тестове за ремонтната обработка на AI JSON.
 *
 * 1) Реалистични "почти валидни" отговори (неескейпнати кавички, отрязан край,
 *    markdown, контролни символи) трябва да се парснат без AI повторно извикване.
 * 2) Симулиран edge function handler НИКОГА не връща 500 при такива случаи.
 * 3) Логването е маскирано — никакви PII/секрети в лога.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { extractJson } from "../../supabase/functions/_shared/json.ts";
import { parseAiJsonWithRetry } from "../../supabase/functions/_shared/ai-json-retry.ts";
import { maskSensitive, maskedSnippet, describeRepair } from "../../supabase/functions/_shared/ai-log.ts";

/** Почти валидни отговори, каквито моделите връщат в реалния трафик. */
const NEAR_VALID: Array<[string, string]> = [
  [
    "неескейпнати кавички в стойност",
    '{"title":"Договор за наем","clause":"Наемателят плаща "наем" до 5-то число","ok":true}',
  ],
  [
    "неескейпнати кавички на две места",
    '{"a":"текст с "кавички" тук","b":"и "втори" случай","n":3}',
  ],
  [
    "markdown ограждение + предговор",
    'Ето документа:\n```json\n{"title":"Анекс","body":"чл. 1"}\n```\nГотово.',
  ],
  [
    "истински нов ред вътре в стринг",
    '{"body":"Чл. 1\nЧл. 2","title":"НДА"}',
  ],
  [
    "trailing запетаи",
    '{"title":"Договор","items":["а","б",],}',
  ],
  [
    "отрязан отговор насред стринг (max_tokens)",
    '{"title":"Договор за изработка","body":"Чл. 1. Изпълнителят се задължава да',
  ],
  [
    "отрязан отговор с висящ ключ",
    '{"title":"Договор","risk":{"level":"high","detail":',
  ],
  [
    "незатворени контейнери",
    '{"contract":{"title":"Наем","clauses":[{"n":1,"text":"плащане"}',
  ],
  [
    "tab вътре в стринг",
    '{"body":"колона1\tколона2","ok":true}',
  ],
];

describe("почти валиден JSON — толерантен парсинг", () => {
  for (const [name, raw] of NEAR_VALID) {
    it(`парсва: ${name}`, () => {
      const parsed = extractJson(raw, { fn: "integration-test", report: false });
      expect(parsed).toBeTruthy();
      expect(typeof parsed).toBe("object");
    });
  }

  it("запазва съдържанието при неескейпнати кавички", () => {
    const parsed: any = extractJson(NEAR_VALID[0][1], { fn: "integration-test", report: false });
    expect(parsed.title).toBe("Договор за наем");
    expect(parsed.clause).toContain("наем");
    expect(parsed.ok).toBe(true);
  });
});

/** Минимален handler, огледален на реалните edge функции. */
async function handler(aiContent: string): Promise<Response> {
  try {
    const { parsed, stage } = await parseAiJsonWithRetry({
      content: aiContent,
      messages: [
        { role: "system", content: "върни JSON" },
        { role: "user", content: "изготви договор за наем" },
      ],
      model: "google/gemini-2.5-flash",
      apiKey: "test-key",
      fn: "integration-test",
    });
    return new Response(JSON.stringify({ ok: true, stage, parsed }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
}

describe("edge function никога не връща 500 при ремонтна обработка", () => {
  beforeEach(() => {
    // Ако някой тест все пак стигне до AI повикване, връщаме валиден JSON.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: '{"recovered":true}' } }] }), {
          status: 200,
        }),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  for (const [name, raw] of NEAR_VALID) {
    it(`200 за: ${name}`, async () => {
      const res = await handler(raw);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.parsed).toBeTruthy();
    });
  }

  it("почти валидните случаи се решават локално, без допълнително AI извикване", async () => {
    const spy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    for (const [, raw] of NEAR_VALID) await handler(raw);
    expect(spy).not.toHaveBeenCalled();
  });

  it("напълно счупен отговор пак дава 200 чрез repair извикване", async () => {
    const res = await handler("Съжалявам, не мога да върна JSON.");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stage).toBe("repair");
  });
});

describe("маскиране в логовете", () => {
  const sensitive =
    'Иван Петров Георгиев, ЕГН 8001015555, тел. 0888123456, ivan@example.com, ' +
    "IBAN BG18RZBB91550123456789, гр. София ул. Витоша 15, sk_live_abcdef123456";

  it("не изтича PII или секрети", () => {
    const masked = maskSensitive(sensitive);
    for (const secret of [
      "8001015555",
      "0888123456",
      "ivan@example.com",
      "BG18RZBB91550123456789",
      "sk_live_abcdef123456",
      "Иван Петров Георгиев",
    ]) {
      expect(masked).not.toContain(secret);
    }
    expect(masked).toContain("«email»");
  });

  it("скъсява дълъг изход и запазва маркер за отрязаното", () => {
    const snippet = maskedSnippet("x".repeat(5000), 200);
    expect(snippet.length).toBeLessThan(300);
    expect(snippet).toContain("симв.");
  });

  it("описва извършената поправка без да разкрива съдържание", () => {
    const before = '{"a":"текст с "кавички""}';
    const after = '{"a":"текст с \\"кавички\\""}';
    const summary = describeRepair(before, after);
    expect(summary.steps).toContain("escaped_quotes");
    expect(summary.charDelta).toBeGreaterThan(0);
  });

  it("логва маскиран изход при неуспешен парсинг, без да хвърля", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      extractJson(`няма JSON тук: ${sensitive}`, { fn: "integration-test", report: false }),
    ).toThrow();
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("ivan@example.com");
    expect(logged).toContain("ai_output");
    spy.mockRestore();
  });
});
