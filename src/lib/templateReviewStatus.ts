/** Owner-selected public review status; not a finding of individual legal defects. */
export const CATALOG_REVIEW_STATUS = Object.freeze({
  badge: "В преработка",
  warning: "Този образец се преработва. Проверете внимателно преди подписване.",
  notice: "Каталогът е в преработка. Образците са достъпни за разглеждане. Проверете внимателно преди подписване.",
});

/** No slug, category or acceptance lookup: all canonical templates share this status. */
export function getTemplateReviewStatus() {
  return CATALOG_REVIEW_STATUS;
}
