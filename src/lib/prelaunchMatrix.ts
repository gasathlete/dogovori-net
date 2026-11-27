/**
 * Матрица на предварителния режим. „gated“ = липсва доказателство за готовност,
 * НЕ означава незаконно. „never_gated“ = права на субекта и вече възникнали
 * задължения — никога не се затварят.
 */
import type { PrelaunchFeature } from "@/lib/prelaunch";

export type PrelaunchStatus = "open_proven" | "gated" | "needs_audit" | "never_gated";

export interface MatrixRow {
  readonly target: string;
  readonly status: PrelaunchStatus;
  readonly feature?: PrelaunchFeature;
  readonly control: "client" | "server" | "client+server" | "none";
  readonly note: string;
}

/**
 * `control` описва САМО контрола в изходния код. Реалната готовност в разгърнатата
 * среда (env стойности, приложени миграции) НЕ е проверена.
 */
export const DEPLOYED_READINESS = "NOT_VERIFIED" as const;

export const PRELAUNCH_MATRIX: readonly MatrixRow[] = Object.freeze([
  { target: "/shablon/:slug, /catalog, /blog, /rechnik, /legal*", status: "open_proven", control: "none", note: "само публично съдържание" },
  { target: "Изтегли бланка с AI в Wizard (всички, вкл. абонати)", status: "gated", feature: "blank_download", control: "client+server", note: "Wizard: canStartNewProcessing преди invoke; download-blank: isNewProcessingOpen('download_blank') след записан replay, преди резервация (batch2 handler test)" },
  { target: "Генериране в Wizard/редактора (всички, вкл. абонати)", status: "gated", feature: "document_generation", control: "client+server", note: "Wizard и /build: canStartNewProcessing преди сериализация/invoke; generate-job/generate-contract/build-custom-contract/apply-corrections зад server-side флагове (default OFF); статус и точен replay на собствена задача остават достъпни" },
  { target: "Добави договор (нов текст: анализ или само запис)", status: "gated", feature: "document_review", control: "client+server", note: "UploadContractDialog спира преди хеш/сесия/запис; DB преградата 0044 е само подготвена (applied:false) — до прилагане пряк клиентски запис остава възможен" },
  { target: "Свързан документ от препратка", status: "gated", feature: "document_generation", control: "client", note: "ReferencePromptDialog спира преди навигация; контекстът не се слага в URL" },
  { target: "/analiz качване", status: "gated", feature: "document_review", control: "client+server", note: "Gate 8 + rollout флагове OFF" },
  { target: "/produkti/:slug/start", status: "gated", feature: "one_time_product", control: "client+server", note: "Frontend prepared; new LIVE checkout requires service-controlled public_products.live_enabled; sandbox remains staff-only" },
  { target: "/assistant (ново съобщение и прикачване)", status: "gated", feature: "assistant", control: "client+server", note: "sendMessage/handleFiles спират преди мрежа; assistant-chat: isNewProcessingOpen('assistant') (ASSISTANT_NEW_PROCESSING_ENABLED, default OFF), записан отговор се възпроизвежда" },
  { target: "Автоматичен запис на чернова (draft-sync)", status: "gated", feature: "document_generation", control: "client+server", note: "syncDraft спира преди мрежа (prelaunch_closed, локалното съдържание остава); draft-sync: DRAFT_SYNC_NEW_WRITE_ENABLED OFF преди тяло/auth/DB; възстановяване, присвояване и изтриване остават" },
  { target: "Ново/променено съдържание в запазени документи", status: "gated", feature: "document_generation", control: "client+server", note: "savedDocumentWriteGuard преди мрежа; download-document: DOCUMENT_CONTENT_SAVE_NEW_WRITE_ENABLED OFF за ВСЯКО ново съдържание независимо от kind (\"template\" не е доказателство; няма сървърна обвързаност с каталог); метаданни, повторно сваляне и възстановяване на версия остават; 0047 (неприложена) е DB преградата" },
  { target: "Пряко качване на файл в user-contracts", status: "gated", feature: "document_review", control: "server", note: "0046 (неприложена): ограничаващи INSERT/UPDATE политики за anon/authenticated; до прилагане пряк API запис остава възможен" },
  { target: "/assistant история и запазени отговори", status: "never_gated", control: "none", note: "съществуващ достъп до резултати" },
  { target: "/demo/*", status: "open_proven", control: "none", note: "статични демонстрации без обработка" },
  { target: "/tools/:slug", status: "open_proven", control: "none", note: "локални калкулатори без мрежа и AI" },
  { target: "/komplekti, /komplekti/:slug", status: "open_proven", control: "none", note: "каталог; стартът води до шаблоните, където генерирането е затворено" },
  { target: "нов абонамент/топъп (StripeEmbeddedCheckout)", status: "gated", feature: "subscription", control: "client+server", note: "не монтира Stripe; create-checkout: isNewProcessingOpen('subscription_checkout') (SUBSCRIPTION_CHECKOUT_ENABLED, default OFF), вкл. топъп" },
  { target: "строго отключване на документ", status: "gated", feature: "one_time_product", control: "client+server", note: "create-strict-unlock-checkout: isNewProcessingOpen('strict_unlock_checkout') (STRICT_UNLOCK_CHECKOUT_ENABLED, default OFF)" },
  { target: "delete-account", status: "never_gated", control: "server", note: "право на изтриване" },
  { target: "export-my-data", status: "never_gated", control: "server", note: "право на достъп/преносимост" },
  { target: "/unsubscribe, handle-email-unsubscribe", status: "never_gated", control: "server", note: "оттегляне на съгласие" },
  { target: "payments-webhook (вкл. реверси)", status: "never_gated", control: "server", note: "възникнали задължения" },
  { target: "customer-portal", status: "never_gated", control: "server", note: "управление на активен абонамент" },
  { target: "вход и запазени документи на съществуващи потребители", status: "never_gated", control: "none", note: "съществуващ достъп" },
  { target: "активен абонат: готов статичен шаблон (CompanionChip)", status: "never_gated", control: "client", note: "canUseFeature пропуска вече възникнало право само за статично сваляне без AI" },
]);
