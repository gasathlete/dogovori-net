/**
 * Схема v2 на платения резултат: успех, отказ и еднакъв извод в браузъра и в
 * Edge валидатора. Само синтетични примери.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isValidProductResult,
  parseReadyProductResult,
  productResultSchema,
  validateProductResult,
  PRODUCT_RESULT_SCHEMA_VERSION,
} from "@/lib/productResults";
import {
  ALL_FIXTURES,
  CONTRACT_CHECK_FIXTURE,
  CONTRACT_IMPROVE_FIXTURE,
  FIXTURE_BINDING,
  NEGOTIATION_PACKAGE_FIXTURE,
  cloneFixture,
  cloneRaw,
  fixtureSpan,
  getPath,
  setPath,
} from "@/lib/productResultFixtures";

function expectValid(raw: unknown) {
  const edge = validateProductResult(raw);
  expect(edge.ok, JSON.stringify(edge)).toBe(true);
  expect(productResultSchema.safeParse(raw).success).toBe(true);
}

function expectInvalid(raw: unknown, label: string) {
  expect(validateProductResult(raw).ok, `Edge валидаторът прие ${label}`).toBe(false);
  expect(productResultSchema.safeParse(raw).success, `frontend схемата прие ${label}`).toBe(false);
}

/** Валиден пример, счупен точно на едно място. */
function broken(fixture: unknown, path: string, value: unknown): Record<string, unknown> {
  const copy = cloneRaw(fixture);
  setPath(copy, path, value);
  return copy;
}

describe("Резултат v2 — валидни примери", () => {
  it("приема тримата канонични продукта", () => {
    for (const fixture of ALL_FIXTURES) expectValid(cloneRaw(fixture));
  });

  it("версията на схемата е 2 и v1 не се приема", () => {
    expect(PRODUCT_RESULT_SCHEMA_VERSION).toBe(2);
    expectInvalid(broken(CONTRACT_CHECK_FIXTURE, "schema_version", 1), "стара версия");
  });

  it("документ без находки е валиден резултат", () => {
    const clean = cloneRaw(CONTRACT_CHECK_FIXTURE);
    setPath(clean, "payload.findings", []);
    setPath(clean, "payload.priority_summary", []);
    setPath(clean, "payload.absence_checks", []);
    setPath(clean, "payload.contradictions", []);
    expectValid(clean);
  });

  it("страницата може да липсва, когато не е измерена", () => {
    const noPages = cloneRaw(CONTRACT_CHECK_FIXTURE);
    setPath(noPages, "source.page_count", null);
    setPath(noPages, "payload.findings.0.span.page", null);
    expectValid(noPages);
  });
});

describe("Резултат v2 — обвързване с източника", () => {
  it("грешен продукт не се показва като готов", () => {
    const res = parseReadyProductResult(
      cloneFixture(CONTRACT_CHECK_FIXTURE),
      FIXTURE_BINDING,
      "contract_improve",
    );
    expect(res.ok).toBe(false);
  });

  it("правилният продукт и източник дават готов резултат", () => {
    const res = parseReadyProductResult(
      cloneFixture(NEGOTIATION_PACKAGE_FIXTURE),
      FIXTURE_BINDING,
      "negotiation_package",
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.result.ready).toBe(true);
  });

  it("друга ревизия, хеш, вид или дължина на източника е друг резултат", () => {
    for (const patch of [
      { source_hash: "b".repeat(64) },
      { source_updated_at: "2026-09-13T08:30:00.000Z" },
      { source_kind: "docx" as const },
      { char_count: FIXTURE_BINDING.char_count - 1 },
      { document_id: "11111111-2222-3333-4444-555555555555" },
      { page_count: null },
    ]) {
      const res = parseReadyProductResult(
        cloneFixture(CONTRACT_CHECK_FIXTURE),
        { ...FIXTURE_BINDING, ...patch },
        "contract_check",
      );
      expect(res.ok, JSON.stringify(patch)).toBe(false);
    }
  });

  it("мерната единица за дължина е само Unicode кодови точки", () => {
    expectInvalid(
      broken(CONTRACT_CHECK_FIXTURE, "source.char_unit", "utf16_units"),
      "друга мерна единица",
    );
  });

  it("непълен или прекалено дълъг източник не е валиден резултат", () => {
    expectInvalid(broken(CONTRACT_CHECK_FIXTURE, "source.char_count", 10), "твърде къс източник");
    expectInvalid(broken(CONTRACT_CHECK_FIXTURE, "source.char_count", 60001), "твърде дълъг източник");
  });
});

