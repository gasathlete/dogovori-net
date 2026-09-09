/**
 * Q4b — ЕДИННА структурно безопасна редакция на СПИСЪК от полета.
 *
 * Историята: първоначално изходящите полета се слепваха с текстов разделител
 * (`\n␞␞␞\n`), после се редактираха наведнъж и се разделяха обратно. Това е
 * чупливо: PII шаблон, който стига до КРАЯ на полето (например телефон), може
 * да „изяде" следващия нов ред и разделянето да върне различен брой части →
 * `context_not_redactable` за напълно нормални имена/телефони/адреси.
 *
 * `generate-contract` вече беше поправен така: всяко поле се редактира ОТДЕЛНО,
 * но с ЕДИН общ мапинг и ЕДИН общ брояч на плейсхолдъри. Този модул изважда
 * логиката, за да я ползват ВСИЧКИ потоци (генератор и ревизия) без дублиране.
 *
 * Модулът е ЧИСТ: без мрежа, без база, без AI. Мапингът живее само в паметта на
 * заявката — никога не се логва и не се записва.
 */

import { redactForAI, type RedactionMapping } from "./redact.ts";

/** Служебен символ, който НЕ приемаме във входа (U+241E) — fail-closed. */
export const CONTROL_MARK = "\u241E";

/**
 * Плейсхолдъри, които САМИ генерираме. Ако вече присъстват във входа, не можем
 * да различим потребителски текст от наш маркер → отказваме безопасно.
 */
export const RESERVED_PLACEHOLDER_RE = /<(?:EMAIL|IBAN|ID_CARD|EGN|PHONE|ADDRESS|NAME)_\d+>/;

/** Временен маркер при пренумерирането — входът с него се отказва. */
const TEMP_MARK = "\u0000";

/** Полето е приемливо за редакция (без служебни символи и запазени маркери). */
export function isRedactableField(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.includes(CONTROL_MARK)) return false;
  if (v.includes(TEMP_MARK)) return false;
  if (RESERVED_PLACEHOLDER_RE.test(v)) return false;
  return true;
}

export interface RedactedFields {
  parts: string[];
  mapping: RedactionMapping;
}

/**
 * Редактира всяко поле поотделно, но с ЕДИН общ мапинг и ЕДИН общ брояч на
 * плейсхолдъри:
 *   - една и съща стойност навсякъде → ЕДИН и същ плейсхолдър;
 *   - различни стойности → РАЗЛИЧНИ плейсхолдъри;
 *   - границите на полетата са структурни (масив), не текстови → PII в края на
 *     поле не може да „прелее" в следващото.
 * Връща `null` при непроходим вход (fail-closed).
 */
export function redactFieldsWithSharedMapping(fields: readonly string[]): RedactedFields | null {
  if (!Array.isArray(fields)) return null;
  const mapping: RedactionMapping = {};
  const byValue = new Map<string, string>();
  const counters = new Map<string, number>();
  const parts: string[] = [];

  for (const field of fields) {
    if (!isRedactableField(field)) return null;
    const local = redactForAI(field);
    let text = local.redacted;
    const temps: Array<[string, string]> = [];
    // Дълги плейсхолдъри първи (<EMAIL_10> преди <EMAIL_1>).
    const placeholders = Object.keys(local.mapping).sort((a, b) => b.length - a.length);
    placeholders.forEach((ph, i) => {
      const cut = ph.lastIndexOf("_");
      if (cut < 1) return;
      const prefix = ph.slice(1, cut);
      const value = local.mapping[ph];
      const key = `${prefix}\u0001${value}`;
      let global = byValue.get(key);
      if (!global) {
        const n = (counters.get(prefix) ?? 0) + 1;
        counters.set(prefix, n);
        global = `<${prefix}_${n}>`;
        byValue.set(key, global);
        mapping[global] = value;
      }
      const temp = `${TEMP_MARK}${i}${TEMP_MARK}`;
      text = text.split(ph).join(temp);
      temps.push([temp, global]);
    });
    for (const [temp, global] of temps) text = text.split(temp).join(global);
    if (text.includes(TEMP_MARK)) return null;
    parts.push(text);
  }

  if (parts.length !== fields.length) return null;
  if (!parts.every((p): p is string => typeof p === "string")) return null;
  return { parts, mapping };
}
