/**
 * Regression guard — актуално право за извънсъдебно решаване на спорове.
 *
 * Бившата платформа на ЕК за онлайн решаване на спорове (ОРС/ODR) е прекратена
 * на 20 юли 2025 г. с Регламент (ЕС) 2024/3228. Правните страници трябва:
 *  - да не сочат към https://ec.europa.eu/consumers/odr и Регламент 524/2013;
 *  - да не носят стария адрес на КЗП (пл. „Славейков“) и таван „25 000 лв.“;
 *  - да сочат към помирителната дейност на КЗП и портала EU Consumer Redress;
 *  - да не твърдят, че текущият портал на ЕК приема/подава жалби;
 *  - да имат историческа бележка (дата + регламент) само веднъж, в LegalIndex.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const LEGAL_DIR = path.resolve(__dirname, "../pages/legal");

const FILES = {
  LegalIndex: "LegalIndex.tsx",
  ProviderInfo: "ProviderInfo.tsx",
  Refund: "Refund.tsx",
  Terms: "Terms.tsx",
} as const;

type FileKey = keyof typeof FILES;

const SRC: Record<FileKey, string> = Object.fromEntries(
  (Object.keys(FILES) as FileKey[]).map((k) => [
    k,
    fs.readFileSync(path.join(LEGAL_DIR, FILES[k]), "utf8"),
  ]),
) as Record<FileKey, string>;

const KEYS = Object.keys(FILES) as FileKey[];

// Официални адреси — точно както са публикувани.
const KZP_ADR_URL = "https://kzp.bg/bg/pomiritelna-deynost";
const EC_REDRESS_URL = "https://consumer-redress.ec.europa.eu/index_bg";
const EC_ADR_LIST_URL =
  "https://consumer-redress.ec.europa.eu/list-alternative-dispute-resolution-adr-bodies_en?prefLang=bg";
const EC_RELOCATION_URL = "https://consumer-redress.ec.europa.eu/site-relocation_bg";
const EURLEX_2024_3228_URL = "https://eur-lex.europa.eu/eli/reg/2024/3228/oj";

const OLD_ODR_URL = "https://ec.europa.eu/consumers/odr";

function count(haystack: string, needle: string | RegExp): number {
  if (typeof needle === "string") return haystack.split(needle).length - 1;
  const flags = needle.flags.includes("g") ? needle.flags : needle.flags + "g";
  return (haystack.match(new RegExp(needle.source, flags)) ?? []).length;
}

/** Всички <a …> тагове, чийто href съдържа даден фрагмент. */
function anchorsWithHref(src: string, hrefFragment: string): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m[0].includes(hrefFragment)) out.push(m[0]);
  }
  return out;
}