describe("Резултат v2 — доказателството е задължително", () => {
  it("извадка, която не съвпада по дължина с мястото, е невалидна", () => {
    expectInvalid(
      broken(CONTRACT_CHECK_FIXTURE, "payload.findings.0.span.excerpt", "друг текст"),
      "измислена извадка",
    );
  });

  it("място извън приетия източник е невалидно", () => {
    const bad = cloneRaw(CONTRACT_CHECK_FIXTURE);
    setPath(bad, "payload.findings.0.span.start", 0);
    setPath(bad, "payload.findings.0.span.end", FIXTURE_BINDING.char_count + 50);
    expectInvalid(bad, "място извън източника");
  });

  it("приоритет към несъществуваща находка е невалиден", () => {
    expectInvalid(
      broken(CONTRACT_CHECK_FIXTURE, "payload.priority_summary.0.finding_id", "f_missing"),
      "приоритет без находка",
    );
  });

  it("ненамерено понятие не сочи място в източника", () => {
    expectInvalid(
      broken(CONTRACT_CHECK_FIXTURE, "payload.absence_checks.0.spans", [
        fixtureSpan("едномесечно писмено предизвестие"),
      ]),
      "отсъствие с място",
    );
  });

  it("проверка за отсъствие без търсени изрази е невалидна", () => {
    expectInvalid(
      broken(CONTRACT_CHECK_FIXTURE, "payload.absence_checks.0.searched_terms", []),
      "отсъствие без търсени изрази",
    );
  });

  it("противоречие с едно място е невалидно", () => {
    expectInvalid(
      broken(CONTRACT_CHECK_FIXTURE, "payload.contradictions", [
        {
          id: "c_one",
          summary: "Две различни правила за подсъдност.",
          spans: [fixtureSpan("съда по седалището на Възложителя")],
        },
      ]),
      "противоречие с едно място",
    );
  });

  it("правно основание без канонична връзка се отхвърля", () => {
    expectInvalid(
      broken(CONTRACT_CHECK_FIXTURE, "payload.findings.0.legal_basis", [
        {
          provision_id: "zzd_92",
          version_id: "v_2026_01",
          source_id: "lex_zzd",
          canonical_url: "не е връзка",
          label: "ЗЗД, чл. 92",
        },
      ]),
      "правно основание без канонична връзка",
    );
  });

  it("структурирано правно основание с канонична връзка е допустимо", () => {
    expectValid(
      broken(CONTRACT_CHECK_FIXTURE, "payload.findings.0.legal_basis", [
        {
          provision_id: "zzd_92",
          version_id: "v_2026_01",
          source_id: "lex_zzd",
          canonical_url: "https://lex.example/zzd/92",
          label: "ЗЗД, чл. 92",
        },
      ]),
    );
  });
});

describe("Резултат v2 — продуктови граници", () => {
  it("проверката преди подпис не носи поправки или писма", () => {
    expectInvalid(
      broken(
        CONTRACT_CHECK_FIXTURE,
        "payload.corrections",
        getPath(cloneRaw(CONTRACT_IMPROVE_FIXTURE), "payload.corrections"),
      ),
      "проверка с поправки",
    );
  });

  it("поправката изисква точно три различни варианта", () => {
    const two = cloneRaw(CONTRACT_IMPROVE_FIXTURE);
    const options = getPath(two, "payload.corrections.0.options") as unknown[];
    setPath(two, "payload.corrections.0.options", options.slice(0, 2));
    expectInvalid(two, "две опции");

    const same = cloneRaw(CONTRACT_IMPROVE_FIXTURE);
    setPath(
      same,
      "payload.corrections.0.options.1.replacement_text",
      getPath(same, "payload.corrections.0.options.0.replacement_text"),
    );
    expectInvalid(same, "еднакви варианти");
  });

  it("оригиналният текст е точно извадката от мястото", () => {
    expectInvalid(
      broken(CONTRACT_IMPROVE_FIXTURE, "payload.corrections.0.original_text", "нещо друго"),
      "оригинал, различен от извадката",
    );
  });

  it("застъпващи се поправки се отхвърлят", () => {
    const bad = cloneRaw(CONTRACT_IMPROVE_FIXTURE);
    setPath(bad, "payload.corrections.1.span", getPath(bad, "payload.corrections.0.span"));
    setPath(
      bad,
      "payload.corrections.1.original_text",
      getPath(bad, "payload.corrections.0.original_text"),
    );
    expectInvalid(bad, "застъпени поправки");
  });

  it("пълният пакет иска точно две писма и едно уточнение", () => {
    const one = cloneRaw(NEGOTIATION_PACKAGE_FIXTURE);
    const messages = getPath(one, "payload.messages") as unknown[];
    setPath(one, "payload.messages", [messages[0]]);
    expectInvalid(one, "едно писмо");

    expectInvalid(
      broken(NEGOTIATION_PACKAGE_FIXTURE, "payload.messages.1.tone", "neutral"),
      "две неутрални писма",
    );
    expectInvalid(
      broken(NEGOTIATION_PACKAGE_FIXTURE, "payload.refinement", { included: 2, used: 0 }),
      "две уточнения",
    );
    expectInvalid(
      broken(NEGOTIATION_PACKAGE_FIXTURE, "payload.refinement", { included: 1, used: 2 }),
      "повече използвани от включените",
    );
  });

  it("писма има само пълният пакет", () => {
    expectInvalid(
      broken(
        CONTRACT_IMPROVE_FIXTURE,
        "payload.messages",
        getPath(cloneRaw(NEGOTIATION_PACKAGE_FIXTURE), "payload.messages"),
      ),
      "поправка с писма",
    );
  });
});

describe("Резултат v2 — общи откази", () => {
  it("отхвърля напълно грешни входове", () => {
    for (const raw of [null, 42, "текст", [], {}, { schema_version: 2 }]) {
      expect(isValidProductResult(raw)).toBe(false);
      expect(validateProductResult(raw).ok).toBe(false);
    }
  });

  it("непознат продукт не е резултат", () => {
    expectInvalid(broken(CONTRACT_CHECK_FIXTURE, "product_id", "contract_map"), "непознат продукт");
  });

  it("Edge договорът е чист: без Deno, база и мрежа", () => {
    const src = readFileSync("supabase/functions/_shared/product-result-contract.ts", "utf8");
    expect(src).not.toMatch(/Deno\.|createClient|fetch\(/);
  });
});
