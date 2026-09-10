/**
 * Съгласията при плащане — едно място за версиите и за честния прочит.
 *
 * Правилото е просто: сървърът никога не записва съгласие, което не е получил.
 * Няма стойности по подразбиране „true“.
 */

export const LEGAL_VERSIONS = Object.freeze({
  terms: "2026-09-01",
  privacy: "2026-09-01",
  withdrawal: "2026-09-01",
  refund: "2026-09-01",
  aiNotice: "2026-09-01",
});

export interface ConsentTruth {
  /** Приети Общи условия и Политика за поверителност. */
  readonly termsAccepted: boolean;
  /** Потвърдено: резултатът е автоматичен и не е юридически съвет. */
  readonly aiAckAccepted: boolean;
  /** Изрично искане изпълнението да започне веднага. */
  readonly immediatePerformanceConsent: boolean;
  /** Потвърдено: след започване на изпълнението правото на отказ се губи. */
  readonly withdrawalLossAcknowledged: boolean;
}

const isTrue = (v: unknown): boolean => v === true;

/** Честен прочит без изисквания — ползва се от заварения create-checkout. */
export function readConsent(body: Record<string, unknown> | null | undefined): ConsentTruth {
  const b = body ?? {};
  return {
    termsAccepted: isTrue(b.termsAccepted),
    aiAckAccepted: isTrue(b.aiAckAccepted),
    immediatePerformanceConsent: isTrue(b.immediatePerformanceConsent),
    withdrawalLossAcknowledged: isTrue(b.withdrawalLossAcknowledged),
  };
}

export class ConsentMissingError extends Error {
  readonly reason = "consent_required";
  constructor() {
    super("consent_required");
    this.name = "ConsentMissingError";
  }
}

/**
 * Продуктовата покупка изисква четирите потвърждения поотделно и изрично.
 * Липсващо или false съгласие спира покупката преди Stripe.
 */
export function requireProductConsent(
  body: Record<string, unknown> | null | undefined,
): ConsentTruth {
  const consent = readConsent(body);
  if (
    !consent.termsAccepted ||
    !consent.aiAckAccepted ||
    !consent.immediatePerformanceConsent ||
    !consent.withdrawalLossAcknowledged
  ) {
    throw new ConsentMissingError();
  }
  return consent;
}

/** Метаданни за Stripe/snapshot — само истината, като низове. */
export function consentMetadata(consent: ConsentTruth): Record<string, string> {
  return {
    terms_version: LEGAL_VERSIONS.terms,
    privacy_version: LEGAL_VERSIONS.privacy,
    withdrawal_version: LEGAL_VERSIONS.withdrawal,
    refund_version: LEGAL_VERSIONS.refund,
    ai_notice_version: LEGAL_VERSIONS.aiNotice,
    terms_accepted: String(consent.termsAccepted),
    ai_ack_accepted: String(consent.aiAckAccepted),
    immediate_performance_consent: String(consent.immediatePerformanceConsent),
    withdrawal_loss_acknowledged: String(consent.withdrawalLossAcknowledged),
  };
}

/**
 * Позволените origin-и за return URL — точен списък на собствените адреси.
 * Няма шаблон „кой да е *.lovable.app“ и никога не приемаме цял URL от клиента.
 */
export const ALLOWED_RETURN_ORIGINS: readonly string[] = Object.freeze([
  "https://dogovori.net",
  "https://www.dogovori.net",
  "https://dogovori-net.lovable.app",
  "https://id-preview--6b2da12e-e1d6-4f97-8549-b632fb66ddd1.lovable.app",
  "http://localhost:8080",
]);

/** Основният адрес, от който градим продуктовите return пътища. */
export const DEFAULT_PRODUCT_ORIGIN = "https://dogovori.net";

export class ReturnUrlError extends Error {
  readonly reason = "invalid_return_url";
  constructor() {
    super("invalid_return_url");
    this.name = "ReturnUrlError";
  }
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

/**
 * Изгражда return URL от ТОЧЕН собствен адрес и фиксиран път. Външен или
 * непознат адрес се отказва.
 */
export function buildProductReturnUrl(origin: unknown, path: string): string {
  if (typeof origin !== "string") throw new ReturnUrlError();
  const normalized = normalizeOrigin(origin);
  if (!ALLOWED_RETURN_ORIGINS.includes(normalized)) throw new ReturnUrlError();
  if (!path.startsWith("/")) throw new ReturnUrlError();
  return `${normalized}${path}`;
}

/**
 * Каноничният return адрес за продуктова покупка: взима конфигурирания адрес
 * на приложението, ако е в точния списък, иначе основния публичен адрес.
 * Никога не зависи от заглавие или тяло на заявката.
 */
export function productReturnUrl(configuredBase: string | undefined, path: string): string {
  const base = configuredBase ? normalizeOrigin(configuredBase) : "";
  const origin = ALLOWED_RETURN_ORIGINS.includes(base) ? base : DEFAULT_PRODUCT_ORIGIN;
  return buildProductReturnUrl(origin, path);
}

