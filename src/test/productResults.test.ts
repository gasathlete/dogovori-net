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
    setPath(clean, "payload.missing_protections", []);
    setPath(clean, "payload.contradictions", []);
    expectValid(clean);
  });

  it("име на страна може да е null, когато липсва в документа", () => {
    const redacted = cloneRaw(CONTRACT_CHECK_FIXTURE);
    setPath(redacted, "payload.passport.parties.0.name", null);
    expectValid(redacted);
  });

  it("находката носи отделни последствие и следваща стъпка", () => {
    for (const field of ["consequence", "next_step"]) {
      const missing = cloneRaw(CONTRACT_CHECK_FIXTURE);
      const findings = getPath(missing, "payload.findings") as Record<string, unknown>[];
      delete findings[0][field];
      expectInvalid(missing, `находка без ${field}`);
    }
  });
});

describe("Резултат v2 — липсващи защити", () => {
  it("твърдение за липса без проверка с found:false се отхвърля", () => {
    expectInvalid(
      broken(CONTRACT_CHECK_FIXTURE, "payload.missing_protections.0.absence_check_id", "a_missing"),
      "липса без проверка",
    );
    const foundNow = cloneRaw(CONTRACT_CHECK_FIXTURE);
    setPath(foundNow, "payload.absence_checks.0.found", true);
    setPath(foundNow, "payload.absence_checks.0.spans", [
      fixtureSpan("едномесечно писмено предизвестие"),
    ]);
    expectInvalid(foundNow, "липса, чиито изрази всъщност са намерени");
  });

  it("твърдението за липса не носи място в източника", () => {
    const withSpan = cloneRaw(CONTRACT_CHECK_FIXTURE);
    const items = getPath(withSpan, "payload.missing_protections") as Record<string, unknown>[];
    items[0].span = fixtureSpan("едномесечно писмено предизвестие");
    expectInvalid(withSpan, "липса с измислено място");
  });

  it("нула липсващи защити е валиден резултат", () => {
    const none = cloneRaw(CONTRACT_CHECK_FIXTURE);
    setPath(none, "payload.missing_protections", []);
    expectValid(none);
  });
});

describe("Резултат v2 — еднаква семантика в браузъра и в Edge", () => {
  /** Таблица: всеки вход трябва да бъде отхвърлен от ДВАТА пътя еднакво. */
  const cases: Array<{ label: string; build: () => unknown }> = [
    {
      label: "непознато поле в обвивката",
      build: () => ({ ...cloneRaw(CONTRACT_CHECK_FIXTURE), extra: 1 }),
    },
    {
      label: "непознато поле в товара",
      build: () => broken(CONTRACT_CHECK_FIXTURE, "payload.extra", 1),
    },
    {
      label: "непознато вложено поле в находка",
      build: () => {
        const raw = cloneRaw(CONTRACT_CHECK_FIXTURE);
        const findings = getPath(raw, "payload.findings") as Record<string, unknown>[];
        findings[0].note = "нещо непроверено";
        return raw;
      },
    },
    {
      label: "непознато поле в мястото",
      build: () => {
        const raw = cloneRaw(CONTRACT_CHECK_FIXTURE);
        const findings = getPath(raw, "payload.findings") as Record<string, unknown>[];
        (findings[0].span as Record<string, unknown>).line = 4;
        return raw;
      },
    },
    {
      label: "UUID с грешна форма",
      build: () => broken(CONTRACT_CHECK_FIXTURE, "source.document_id", "3f1c9d64-0f4a-4b7e-9a2c"),
    },
    {
      label: "UUID с фигурни скоби",
      build: () =>
        broken(
          CONTRACT_CHECK_FIXTURE,
          "source.document_id",
          "{3f1c9d64-0f4a-4b7e-9a2c-6d5e8b1a2c34}",
        ),
    },
    {
      label: "място извън източника",
      build: () => {
        const raw = cloneRaw(CONTRACT_CHECK_FIXTURE);
        setPath(raw, "payload.findings.0.span.start", FIXTURE_BINDING.char_count - 5);
        setPath(raw, "payload.findings.0.span.end", FIXTURE_BINDING.char_count + 40);
        return raw;
      },
    },
    {
      label: "страница над измерените",
      build: () => broken(CONTRACT_CHECK_FIXTURE, "payload.findings.0.span.page", 9),
    },
    {
      label: "страница при неизмерени страници",
      build: () => {
        const raw = cloneRaw(CONTRACT_CHECK_FIXTURE);
        setPath(raw, "source.page_count", null);
        return raw;
      },
    },
    {
      label: "повтарящ се идентификатор на находка",
      build: () => broken(CONTRACT_CHECK_FIXTURE, "payload.findings.1.id", "f_penalty_cap"),
    },
    {
      label: "повтарящ се приоритет",
      build: () => {
        const raw = cloneRaw(CONTRACT_CHECK_FIXTURE);
        const first = getPath(raw, "payload.priority_summary.0");
        setPath(raw, "payload.priority_summary", [first, first]);
        return raw;
      },
    },
    {
      label: "грешна връзка към проверка за отсъствие",
      build: () =>
        broken(CONTRACT_CHECK_FIXTURE, "payload.missing_protections.0.absence_check_id", "a_none"),
    },
  ];

  for (const { label, build } of cases) {
    it(`отказва еднакво: ${label}`, () => {
      const raw = build();
      const edge = validateProductResult(raw).ok;
      const front = productResultSchema.safeParse(raw).success;
      expect(edge, `Edge прие ${label}`).toBe(false);
      expect(front, `frontend прие ${label}`).toBe(false);
      expect(isValidProductResult(raw)).toBe(false);
      expect(edge).toBe(front);
    });
  }

  it("трите валидни продукта минават и по двата пътя", () => {
    for (const fixture of ALL_FIXTURES) {
      const raw = cloneRaw(fixture);
      expect(validateProductResult(raw).ok).toBe(true);
      expect(isValidProductResult(raw)).toBe(true);
    }
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
