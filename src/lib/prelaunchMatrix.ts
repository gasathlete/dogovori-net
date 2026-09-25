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

export const PRELAUNCH_MATRIX: readonly MatrixRow[] = Object.freeze([
  { target: "/shablon/:slug, /catalog, /blog, /rechnik, /legal*", status: "open_proven", control: "none", note: "само публично съдържание" },
  { target: "Изтегли бланка (нов потребител)", status: "gated", feature: "blank_download", control: "client", note: "download-blank е пряко достъпен — сървърна проверка предстои" },
  { target: "Генериране в редактора (нов потребител)", status: "gated", feature: "document_generation", control: "client", note: "generate-job пряко достъпен" },
  { target: "/analiz качване", status: "gated", feature: "document_review", control: "client+server", note: "Gate 8 + rollout флагове OFF" },
  { target: "/produkti/:slug/start", status: "gated", feature: "one_time_product", control: "client+server", note: "ONE_TIME_PURCHASES_AVAILABLE=false" },
  { target: "/assistant (ново съобщение и прикачване)", status: "gated", feature: "assistant", control: "client", note: "sendMessage/handleFiles спират преди мрежа; assistant-chat е пряко достъпен — сървърен флаг предстои" },
  { target: "/assistant история и запазени отговори", status: "never_gated", control: "none", note: "съществуващ достъп до резултати" },
  { target: "/demo/*", status: "open_proven", control: "none", note: "статични демонстрации без обработка" },
  { target: "/tools/:slug", status: "open_proven", control: "none", note: "локални калкулатори без мрежа и AI" },
  { target: "/komplekti, /komplekti/:slug", status: "open_proven", control: "none", note: "каталог; стартът води до шаблоните, където генерирането е затворено" },
  { target: "нов абонамент/топъп (StripeEmbeddedCheckout)", status: "gated", feature: "subscription", control: "client", note: "не монтира Stripe; create-checkout е пряко достъпен" },
  { target: "строго отключване на документ", status: "gated", feature: "one_time_product", control: "client", note: "create-strict-unlock-checkout е пряко достъпен" },
  { target: "delete-account", status: "never_gated", control: "server", note: "право на изтриване" },
  { target: "export-my-data", status: "never_gated", control: "server", note: "право на достъп/преносимост" },
  { target: "/unsubscribe, handle-email-unsubscribe", status: "never_gated", control: "server", note: "оттегляне на съгласие" },
  { target: "payments-webhook (вкл. реверси)", status: "never_gated", control: "server", note: "възникнали задължения" },
  { target: "customer-portal", status: "never_gated", control: "server", note: "управление на активен абонамент" },
  { target: "вход и запазени документи на съществуващи потребители", status: "never_gated", control: "none", note: "съществуващ достъп" },
  { target: "активен абонат: бланки и генериране", status: "never_gated", control: "client", note: "canUseFeature пропуска вече възникнало право" },
]);
