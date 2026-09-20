/**
 * ЕДНА структурирана редакция за ЦЕЛИЯ товар на поправката.
 *
 * Досега договорът и обратната връзка се редактираха с ОТДЕЛНИ повиквания и
 * картите се сливаха — два независими броя дават еднакви плейсхолдъри за РАЗНИ
 * хора (сблъсък). Отговорите от интервюто пък отиваха към модела НЕредактирани.
 *
 * Тук трите полета се редактират в ЕДНО повикване с обща карта, а разделянето
 * става по служебен разделител, който не може да се появи в потребителски текст.
 */

export const REFINE_FIELD_SEPARATOR = "\n<<<§DN-FIELD-BOUNDARY§>>>\n";

export interface RefinePayload {
  readonly contractJson: string;
  readonly feedback: string;
  readonly answersText: string;
}

export interface RefineRedaction {
  readonly contractJson: string;
  readonly feedback: string;
  readonly answersText: string;
  readonly mapping: Record<string, string>;
}

export type RedactFn = (
  text: string,
) => { redacted: string; mapping: Record<string, string> };

/** Отговорите се сериализират детерминирано и без сурови обекти. */
export function answersToText(answers: unknown): string {
  if (!answers || typeof answers !== "object") return "";
  return Object.entries(answers as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");
}

/**
 * ЕДИН каноничен източник от трите полета — за проверката за незаконно
 * съдържание и за класификацията. Никое поле не остава непроверено.
 */
export function buildRefineSource(payload: RefinePayload): string {
  return [
    `ДОГОВОР:\n${payload.contractJson}`,
    `ОБРАТНА ВРЪЗКА:\n${payload.feedback}`,
    `ОТГОВОРИ:\n${payload.answersText}`,
  ].join("\n");
}

export class RefineRedactionError extends Error {}

export function redactRefinePayload(
  payload: RefinePayload,
  redact: RedactFn | null,
): RefineRedaction {
  const fields = [payload.contractJson, payload.feedback, payload.answersText];
  if (fields.some((f) => f.includes(REFINE_FIELD_SEPARATOR))) {
    // Служебният разделител в потребителски товар е отказ ПРЕДИ таксуване.
    throw new RefineRedactionError("separator_in_payload");
  }
  if (!redact) {
    return {
      contractJson: payload.contractJson,
      feedback: payload.feedback,
      answersText: payload.answersText,
      mapping: {},
    };
  }
  const { redacted, mapping } = redact(fields.join(REFINE_FIELD_SEPARATOR));
  const parts = redacted.split(REFINE_FIELD_SEPARATOR);
  if (parts.length !== 3) {
    throw new RefineRedactionError("redaction_boundary_lost");
  }
  return {
    contractJson: parts[0],
    feedback: parts[1],
    answersText: parts[2],
    mapping,
  };
}
