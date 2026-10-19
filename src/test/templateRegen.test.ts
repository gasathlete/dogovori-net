/**
 * Регенериране на каталога: оригинали срещу кандидати v2 (доклад 01, 12.10.2026).
 * Семантични асерции; без снапшоти. Тестовете НЕ доказват правна коректност.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import origNotice from "@/data/templateDrafts/predizvestie-za-prekratyavane-na-naem";
import origProtocol from "@/data/templateDrafts/priemo-predavatelen-protokol";
import origMutual from "@/data/templateDrafts/sporazumenie-za-prekratyavane-na-naem-po-vzaimno-saglasie";
import origParking from "@/data/templateDrafts/dogovor-za-naem-na-parkomyasto-garazh";
import origEood from "@/data/templateDrafts/uchreditelen-akt-na-eood";
import { TEMPLATE_CANDIDATES } from "@/data/templateCandidates";
import { bracketImbalance, scanTemplateText } from "@/lib/templateRegen/catalogChecks";
import { validateCapital } from "@/lib/templateRegen/capital";
import { assembleScenario } from "@/lib/templateRegen/assembly";
import { buildRegistry } from "@/lib/templateRegen/registry";
import { allTemplates } from "@/lib/templateIndex";

const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
const ORIGINALS: Record<string, string> = {
  "predizvestie-za-prekratyavane-na-naem": origNotice,
  "priemo-predavatelen-protokol": origProtocol,
  "sporazumenie-za-prekratyavane-na-naem-po-vzaimno-saglasie": origMutual,
  "dogovor-za-naem-na-parkomyasto-garazh": origParking,
  "uchreditelen-akt-na-eood": origEood,
};
const cand = (slug: string) => TEMPLATE_CANDIDATES.find((c) => c.slug === slug)!;
const scen = (slug: string, id: string) => cand(slug).scenarios.find((s) => s.id === id)!.text;
const rules = (t: string) => new Set(scanTemplateText(t).map((f) => f.ruleId));

describe("каталожните проверки откриват дефектите от доклада в оригиналите", () => {
  it("01: чл. 228 ал. 2, чл. 232, „Желая“, разменени роли", () => {
    const r = rules(origNotice);
    for (const id of ["ZZD_228_PARA2", "ZZD_232_RETURN", "WISH_INSTEAD_OF_DECLARATION", "ROLE_SWAP_RETURN_REQUEST"]) expect(r.has(id), id).toBe(true);
  });
  it("03: чл. 325 ЗЗД (двете места), признание за плащане, общ отказ от претенции", () => {
    expect(scanTemplateText(origMutual).filter((f) => f.ruleId === "ZZD_325_TERMINATION")).toHaveLength(2);
    const r = rules(origMutual);
    expect(r.has("AUTOMATIC_PAYMENT_ADMISSION")).toBe(true);
    expect(r.has("BLANKET_WAIVER")).toBe(true);
    expect(r.has("PERSON_COMPANY_MIXED_PARTY")).toBe(true);
  });
  it("04: повредено поле за дата", () => expect(rules(origParking).has("MALFORMED_DATE_FIELD")).toBe(true));
  it("05: чл. 154 за учредяване, чл. 113 ал. 2, отговорност до капитала, OOD, екземпляри", () => {
    const r = rules(origEood);
    for (const id of ["TZ_154_FOUNDING", "TZ_113_PARA2", "OWNER_LIABILITY_TO_CAPITAL", "EOOD_LATIN_OOD", "UNILATERAL_COPIES_PER_PARTY"]) expect(r.has(id), id).toBe(true);
    // чл. 154, ал. 1 в чл. 8 (прекратяване) не е грешка
    expect(scanTemplateText(origEood).filter((f) => f.ruleId === "TZ_154_FOUNDING")).toHaveLength(1);
  });
  it("находката носи точна извадка от източника", () => {
    const f = scanTemplateText(origMutual).find((x) => x.ruleId === "ZZD_325_TERMINATION")!;
    expect(origMutual.replace(/\s+/g, " ")).toContain(f.excerpt);
  });
});

describe("кандидатите v2", () => {
  it("са вързани към точния непроменен оригинал и не носят правно одобрение", () => {
    expect(TEMPLATE_CANDIDATES).toHaveLength(5);
    for (const c of TEMPLATE_CANDIDATES) {
      expect(c.baseSourceSha256, c.slug).toBe(sha(ORIGINALS[c.slug]));
      expect(c.legalApproval).toBeNull();
      expect(c.inheritsHistoricalAcceptance).toBe(false);
      expect(c.status).toBe("candidate_draft");
      for (const b of c.legalBases) expect(b.status).toMatch(/unverified$/);
    }
  });
  it("всеки сценарий минава всички каталожни правила, има балансирани полета и решаващите полета съществуват", () => {
    for (const c of TEMPLATE_CANDIDATES) for (const s of c.scenarios) {
      expect(scanTemplateText(s.text).map((f) => f.ruleId), `${c.slug}/${s.id}`).toEqual([]);
      expect(bracketImbalance(s.text), `${c.slug}/${s.id}`).toBe(0);
      for (const f of s.decisiveFields) expect(s.text.includes(`[${f}]`), `${c.slug}/${s.id}: ${f}`).toBe(true);
    }
  });

  it("01: четири основания × две роли с различен правен механизъм", () => {
    const c = cand("predizvestie-za-prekratyavane-na-naem");
    expect(c.scenarios.map((s) => s.id).sort()).toEqual(["contractual.landlord", "contractual.tenant", "expiry.landlord", "expiry.tenant", "indefinite.landlord", "indefinite.tenant", "rescission.landlord", "rescission.tenant"]);
    const S = "predizvestie-za-prekratyavane-na-naem";
    expect(scen(S, "indefinite.landlord")).toMatch(/На основание чл\. 238 ЗЗД/);
    expect(scen(S, "contractual.tenant")).not.toMatch(/чл\. 238/);
    expect(scen(S, "expiry.landlord")).toMatch(/противопоставям на продължаване на ползването/);
    expect(scen(S, "rescission.landlord")).toMatch(/ще считам Договора за развален/);
    expect(scen(S, "rescission.landlord")).toMatch(/допълнителен срок/);
    expect(scen(S, "rescission.landlord")).not.toMatch(/чл\. 233/);
    expect(scen(S, "indefinite.tenant")).toMatch(/Ще освободя и върна имота/);
    expect(scen(S, "indefinite.tenant")).not.toMatch(/Моля да освободите/);
    expect(scen(S, "indefinite.landlord")).toMatch(/Моля да освободите и върнете имота/);
    for (const s of c.scenarios) {
      expect(s.text).not.toMatch(/лична карта|ЕКАТТЕ|ТИТУЛ|оглед/i);
      expect(s.text).toMatch(/не добавя условие за действие/);
    }
  });

  it("02: отделни сценарии; частично приемане и плащането не се удостоверява", () => {
    const S = "priemo-predavatelen-protokol";
    expect(cand(S).scenarios.map((s) => s.id)).toEqual(["lease_handover", "lease_return", "goods", "works"]);
    expect(scen(S, "works")).toMatch(/Неприета част и причина/);
    expect(scen(S, "works")).toMatch(/не замества нормативно изискуемите строителни актове/);
    expect(scen(S, "lease_return")).toMatch(/не се описва като пълно връщане/);
    for (const s of cand(S).scenarios) {
      expect(s.text).toMatch(/Отразяването ѝ не удостоверява плащане/);
      expect(s.text).toMatch(/не съдържа самостоятелен отказ от права, признание за извършено плащане/);
      expect(s.text).not.toMatch(/по основанието по чл\. 1/);
    }
  });

  it("03: правилно основание, отделен разчет, депозит без безсрочно задържане", () => {
    const S = "sporazumenie-za-prekratyavane-na-naem-po-vzaimno-saglasie";
    const same = scen(S, "same_date"), diff = scen(S, "different_dates");
    expect(same).toMatch(/чл\. 20а, ал\. 2 ЗЗД/);
    expect(same).not.toMatch(/325/);
    expect(same).toMatch(/Безспорният остатък се връща/);
    expect(same).toMatch(/липсата на двустранен протокол сама по себе си не означава/);
    expect(same).toMatch(/единствено следните конкретни вземания: \[ОПИСАНИЕ И НАЧИН НА УРЕЖДАНЕ \/ „НЯМА“\]/);
    expect(same).not.toMatch(/РЕЖИМ НА ПОЛЗВАНЕ/);
    expect(diff).toMatch(/до действителното връщане/);
  });

  it("04: реална част със схема, подновяване съвместимо с прекратяване, конкретни неустойки", () => {
    const S = "dogovor-za-naem-na-parkomyasto-garazh";
    const rp = scen(S, "real_part"), g = scen(S, "garage");
    expect(rp).toMatch(/реална част.*Приложение № 1/s);
    expect(g).not.toMatch(/реална част/);
    for (const t of [rp, g]) {
      expect(t).toMatch(/когато договорът не е продължен съгласно чл\. 2, ал\. 2/);
      expect(t).not.toMatch(/което и да е друго задължение/);
      expect(t).not.toMatch(/окончателното уреждане на дължимите суми/);
      expect(t).toMatch(/Самото изпращане не се приравнява на доказано получаване/);
      expect(t).toMatch(/не се счита за неплатен наем/);
      expect(t).toMatch(/ще счита договора за развален/);
    }
  });

  it("05: основания, срок, отговорност, публичен препис без ЕГН", () => {
    const S = "uchreditelen-akt-na-eood";
    const full = scen(S, "full"), pub = scen(S, "public_copy");
    expect(full).toMatch(/на основание чл\. 113, чл\. 114, ал\. 3 и чл\. 115 от Търговския закон/);
    expect(full).toMatch(/\[НЕОПРЕДЕЛЕН СРОК \/ СРОК ДО \[ДАТА\]\]/);
    expect(full).toMatch(/не отговаря лично за тях единствено поради качеството си/);
    expect(full).toMatch(/EOOD/);
    expect(full).toMatch(/чл\. 154, ал\. 1 ТЗ/);
    expect(full).toMatch(/ЕГН/);
    expect(pub).not.toMatch(/ЕГН/);
    expect(pub).toMatch(/ЗАЛИЧЕНИ/);
  });
});

describe("капиталова аритметика (05)", () => {
  it("приема съгласувани стойности и отхвърля несъгласувани", () => {
    expect(validateCapital({ capitalEur: 1, sharesCount: 100, shareNominalEur: 0.01 })).toEqual([]);
    expect(validateCapital({ capitalEur: 2500, sharesCount: 250, shareNominalEur: 10 })).toEqual([]);
    expect(validateCapital({ capitalEur: 0.5, sharesCount: 50, shareNominalEur: 0.01 })).toContain("capital_below_minimum");
    expect(validateCapital({ capitalEur: 1, sharesCount: 3, shareNominalEur: 0.33 })).toContain("product_mismatch");
    expect(validateCapital({ capitalEur: 1.005, sharesCount: 1, shareNominalEur: 1.005 })).toContain("capital_not_cent_precise");
    expect(validateCapital({ capitalEur: 1, sharesCount: 0, shareNominalEur: 1 })).toContain("shares_count_invalid");
  });
});

describe("сглобяване от модули", () => {
  const s = cand("uchreditelen-akt-na-eood").scenarios[1];
  const all = Object.fromEntries(s.decisiveFields.map((f) => [f, { state: "value" as const, value: "X" }]));
  it("„Не знам“ блокира окончателен документ и не става „не“", () => {
    const r = assembleScenario(s, { ...all, "ФИРМА": { state: "unknown" } }, "personalized_final");
    expect(r).toEqual({ status: "blocked", missingDecisive: [], unknownDecisive: ["ФИРМА"] });
    const blank = assembleScenario(s, { "ФИРМА": { state: "unknown" } }, "blank");
    expect(blank.status).toBe("blank");
    if (blank.status === "blank") expect(blank.text).toContain("[ФИРМА]");
  });
  it("липсващо решаващо поле блокира; бланка запазва маркираните полета", () => {
    const r = assembleScenario(s, {}, "personalized_final");
    expect(r.status).toBe("blocked");
    const b = assembleScenario(s, {}, "blank");
    if (b.status === "blank") expect(b.openFields).toContain("КАПИТАЛ В EUR");
  });
  it("пълни отговори → готов; свободна AI клауза → чернова за преглед", () => {
    expect(assembleScenario(s, all, "personalized_final").status).toBe("final_ready");
    expect(assembleScenario(s, all, "personalized_final", ["Чл. 11. Нова клауза."]).status).toBe("draft_review_required");
  });
});

describe("регистър и изолация", () => {
  const reg = JSON.parse(fs.readFileSync(path.resolve("reports/template-regen/registry.json"), "utf8"));
  it("покрива точно каноничния каталог и няма автоматично одобрение", () => {
    expect(reg.totals.catalogEntries).toBe(allTemplates().length);
    expect(reg.totals.legallyApprovedCandidates).toBe(0);
    expect(reg.entries.every((e: { candidateLegalApproval: unknown; status: string }) => e.candidateLegalApproval === null && !/approved/.test(e.status))).toBe(true);
    const rewritten = reg.entries.filter((e: { scope: string }) => e.scope === "rewritten");
    for (const e of rewritten) expect(e.status).toBe("rewritten_candidate_pending_legal_review");
    expect(new Set(rewritten.map((e: { draftSlug: string }) => e.draftSlug)).size).toBe(5);
  });
  it("промяна на оригинала обезсилва кандидата и маркира комплекта", () => {
    const c = cand("uchreditelen-akt-na-eood");
    const r = buildRegistry({
      date: "t", candidates: [c], allDraftSlugs: [c.slug],
      kits: [{ id: "k", items: [{ docName: "Учредителен акт на ЕООД" }] }],
      inputs: [{ catalogName: "Учредителен акт на ЕООД", categoryId: "korp", catalogSlug: c.slug, draftSlug: c.slug, sourceSha256: "0".repeat(64), text: origEood }],
    });
    expect(r.entries[0].status).toBe("candidate_stale_source_changed");
    expect(r.kits[0].status).toBe("needs_recheck");
  });
  it("публичните страници и wizard-ът не зареждат кандидатите", () => {
    const hits: string[] = [];
    const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (!/(test|templateCandidates|templateRegen|templateDrafts)$/.test(p)) walk(p); }
      else if (/\.tsx?$/.test(f.name) && fs.readFileSync(p, "utf8").includes("templateCandidates")) hits.push(p);
    } };
    walk(path.resolve("src"));
    expect(hits).toEqual([]);
  });
});

describe("предпоставки", () => {
  it("непотвърдена безсрочност блокира окончателното предизвестие по чл. 238", () => {
    const s = cand("predizvestie-za-prekratyavane-na-naem").scenarios.find((x) => x.id === "indefinite.landlord")!;
    const vals = Object.fromEntries(s.decisiveFields.map((f) => [f, { state: "value" as const, value: "X" }]));
    const r = assembleScenario(s, { ...vals, [s.preconditions![0]]: { state: "unknown" } }, "personalized_final");
    expect(r.status).toBe("blocked");
  });
});

import { CONTENT_CANDIDATES } from "@/data/templateCandidates/content.v2";
import { LEGAL_SOURCES, sourceById, sourcesCovering } from "@/lib/templateRegen/sources";
import { assertCandidateOutputPath, buildEvidencePacket, buildGenerationPrompt, candidateOutputPath } from "@/lib/templateRegen/generationPlan";
import cNotice from "@/data/templateContent/predizvestie-za-prekratyavane-na-naem";
import cMutual from "@/data/templateContent/sporazumenie-za-prekratyavane-na-naem-po-vzaimno-saglasie";
import cParking from "@/data/templateContent/dogovor-za-naem-na-parkomyasto-garazh";
import cEood from "@/data/templateContent/uchreditelen-akt-na-eood";

const flat = (c: object) => JSON.stringify(c);

describe("пояснения (FAQ) — оригинали срещу кандидати", () => {
  it("правилата откриват дефектите в текущите пояснения", () => {
    expect(rules(flat(cNotice)).has("ZZD_228_NOTICE_TERM")).toBe(true);
    expect(rules(flat(cNotice)).has("MOVABLE_THREE_DAYS")).toBe(true);
    expect(rules(flat(cMutual)).has("ZZD_229_AS_FORM_RULE")).toBe(true);
    expect(rules(flat(cParking)).has("ZZD_229_AS_FORM_RULE")).toBe(true);
    for (const id of ["TZ_115_PARA2", "MIN_CAPITAL_NOT_ONE_EUR", "COMPANY_ARISES_WITH_ACT"]) expect(rules(flat(cEood)).has(id), id).toBe(true);
  });
  it("кандидатите нямат находки, не са одобрени и цитират само реални източници", () => {
    expect(CONTENT_CANDIDATES).toHaveLength(4);
    for (const c of CONTENT_CANDIDATES) {
      expect([...rules(flat(c.content))], c.slug).toEqual([]);
      expect(c.legalApproval).toBeNull();
      for (const ids of Object.values(c.sourceIds)) for (const id of ids) expect(sourceById(id)?.status, id).toBe("owner_read");
    }
    const e = CONTENT_CANDIDATES.find((c) => c.slug === "uchreditelen-akt-na-eood")!.content;
    expect(flat(e)).toMatch(/1 евро, а минималната стойност на дял — 1 евроцент/);
    expect(e.intro).toMatch(/възниква с вписването/);
    const n = flat(CONTENT_CANDIDATES[0].content);
    expect(n).toMatch(/чл\. 238 ЗЗД/);
    expect(n).not.toMatch(/три дни/);
  });
  it("останалите въпроси и оригиналите остават непроменени", () => {
    const c = CONTENT_CANDIDATES.find((x) => x.slug === "uchreditelen-akt-na-eood")!.content;
    expect(c.faq).toHaveLength(cEood.faq.length);
    expect(cEood.faq.some((f) => /2 евро/.test(f.a))).toBe(true);
  });
});

describe("източници", () => {
  it("недостъпният източник не покрива нищо и бъдещите текстове са отбелязани", () => {
    expect(sourceById("justice-gov-2026-10-19")!.status).toBe("access_failed");
    expect(sourcesCovering("ЗЗД 238").length).toBeGreaterThan(0);
    expect(sourcesCovering("ТЗ 67")).toHaveLength(0);
    expect(sourceById("tz-mi-apis-2026-07-31")!.caveats.join(" ")).toMatch(/02\.04\.2027.*НЕ се приемат/);
  });
});

describe("evidence-aware генериране", () => {
  const packet = buildEvidencePacket({ kind: "draft", catalogName: "Учредителен акт на ЕООД", slug: "uchreditelen-akt-na-eood", sourceSha256: sha(origEood), originalText: origEood, findings: scanTemplateText(origEood), kits: ["registratsiya-na-eood"] });
  it("отказва запис в производствения каталог и извън кандидатите", () => {
    for (const bad of ["src/data/templateDrafts/x.ts", "src/data/templateDrafts/index.ts", "src/data/templateContent/x.ts", "reports/template-regen/generated/../../src/x.ts", "tmp/x.json"]) {
      expect(() => assertCandidateOutputPath(bad), bad).toThrow();
    }
    expect(candidateOutputPath("draft", "uchreditelen-akt-na-eood", sha(origEood))).toMatch(/^reports\/template-regen\/generated\/draft\/uchreditelen-akt-na-eood\.[0-9a-f]{12}\.json$/);
    expect(() => candidateOutputPath("draft", "../x", sha(origEood))).toThrow();
  });
  it("prompt-ът носи доказателствата, без персона, опит или целева дължина", () => {
    const { system, user } = buildGenerationPrompt(packet);
    expect(user).toContain(sha(origEood));
    expect(user).toContain("TZ_154_FOUNDING");
    expect(user).toContain(origEood.slice(0, 200));
    expect(user).toContain("kik-info.com/normativna-baza/kodeksi/tz");
    expect(user).not.toContain("justice.government.bg");
    expect(system + user).not.toMatch(/години опит|\d{3,5}\s*символа|юрист с/);
    expect(system).toMatch(/Дължината следва нуждата/);
    expect(system).toMatch(/не се публикува автоматично/);
  });
  it("без оригинален текст или hash не се генерира", () => {
    expect(() => buildEvidencePacket({ ...packet, originalText: " " })).toThrow("missing_original_text");
    expect(() => buildEvidencePacket({ ...packet, sourceSha256: "x" })).toThrow("missing_source_hash");
  });
  it("старите генератори по заглавие са изведени от употреба", async () => {
    for (const f of ["gen-drafts-for-catalog.ts", "generate-template-content.ts"]) {
      const src = fs.readFileSync(path.resolve("scripts", f), "utf8");
      expect(src).not.toMatch(/writeFileSync|templateDrafts\/index/);
      expect(src).toMatch(/process\.exit\(1\)/);
    }
    expect(LEGAL_SOURCES.length).toBeGreaterThan(0);
  });
});
