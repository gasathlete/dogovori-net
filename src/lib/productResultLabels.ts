/**
 * Човешките български етикети за платения резултат. Техническите ключове остават
 * английски в данните; тук е единственото място, където се превеждат.
 */
import type {
  EconomicTermKind,
  ResultParty,
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
