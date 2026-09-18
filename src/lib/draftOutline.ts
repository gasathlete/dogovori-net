/**
 * Скрит преглед на данните, с които документът ще бъде изготвен.
 *
 * Използва се на екрана за потвърждение: вместо празна спирачка човекът вижда
 * какво точно е попълнил и къде има липси. Личните данни НЕ се показват в
 * явен вид — стойността се маскира локално, в браузъра, без нищо да се
 * изпраща навън и без да се променя самата заявка.
 */

export interface DraftOutlineLine {
  /** Етикет на полето, както го вижда потребителят. */
  label: string;
  /** Показваната стойност — маскирана, ако е личен данн. */
  value: string;
  /** Дали стойността е скрита. */
  masked: boolean;
  /** Дали полето е празно (липсва отговор). */
  empty: boolean;
}

const PERSONAL_KEY =
  /egn|eik|iban|bulstat|phone|telefon|email|mail|address|adres|passport|lk_|id_card|име|адрес|телефон|имейл|егн|лична карта|банкова сметка/i;

const EGN = /\b\d{10}\b/;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{8,}\b/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /(\+359|0)\s?\d[\d\s-]{7,}/;

/** Маскира стойност, ако съдържа личен данн или полето е лично по име. */
export function maskDraftValue(label: string, id: string, raw: string): { value: string; masked: boolean } {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return { value: "", masked: false };
  const personalField = PERSONAL_KEY.test(`${id} ${label}`);
  const personalValue = EGN.test(value) || IBAN.test(value) || EMAIL.test(value) || PHONE.test(value);
  if (!personalField && !personalValue) {
    return { value: value.length > 160 ? `${value.slice(0, 157)}…` : value, masked: false };
  }
  const visible = value.slice(0, 2);
  return { value: `${visible}${"•".repeat(Math.min(8, Math.max(3, value.length - 2)))}`, masked: true };
}

/**
 * Съставя прегледа. Показва и празните полета, за да е ясно какво остава да се
 * попълни — това е информация, която потребителят вече е въвел или не е.
 */
export function buildDraftOutline(
  entries: ReadonlyArray<{ id: string; label?: string; value?: string }>,
  limit = 14,
): DraftOutlineLine[] {
  const lines: DraftOutlineLine[] = [];
  for (const entry of entries) {
    if (lines.length >= limit) break;
    const label = (entry.label ?? entry.id).trim();
    if (!label || label.length > 120) continue;
    const raw = (entry.value ?? "").trim();
    if (!raw) {
      lines.push({ label, value: "не е попълнено", masked: false, empty: true });
      continue;
    }
    const { value, masked } = maskDraftValue(label, entry.id, raw);
    lines.push({ label, value, masked, empty: false });
  }
  return lines;
}

/** Колко от прегледа е попълнен — за честен текст „готово е X от Y“. */
export function outlineCompletion(lines: readonly DraftOutlineLine[]): { filled: number; total: number } {
  return { filled: lines.filter((l) => !l.empty).length, total: lines.length };
}
