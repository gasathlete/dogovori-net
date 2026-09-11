/**
 * Човешките български етикети за платения резултат. Техническите ключове остават
 * английски в данните; тук е единственото място, където се превеждат.
 */
import type {
  EconomicTermKind,
  ResultParty,
  SourceSpan,
} from "../../supabase/functions/_shared/product-result-contract";

export const PARTY_LABELS_BG: Record<ResultParty, string> = {
  you: "Вие",
  counterparty: "Отсрещната страна",
  both: "Двете страни",
  third_party: "Трето лице",
  unclear: "Не е ясно от текста",
};

export const ECONOMIC_KIND_LABELS_BG: Record<EconomicTermKind, string> = {
  amount: "Сума",
  date: "Дата",
  renewal: "Подновяване",
  notice: "Предизвестие",
  penalty: "Неустойка",
  interest: "Лихва",
};

export const TONE_LABELS_BG: Record<"neutral" | "firm", string> = {
  neutral: "Неутрално писмо",
  firm: "Твърдо писмо",
};

/** Мястото в документа с човешки думи: „Раздел 4, стр. 2“. */
export function spanPlaceBg(span: Pick<SourceSpan, "page" | "section">): string {
  const parts: string[] = [];
  if (span.section) parts.push(span.section);
  if (typeof span.page === "number") parts.push(`стр. ${span.page}`);
  return parts.length > 0 ? parts.join(", ") : "в текста на документа";
}
