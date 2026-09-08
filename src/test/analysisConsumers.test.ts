/**
 * Регресия на потребителите на `risk_analyses.score`: всяка повърхност, която
 * показва оценка, трябва да чете и метаданните от проверката и да минава през
 * общия помощник. Тестът е върху източника, за да не се появи нов „сляп" екран.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

const SCORE_SURFACES = [
  "src/pages/UploadedContract.tsx",
  "src/components/console/panes/AnalysisPane.tsx",
  "src/components/console/ConsoleListColumn.tsx",
  "src/pages/Contact.tsx",
  "src/pages/account/DocumentsTab.tsx",
];

describe("потребители на оценката от риск-анализа", () => {
  it("всяка повърхност минава през общия помощник", () => {
    for (const f of SCORE_SURFACES) {
      expect(read(f), f).toMatch(/@\/lib\/analysisVerification/);
    }
  });

  it("всяка заявка към risk_analyses взима и метаданните", () => {
    const files = [
      "src/pages/Account.tsx",
      "src/components/console/ConsoleListColumn.tsx",
      "src/pages/Contact.tsx",
    ];
    for (const f of files) {
      const src = read(f);
      const selects = src.match(/risk_analyses"\)\s*\n?\s*\.select\("([^"]+)"\)/g) ?? [];
      const inline = src.match(/from\("risk_analyses"\)\.select\("([^"]+)"\)/g) ?? [];
      const all = [...selects, ...inline];
      expect(all.length, `${f}: очаква се поне една заявка`).toBeGreaterThan(0);
      for (const s of all) {
        expect(s.includes("verification") || s.includes('select("*")'), `${f}: ${s}`).toBe(true);
      }
    }
  });

  it("страницата с оценката не обещава безрисков договор", () => {
    const src = read("src/pages/UploadedContract.tsx");
    expect(src).not.toMatch(/без рискове/);
    expect(src).not.toMatch(/безопасен за подпис/);
  });

  it("сигналът за актуалност е неутрален, а не категорично твърдение", () => {
    const src = read("src/pages/UploadedContract.tsx");
    expect(src).not.toMatch(/Договорът е променен след последния анализ/);
    // Текстът идва от общия помощник, който страницата ползва.
    expect(src).toMatch(/historicalFindingsNotice/);
    expect(read("src/lib/analysisSourceBinding.ts")).toMatch(/не описват задължително текущия текст/);
  });

  it("текстът при нула находки знае за актуалността на снимката", () => {
    for (const f of ["src/pages/UploadedContract.tsx", "src/components/console/panes/AnalysisPane.tsx"]) {
      expect(read(f), f).toMatch(/emptyIssuesMessage\([^)]*,\s*freshness\)/);
    }
    const helper = read("src/lib/analysisVerification.ts");
    expect(helper).toMatch(/emptyIssuesMessage\(\s*verification: unknown,\s*freshness: SnapshotFreshness/);
    // Изостанала снимка не твърди, че договорът е без находки.
    expect(helper).toMatch(/Това не описва задължително текущия текст/);
  });


  it("публичната страница /analyze не обещава липса на халюцинации или време под минута", () => {
    const src = read("src/pages/Analyze.tsx");
    expect(src).not.toMatch(/Без халюцинации/);
    expect(src).not.toMatch(/под 1 минута/);
    expect(src).toMatch(/Проверими цитати/);
  });
});

describe("edge конвейер", () => {
  const src = read("supabase/functions/analyze-contract/index.ts");

  it("правилата за доказателственост се добавят СЛЕД активния промпт от базата", () => {
    const active = src.indexOf("loadActivePrompt");
    const suffix = src.indexOf("${groundedSystemPrompt}${EVIDENCE_RULES_SUFFIX}");
    expect(active).toBeGreaterThan(-1);
    expect(suffix).toBeGreaterThan(active);
  });

  it("вграденият промпт не гарантира липса на рискове", () => {
    expect(src).not.toMatch(/балансиран, без рискове/);
  });

  it("записът минава единствено през общия конвейер", () => {
    expect(src).toMatch(/runAnalysisEvidencePipeline/);
    expect(src).toMatch(/summary: pipeline\.summary/);
    expect(src).toMatch(/issues: pipeline\.issues/);
    expect(src).not.toMatch(/verifiedIssues/);
  });

  it("метаданните не носят хеш на източника в обхвата на Q2a", () => {
    expect(src).not.toMatch(/sourceTextHash/);
    expect(read("supabase/functions/_shared/analysis-evidence.ts")).not.toMatch(/source_text_hash/);
    expect(read("drizzle/migrations/0014_analysis_verification.sql")).not.toMatch(/"source_text_hash"/);
  });
});

describe("липсващи клаузи — без твърдение за пълнота", () => {
  it("никога не казва, че всички клаузи присъстват", () => {
    const variants: Array<[unknown, "current" | "stale" | "unknown"]> = [
      [{ version: 1, evidence: { status: "evidence_checked", verified: 1, total: 1 } }, "current"],
      [{ version: 1, evidence: { status: "incomplete", verified: 0, total: 1 } }, "current"],
      [null, "current"],
      [null, "stale"],
      [null, "unknown"],
    ];
    for (const [verification, freshness] of variants) {
      const msg = emptyMissingClausesMessage(verification, freshness);
      expect(msg).not.toContain("Всички основни клаузи присъстват");
      expect(msg.length).toBeGreaterThan(10);
    }
  });

  it("при неактуален анализ казва изрично, че не описва текущия текст", () => {
    expect(emptyMissingClausesMessage(null, "stale")).toContain("текущия текст");
  });
});