describe("Извънсъдебно решаване на спорове — актуално право", () => {
  it("нито един правен файл не сочи към прекратената ОРС платформа на ЕК", () => {
    for (const k of KEYS) {
      expect(SRC[k], `${FILES[k]} съдържа стария ODR адрес`).not.toContain(OLD_ODR_URL);
      expect(SRC[k]).not.toMatch(/ec\.europa\.eu\/consumers\/odr/i);
    }
  });

  it("няма активна препратка към Регламент (ЕС) 524/2013", () => {
    for (const k of KEYS) {
      expect(SRC[k], `${FILES[k]} все още цитира 524/2013`).not.toMatch(/524\s*\/\s*2013/);
    }
  });

  it("няма стар адрес на КЗП (пл. „Славейков“) и няма непроверен таван „25 000 лв.“", () => {
    for (const k of KEYS) {
      expect(SRC[k], `${FILES[k]} носи стария адрес`).not.toMatch(/Славейков/);
      expect(SRC[k], `${FILES[k]} носи стария таван`).not.toMatch(/25\s?000\s*лв/);
      // без изобретени такси/тавани в АРС секциите
      expect(SRC[k]).not.toMatch(/безплатн[ао]\s+процедур/i);
    }
  });

  it("всички четири файла сочат към помирителната дейност на КЗП и портала EU Consumer Redress", () => {
    for (const k of KEYS) {
      expect(SRC[k], `${FILES[k]} няма KZP ADR URL`).toContain(KZP_ADR_URL);
      expect(SRC[k], `${FILES[k]} няма EC Consumer Redress URL`).toContain(EC_REDRESS_URL);
      expect(SRC[k], `${FILES[k]} няма списък на органите за АРС`).toContain(EC_ADR_LIST_URL);
    }
  });

  it("новите външни връзки се отварят в нов таб с rel=\"noopener noreferrer\"", () => {
    const fragments = [
      "kzp.bg/bg/pomiritelna-deynost",
      "consumer-redress.ec.europa.eu",
      "eur-lex.europa.eu/eli/reg/2024/3228",
    ];
    for (const k of KEYS) {
      for (const frag of fragments) {
        for (const a of anchorsWithHref(SRC[k], frag)) {
          expect(a, `${FILES[k]}: ${a}`).toMatch(/target="_blank"/);
          expect(a, `${FILES[k]}: ${a}`).toMatch(/rel="noopener noreferrer"/);
        }
      }
    }
  });

  it("актуалният контакт на КЗП е ул. „Врабча“ № 1 с официалните телефони", () => {
    for (const k of ["ProviderInfo", "Refund"] as const) {
      expect(SRC[k]).toMatch(/София 1000/);
      expect(SRC[k]).toMatch(/ул\. „Врабча“ № 1, ет\. 3–5/);
      expect(SRC[k]).toMatch(/02 933 05 65/);
      expect(SRC[k]).toMatch(/0700 111 22 \/ \*2211/);
    }
  });

  it("историческата бележка (20 юли 2025 + Регламент 2024/3228) е точно веднъж и само в LegalIndex", () => {
    const li = SRC.LegalIndex;
    expect(count(li, "20 юли 2025")).toBe(1);
    expect(count(li, "Регламент (ЕС) 2024/3228")).toBe(1);
    expect(count(li, EURLEX_2024_3228_URL)).toBe(1);
    expect(count(li, EC_RELOCATION_URL)).toBe(1);
    expect(li).toMatch(/прекратена на 20 юли 2025 г\./);

    for (const k of ["ProviderInfo", "Refund", "Terms"] as const) {
      expect(SRC[k], `${FILES[k]} дублира историческата бележка`).not.toMatch(/2024\/3228/);
      expect(SRC[k]).not.toMatch(/20 юли 2025/);
    }
  });

  it("„ОРС/ODR“ остава единствено в историческата бележка; активната терминология е АРС/ADR", () => {
    // LegalIndex: една историческа употреба на „ОРС“ (в скоби до ODR)
    expect(count(SRC.LegalIndex, "ОРС")).toBe(1);
    expect(SRC.LegalIndex).toMatch(/\(ОРС\/ODR\)\s+беше прекратена/);
    for (const k of ["ProviderInfo", "Refund", "Terms"] as const) {
      expect(SRC[k], `${FILES[k]} все още ползва „ОРС“`).not.toMatch(/\bОРС\b/);
      expect(SRC[k]).not.toMatch(/\bODR\b/);
    }
    for (const k of KEYS) {
      expect(SRC[k]).toMatch(/АРС/);
      expect(SRC[k]).toMatch(/решаване на спорове \(АРС\)/);
    }
  });

  it("никъде не се твърди, че текущият портал на ЕК приема/получава/подава жалби", () => {
    const forbidden: RegExp[] = [
      // „порталът приема жалби“, „порталът получава жалба“, „порталът разглежда спор“
      /портал[а-я]*\s+(?:на\s+ЕК\s+)?(?:приема|получава|разглежда|решава)\s+(?:жалб|спор)/i,
      // „подаване на жалба през/чрез портала/платформата“
      /подава(?:не|те|)\s+(?:на\s+)?(?:жалб|спор)[а-я]*\s+(?:през|чрез|в|на)\s+(?:портал|платформ)/i,
      // „жалба през портала“
      /жалб[а-я]*\s+(?:през|чрез)\s+(?:портал|платформ)/i,
      // „платформа за онлайн решаване“ като актуална услуга (извън историческата бележка)
      /(?:достъп до|използва(?:те|йте)?)\s+европейската платформа/i,
    ];
    for (const k of KEYS) {
      for (const re of forbidden) {
        expect(SRC[k], `${FILES[k]} съответства на ${re}`).not.toMatch(re);
      }
    }
    // Изрично уточнение, че процедурата е пред органа за АРС, а не през портала.
    for (const k of KEYS) {
      expect(SRC[k]).toMatch(/(?:пред\s+(?:съответния|избрания)\s+орган за АРС)/);
    }
  });

  it("Refund: чиповете с правно основание не съдържат 524/2013, а Terms пази платежната истина", () => {
    const basisMatch = SRC.Refund.match(/basis=\{\[([^\]]*)\]\}/);
    expect(basisMatch).not.toBeNull();
    const basis = basisMatch![1];
    expect(basis).not.toMatch(/524/);
    expect(basis).not.toMatch(/ОРС/);
    expect(basis).toMatch(/АРС/);

    // Непроменени части на Terms
    expect(SRC.Terms).toMatch(/10\. Рекламации/);
    expect(SRC.Terms).toMatch(/12\. Изкуствен интелект/);
    expect(SRC.Terms).toMatch(/чрез отделен чек-бокс при плащане/);
  });
});
