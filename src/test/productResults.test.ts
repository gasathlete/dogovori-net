/**
 * Версионираният договор за резултата от еднократните продукти.
 *
 * Проверява обвързването с източника, доказателствата с извадка, липсата на
 * изкуствен минимален брой находки, трите подхода на поправка и пълния състав
 * на пакета за преговори. Няма плащане, quota или мрежа.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CORRECTION_STRATEGIES,
  PRODUCT_RESULT_IDS,
  PRODUCT_RESULT_SCHEMA_VERSION,
  isProductResult,
  matchesSource,
  parseProductResult,
  productResultSchema,
  reviewPayloadSchema,
} from "@/lib/productResults";
import type { ProductResultParsed } from "@/lib/productResults";
import {
  CONTRACT_CHECK_FIXTURE,
  CONTRACT_IMPROVE_FIXTURE,
  NEGOTIATION_PACKAGE_FIXTURE,
  PRODUCT_RESULT_FIXTURES,
} from "@/lib/productResultFixtures";

type ById<K extends ProductResultParsed["product_id"]> = Extract<
  ProductResultParsed,
  { product_id: K }
>;

/** Валидира фикстурата и я стеснява до конкретния продукт. */
const payloadOf = <K extends ProductResultParsed["product_id"]>(
  fixture: ProductResultParsed,
  id: K,
): ById<K>["payload"] => {
  const parsed = parseProductResult(fixture);
  if (parsed.product_id !== id) throw new Error("грешен продукт във фикстурата");
  return (parsed as ById<K>).payload;
};

describe("схема на резултата — версия и обвързване с източника", () => {
  it("версията е една и същата навсякъде", () => {
    expect(PRODUCT_RESULT_SCHEMA_VERSION).toBe(1);
    for (const f of PRODUCT_RESULT_FIXTURES) {
      expect(f.schema_version).toBe(PRODUCT_RESULT_SCHEMA_VERSION);
    }
  });

  it("трите продукта са точно каноничните идентификатори", () => {
    expect([...PRODUCT_RESULT_IDS]).toEqual([
      "contract_check",
      "contract_improve",
      "negotiation_package",
    ]);
    expect(PRODUCT_RESULT_IDS).not.toContain("business_contract_map");
  });

  it("всяка фикстура минава runtime валидацията", () => {
    for (const f of PRODUCT_RESULT_FIXTURES) {
      expect(() => parseProductResult(f)).not.toThrow();
      expect(isProductResult(f)).toBe(true);
    }
  });

  it("липсващо или подправено обвързване с източника е невалидно", () => {
    const { source_hash: _h, ...noHash } = CONTRACT_CHECK_FIXTURE;
    expect(productResultSchema.safeParse(noHash).success).toBe(false);
    expect(
      productResultSchema.safeParse({
        ...CONTRACT_CHECK_FIXTURE,
        source_hash: "не-е-хеш",
      }).success,
    ).toBe(false);
    expect(
      productResultSchema.safeParse({
        ...CONTRACT_CHECK_FIXTURE,
        schema_version: 2,
      }).success,
    ).toBe(false);
  });

  it("резултат от друга версия на документа не се приема за актуален", () => {
    const f = CONTRACT_CHECK_FIXTURE;
    expect(
      matchesSource(f, {
        source_hash: f.source_hash,
        source_revision: f.source_revision,
      }),
    ).toBe(true);
    expect(
      matchesSource(f, {
        source_hash: f.source_hash,
        source_revision: f.source_revision + 1,
      }),
    ).toBe(false);
    expect(
      matchesSource(f, {
        source_hash: "b".repeat(64),
        source_revision: f.source_revision,
      }),
    ).toBe(false);
  });
});

describe("подробна проверка", () => {
  const payload = payloadOf(CONTRACT_CHECK_FIXTURE, "contract_check");

  it("носи паспорт, резюме и находки с точно място в текста", () => {
    expect(payload.passport.document_type.length).toBeGreaterThan(3);
    expect(payload.executive_summary.length).toBeGreaterThan(30);
    expect(payload.findings.length).toBeGreaterThan(0);
    for (const finding of payload.findings) {
      expect(finding.source.excerpt.length).toBeGreaterThan(5);
      expect(finding.consequence.length).toBeGreaterThan(5);
      expect(finding.next_step.length).toBeGreaterThan(5);
      expect(["high", "medium", "low"]).toContain(finding.severity);
    }
  });

  it("покрива задължения, пари, срокове, прекратяване и липсващи защити", () => {
    expect(payload.obligations.length).toBeGreaterThan(0);
    expect(payload.money_and_dates.length).toBeGreaterThan(0);
    expect(payload.termination_and_disputes.length).toBeGreaterThan(0);
    expect(payload.missing_protections.length).toBeGreaterThan(0);
    expect(payload.questions_to_clarify.length).toBeGreaterThan(0);
    expect(payload.printable).toBe(true);
  });

  it("не налага изкуствен минимален брой находки", () => {
    const empty = { ...payload, findings: [], priority_summary: [] };
    expect(reviewPayloadSchema.safeParse(empty).success).toBe(true);
  });

  it("доказателство без извадка от източника е невалидно", () => {
    const broken = {
      ...payload,
      findings: [
        { ...payload.findings[0], source: { section: "чл. 5", excerpt: "" } },
      ],
    };
    expect(reviewPayloadSchema.safeParse(broken).success).toBe(false);
  });
});

