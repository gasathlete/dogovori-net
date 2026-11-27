/**
 * Сървърна граница за ПРОИЗХОДА на източника на платен продукт.
 *
 * `verifyStoredProductSource` доказва САМО вътрешна съгласуваност на записаното
 * от браузъра (нормализиран текст, SHA-256, брой знаци, статус, вид). Това НЕ е
 * доверено извличане: браузърът може да запише съгласуван, но неистински текст.
 * Независим бекенд мост (сървърно извличане/атестация на произхода) НЕ съществува
 * в този код. Затова новото плащане, новата обработка и новото уточнение са
 * затворени тук, независимо от всички env флагове.
 *
 * Тази граница НЕ е проверка на извличането — тя е изрично затваряне на
 * наследения път. Преди пускане трябва да бъде заменена с проверено независимо
 * обвързване на източника (атестация от сървърно извличане), с тестове.
 *
 * Не се чете от env, заявка, база или тяло: няма начин да бъде включена извън
 * промяна на този изходен код, преглед и нови тестове.
 */
export const PRODUCT_TRUSTED_SOURCE_BRIDGE = Object.freeze({
  available: false as const,
  kind: "legacy_client_consistency_only" as const,
  replacementRequired:
    "verified independent backend source binding/attestation before release",
});

export type ProductTrustedSourceCode = "trusted_source_unavailable";

/** Връща затворения код, докато няма независим мост. Винаги детерминистично. */
export function productTrustedSourceBlockers(): readonly ProductTrustedSourceCode[] {
  return PRODUCT_TRUSTED_SOURCE_BRIDGE.available ? [] : ["trusted_source_unavailable"];
}
