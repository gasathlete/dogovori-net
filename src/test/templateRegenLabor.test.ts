/** Трудови кандидати (чл. 325, 326, 160, 173 КТ) — семантични проверки, не правно одобрение. */
import { describe, expect, it } from "vitest";
import { TEMPLATE_CANDIDATES } from "@/data/templateCandidates";
import { CONTENT_CANDIDATES } from "@/data/templateCandidates/content.v2";
import { assembleScenario } from "@/lib/templateRegen/assembly";
import { OFFICIAL_FORMS, sourceById } from "@/lib/templateRegen/sources";

const cand = (slug: string) => TEMPLATE_CANDIDATES.find((c) => c.slug === slug)!;
const scen = (slug: string, id: string) => cand(slug).scenarios.find((s) => s.id === id)!;
const faq = (slug: string) => CONTENT_CANDIDATES.find((c) => c.slug === slug)!.content.faq.map((f) => f.a).join("\n");

describe("чл. 326 КТ — предизвестие", () => {
  it("безсрочен: 30 дни / до 3 месеца; срочен: 3 месеца до оставащия срок", () => {
    expect(scen("molba-za-napuskane", "indefinite").text).toMatch(/30 ДНИ.*НЕ ПОВЕЧЕ ОТ 3 МЕСЕЦА/);
    expect(scen("molba-za-napuskane", "fixed_term").text).toMatch(/3 МЕСЕЦА, НО НЕ ПОВЕЧЕ ОТ ОСТАВАЩАТА ЧАСТ/);
  });
  it("срокът тече от деня след получаването; без изискване за разрешение", () => {
    const t = scen("molba-za-napuskane", "indefinite").text;
    expect(t).toContain("от деня, следващ получаването");
    expect(t).toContain("Не е необходимо разрешение на работодателя");
  });
  it("оттегляне след получаване изисква съгласие на работодателя, преди — не", () => {
    const t = scen("molba-za-napuskane", "withdrawal").text;
    expect(t).toMatch(/ПРЕДИ ИЛИ ЕДНОВРЕМЕННО[^\]]*не изисква съгласие/);
    expect(t).toMatch(/СЛЕД ПОЛУЧАВАНЕТО[\s\S]*само при съгласие на работодателя/);
  });
  it("материалноотчетническият режим е предпоставка, не тихо допускане", () => {
    expect(scen("molba-za-napuskane", "indefinite").preconditions?.join(" ")).toMatch(/материалноотчетническа/);
    const s = scen("molba-za-napuskane", "indefinite");
    const filled = Object.fromEntries([...s.text.matchAll(/\[([^\[\]]+)\]/g)].map((m) => [m[1], { state: "value" as const, value: "x" }]));
    const r = assembleScenario(cand("molba-za-napuskane"), s, filled, "personalized_final");
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") expect(r.unconfirmedPreconditions.join(" ")).toMatch(/материалноотчетническа/);
  });
  it("FAQ вече не казва „един месец“ и не приписва оттеглянето на ал. 3", () => {
    const a = faq("molba-za-napuskane");
    expect(a).not.toMatch(/един месец/);
    expect(a).not.toMatch(/чл\. 326, ал\. 3[^.]*оттегл/);
    expect(a).toContain("30 дни");
  });
});

describe("чл. 325, ал. 1, т. 1 КТ — взаимно съгласие", () => {
  it("предложението: писмено, 7 дни от получаване, мълчание = неприето", () => {
    for (const id of ["proposal_by_employer", "proposal_by_employee"]) {
      const t = scen("sporazumenie-za-prekratyavane-po-chl-325-al-1-t-1-kt", id).text;
      expect(t).toContain("7-дневен срок от получаването");
      expect(t).toContain("смята за неприето");
    }
  });
  it("споразумението няма признание за плащане или общ отказ", () => {
    const t = scen("sporazumenie-za-prekratyavane-po-chl-325-al-1-t-1-kt", "agreement").text;
    expect(t).toContain("не съдържа признание, че суми са платени");
    expect(t).toContain("не съдържа общ отказ");
  });
  it("FAQ не твърди „губи сила“ или „по-дълъг срок“", () => {
    const a = faq("sporazumenie-za-prekratyavane-po-chl-325-al-1-t-1-kt");
    expect(a).not.toMatch(/по-дълъг срок/);
    expect(a).toMatch(/смята за неприето|е неприето/);
  });
});

describe("чл. 160 и 173 КТ — отпуск", () => {
  it("двата вида са отделни сценарии с точно основание", () => {
    expect(scen("molba-zayavlenie-za-otpusk", "paid_annual").text).toContain("чл. 173, ал. 1");
    expect(scen("molba-zayavlenie-za-otpusk", "unpaid_general").text).toContain("чл. 160, ал. 1");
    expect(scen("molba-zayavlenie-za-otpusk", "paid_annual").text).not.toContain("чл. 160");
  });
  it("молбата не е разрешение", () => {
    for (const s of cand("molba-zayavlenie-za-otpusk").scenarios) expect(s.text).toContain("не означава разрешение");
  });
  it("FAQ: 30 работни дни стаж, без данъчни изводи; писмено разрешение по чл. 173", () => {
    const a = faq("molba-zayavlenie-za-otpusk");
    expect(a).toContain("До 30 работни дни");
    expect(a).toContain("Данъчни и осигурителни последици не се извеждат");
    expect(a).toContain("писмено разрешение");
  });
});

describe("provenance", () => {
  it("КТ е прочетен източник с уговорка за читателя; GDPR — неуспешен достъп", () => {
    expect(sourceById("kt-mlsp-2026-09-29")?.status).toBe("user_reported_read");
    expect(sourceById("kt-mlsp-2026-09-29")?.caveats.join(" ")).toMatch(/ChatGPT/);
    expect(sourceById("eurlex-gdpr-2026-10-19")?.status).toBe("access_failed");
  });
  it("образецът по чл. 410 ГПК е само частично прочетен", () => {
    const f = OFFICIAL_FORMS.find((x) => x.id === "gpk-410-form-2025-07-01")!;
    expect(f.status).toBe("partially_read_unverified");
    expect(f.fileUrl).toBe("https://kotel-rs.justice.bg/upload/125181/410.pdf");
  });
});