describe("подробна поправка", () => {
  const payload = payloadOf(CONTRACT_IMPROVE_FIXTURE, "contract_improve");

  it("включва цялата проверка и дава изходни файлове", () => {
    expect(payload.review.findings.length).toBeGreaterThan(0);
    expect(payload.outputs).toEqual({ docx: true, pdf: true, change_report: true });
    expect(CORRECTION_STRATEGIES).toContain(payload.default_strategy);
  });

  it("всяка поправка носи трите различни подхода и точен източник", () => {
    expect(payload.corrections.length).toBeGreaterThan(1);
    for (const c of payload.corrections) {
      expect(c.options).toHaveLength(3);
      expect(c.options.map((o) => o.strategy).sort()).toEqual(
        [...CORRECTION_STRATEGIES].sort(),
      );
      for (const o of c.options) {
        expect(o.replacement_text.length).toBeGreaterThan(10);
        expect(o.trade_off.length).toBeGreaterThan(10);
      }
      expect(c.original_text.length).toBeGreaterThan(10);
      expect(c.source.excerpt.length).toBeGreaterThan(5);
      expect(c.rationale.length).toBeGreaterThan(5);
    }
  });

  it("поправка с по-малко от три подхода не се приема", () => {
    const broken = {
      ...CONTRACT_IMPROVE_FIXTURE,
      payload: {
        ...payload,
        corrections: [
          {
            ...payload.corrections[0],
            options: payload.corrections[0].options.slice(0, 2),
          },
        ],
      },
    };
    expect(productResultSchema.safeParse(broken).success).toBe(false);
  });
});

describe("пълен пакет за преговори", () => {
  const payload = payloadOf(NEGOTIATION_PACKAGE_FIXTURE, "negotiation_package");

  it("включва проверката, поправката и записката за преговори", () => {
    expect(payload.correction.corrections.length).toBeGreaterThan(0);
    expect(payload.brief.objectives.length).toBeGreaterThan(0);
    expect(payload.brief.red_lines.length).toBeGreaterThan(0);
    expect(payload.brief.acceptable_concessions.length).toBeGreaterThan(0);
    expect(payload.brief.fallback_positions.length).toBeGreaterThan(0);
    expect(payload.brief.questions.length).toBeGreaterThan(0);
  });

  it("има таблица с действия, две писма и едно прецизиране", () => {
    expect(payload.action_table.length).toBeGreaterThan(0);
    expect(payload.messages.map((m) => m.tone).sort()).toEqual(["firm", "neutral"]);
    expect(payload.outputs).toEqual({ docx: true, pdf: true, change_report: true });
    expect(payload.included_refinements).toBe(1);
    expect(payload.refinements_used).toBeLessThanOrEqual(1);
  });

  it("две писма с еднакъв тон или второ прецизиране не се приемат", () => {
    const sameTone = {
      ...NEGOTIATION_PACKAGE_FIXTURE,
      payload: {
        ...payload,
        messages: [payload.messages[0], { ...payload.messages[1], tone: "neutral" }],
      },
    };
    expect(productResultSchema.safeParse(sameTone).success).toBe(false);
    const extra = {
      ...NEGOTIATION_PACKAGE_FIXTURE,
      payload: { ...payload, refinements_used: 2 },
    };
    expect(productResultSchema.safeParse(extra).success).toBe(false);
  });
});

describe("договорът е споделен и без тежки зависимости", () => {
  const shared = readFileSync(
    "supabase/functions/_shared/product-result-contract.ts",
    "utf8",
  );

  it("Edge файлът не внася пакети", () => {
    expect(shared).not.toMatch(/^import .* from/m);
    expect(shared).toContain("PRODUCT_RESULT_SCHEMA_VERSION");
  });

  it("забранява недоказани твърдения изрично", () => {
    expect(shared).toMatch(/източник|извадка/);
  });
});
