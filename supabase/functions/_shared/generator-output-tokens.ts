/**
 * Граница на изхода на генератора: служебните маркери за лични данни НЕ бива
 * да напускат generate-contract (review-document ги отказва с право чрез
 * RESERVED_PLACEHOLDER_RE).
 *
 * Един проход върху всеки текстов лист:
 *   1) точен маркер от мапинга на заявката (гол или в [ ]) → оригиналната стойност;
 *   2) разпознат, но НЕкартиран маркер за лични данни (измислен от модела,
 *      гол/в скоби/с номер/със сол) → видимо поле за попълване, напр. [ЕГН];
 *   3) всичко останало (суми, дати, клаузи, непознати маркери) — непроменено.
 * Възстановените стойности не се сканират повторно (единичен replace callback).
 * Модулът е чист — мапингът не се логва и не се записва.
 */
import type { RedactionMapping } from "./redact.ts";

export const PERSONAL_TOKEN_LABELS: Readonly<Record<string, string>> = {
  EMAIL: "[Имейл]",
  IBAN: "[IBAN]",
  ID_CARD: "[Лична карта №]",
  EGN: "[ЕГН]",
  PHONE: "[Телефон]",
  ADDRESS: "[Адрес]",
  NAME: "[Име]",
  EIC: "[ЕИК]",
};

const TOKEN_RE =
  /\[?<(EMAIL|IBAN|ID_CARD|EGN|PHONE|ADDRESS|NAME|EIC)(?:_\d+)?(?:_[a-z0-9]+)?>\]?/g;

export function finalizeServiceTokens(text: string, mapping: RedactionMapping): string {
  if (typeof text !== "string" || !text) return text;
  const map = mapping ?? {};
  return text.replace(TOKEN_RE, (match: string, prefix: string) => {
    const core = match.replace(/^\[/, "").replace(/\]$/, "");
    if (Object.prototype.hasOwnProperty.call(map, core)) {
      const restored = map[core];
      // Скоби само около маркера се махат; несдвоени скоби се запазват.
      const lead = match.startsWith("[") && !match.endsWith("]") ? "[" : "";
      const trail = match.endsWith("]") && !match.startsWith("[") ? "]" : "";
      return lead + restored + trail;
    }
    const label = PERSONAL_TOKEN_LABELS[prefix];
    const lead = match.startsWith("[") && !match.endsWith("]") ? "[" : "";
    const trail = match.endsWith("]") && !match.startsWith("[") ? "]" : "";
    return lead + label + trail;
  });
}

/**
 * Моделът понякога връща двойно екранирани нови редове („\\n“ като два знака),
 * които се показват буквално в документа и експорта. Превръщат се в реални.
 */
export function normalizeEscapedNewlines(text: string): string {
  if (typeof text !== "string" || !text.includes("\\")) return text;
  return text.replace(/\\r\\n|\\n/g, "\n");
}

/** Прилага finalizeServiceTokens към всички текстови листа (ключовете не се пипат). */
export function finalizeGeneratedOutput<T>(value: T, mapping: RedactionMapping): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return finalizeServiceTokens(normalizeEscapedNewlines(v), mapping);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}
