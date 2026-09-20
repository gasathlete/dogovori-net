/**
 * СТРУКТУРИРАНА РЕДАКЦИЯ НА ПОЛЕТА.
 *
 * Старият подход слепваше полета с празен ред и после ги разделяше обратно по
 * разделител — при многоредови указания това разместваше съдържанието. Тук
 * всички полета минават през ЕДНА обща карта на заместванията (за да е
 * разкриването обратимо и без колизии), но се разделят по контролен разделител,
 * който предварително се премахва от входа и затова не може да се появи в него.
 */

import { redactForAI, type RedactionMapping } from "./redact.ts";

/** Контролни символи, които се изчистват от входа, за да е разделителят уникален. */
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const SEP = "\u0000\u0001\u0000";

export interface StructuredRedaction<K extends string> {
  readonly fields: Record<K, string>;
  readonly mapping: RedactionMapping;
  readonly stats: Record<string, number>;
}

export function sanitizeControlChars(value: string): string {
  return String(value ?? "").replace(CONTROL_RE, " ");
}

export function redactFields<K extends string>(input: Record<K, string>): StructuredRedaction<K> {
  const keys = Object.keys(input) as K[];
  const cleaned = keys.map((k) => sanitizeControlChars(input[k]));
  const { redacted, mapping, stats } = redactForAI(cleaned.join(SEP));
  const parts = redacted.split(SEP);
  const fields = {} as Record<K, string>;
  keys.forEach((k, i) => {
    fields[k] = parts[i] ?? "";
  });
  return { fields, mapping, stats };
}
