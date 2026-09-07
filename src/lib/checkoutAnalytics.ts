/**
 * Помощници за каноничното събитие `checkout_started`.
 *
 * Семантика: събитието означава реално създадена Stripe checkout сесия
 * (embedded checkout или strict unlock), а не клик върху карта с план.
 * Така /admin/metrics „checkout completion“ = completed / started е смислен.
 */

/**
 * Извлича { plan, billing } от логическия price id
 * ("professional_monthly" → professional/monthly, "topup_50" → topup_50/one_time).
 * Никога не връща PII — само технически етикети.
 */
export function describePriceId(priceId?: string): { plan: string; billing: string } {
  if (!priceId) return { plan: "unknown", billing: "unknown" };
  if (priceId === "team_seat_yearly") return { plan: "team", billing: "yearly" };
  const m = /^(.*)_(monthly|yearly)$/.exec(priceId);
  if (m) return { plan: m[1], billing: m[2] };
  if (priceId.startsWith("topup_")) return { plan: priceId, billing: "one_time" };
  if (priceId === "five_operations") return { plan: "five_operations", billing: "one_time" };
  if (priceId === "single_contract") return { plan: "single_contract", billing: "one_time" };
  if (priceId === "strict_doc_unlock") return { plan: "strict_unlock", billing: "one_time" };
  if (priceId.startsWith("branding")) return { plan: "branding", billing: "one_time" };
  return { plan: priceId.slice(0, 40), billing: "unknown" };
}

/**
 * Ограничена таксономия на причините за неуспешен checkout.
 * Никога не изпращаме суровото съобщение за грешка — само една от тези стойности.
 */
export type CheckoutFailureCategory =
  | "price_not_found"
  | "price_mismatch"
  | "unauthorized"
  | "network"
  | "stripe"
  | "unknown";

export const CHECKOUT_FAILURE_CATEGORIES: readonly CheckoutFailureCategory[] = [
  "price_not_found",
  "price_mismatch",
  "unauthorized",
  "network",
  "stripe",
  "unknown",
] as const;

/**
 * Свежда произволна грешка (вкл. текст от сървър) до ограничена категория.
 * Резултатът е винаги един от `CHECKOUT_FAILURE_CATEGORIES` — така в метриките
 * не може да изтече свободен текст, имейл или идентификатор.
 */
export function categorizeCheckoutError(err: unknown): CheckoutFailureCategory {
  const raw = (() => {
    if (!err) return "";
    if (typeof err === "string") return err;
    if (err instanceof Error) return err.message ?? "";
    const m = (err as { message?: unknown }).message;
    return typeof m === "string" ? m : "";
  })().toLowerCase();

  if (!raw) return "unknown";
  if (/(not configured|price not found|липсва цена|not_configured)/.test(raw)) return "price_not_found";
  if (/(mismatch|unexpected amount|различна цена|не съвпада)/.test(raw)) return "price_mismatch";
  if (/(unauthorized|401|403|forbidden|не сте влезли)/.test(raw)) return "unauthorized";
  if (/(failed to fetch|networkerror|network error|timeout|econn|offline|load failed)/.test(raw)) return "network";
  if (/(stripe|checkout session|client secret|clientsecret)/.test(raw)) return "stripe";
  return "unknown";
}

/* ==================================================================== */
/*  Затворен описател на платената фуния (Stage 2b1)                     */
/* ==================================================================== */

/**
 * Видове покупки. Затворен списък: всяка непозната/подправена стойност става
 * `unknown`, за да не може URL параметър да произведе произволен етикет в
 * аналитиката.
 */
export const PURCHASE_KINDS = [
  "subscription",
  "entry_pack",
  "topup",
  "strict_unlock",
  "branding",
  "team",
  "unknown",
] as const;
export type PurchaseKind = (typeof PURCHASE_KINDS)[number];

/** Позволени логически lookup ключове (вкл. поддържаните исторически pro_*). */
export const CHECKOUT_PRICE_KEYS = [
  "professional_monthly",
  "professional_yearly",
  "entrepreneur_monthly",
  "entrepreneur_yearly",
  "pro_monthly",
  "pro_yearly",
  "team_seat_yearly",
  "five_operations",
  "topup_5",
  "topup_20",
  "topup_50",
  "topup_100",
  "strict_doc_unlock",
  "branding_unlock_once",
] as const;
export type CheckoutPriceKey = (typeof CHECKOUT_PRICE_KEYS)[number];

/** Позволени етикети за произход на плащането. */
export const CHECKOUT_SOURCES = [
  "account_subscription",
  "strict_paywall",
  "topup",
  "branding",
  "team",
  "plans",
  "embedded",
  "unknown",
] as const;
export type CheckoutSource = (typeof CHECKOUT_SOURCES)[number];

export function parseCheckoutPriceKey(raw: unknown): CheckoutPriceKey | "unknown" {
  return typeof raw === "string" && (CHECKOUT_PRICE_KEYS as readonly string[]).includes(raw)
    ? (raw as CheckoutPriceKey)
    : "unknown";
}

export function parseCheckoutSource(raw: unknown): CheckoutSource {
  return typeof raw === "string" && (CHECKOUT_SOURCES as readonly string[]).includes(raw)
    ? (raw as CheckoutSource)
    : "unknown";
}

export function parsePurchaseKind(raw: unknown): PurchaseKind {
  return typeof raw === "string" && (PURCHASE_KINDS as readonly string[]).includes(raw)
    ? (raw as PurchaseKind)
    : "unknown";
}

/** Логически price key → вид покупка (затворено съпоставяне). */
export function purchaseKindForPrice(key: CheckoutPriceKey | "unknown"): PurchaseKind {
  switch (key) {
    case "professional_monthly":
    case "professional_yearly":
    case "entrepreneur_monthly":
    case "entrepreneur_yearly":
    case "pro_monthly":
    case "pro_yearly":
      return "subscription";
    case "team_seat_yearly":
      return "team";
    case "five_operations":
      return "entry_pack";
    case "topup_5":
    case "topup_20":
    case "topup_50":
    case "topup_100":
      return "topup";
    case "strict_doc_unlock":
      return "strict_unlock";
    case "branding_unlock_once":
      return "branding";
    default:
      return "unknown";
  }
}

export interface CheckoutDescriptor {
  kind: PurchaseKind;
  plan: string;
  billing: string;
  source: CheckoutSource;
}

/**
 * Общ адрес за връщане след плащане — един маршрут за всички платени пътища.
 *
 * Безопасен по конструкция: `redirect` се проверява ВЪТРЕ в помощника през
 * `sanitizeReturnPath` спрямо подадения origin, така че извикващите места не
 * са задължени да го чистят предварително — абсолютни, протокол-относителни,
 * обратно-наклонени и управляващи варианти просто не се добавят.
 *
 * Ключово: заместителят `{CHECKOUT_SESSION_ID}` остава буквален (Stripe го
 * заменя), затова не минава през URL кодиране.
 */
export function buildCheckoutReturnUrl(input: {
  origin: string;
  priceId?: string;
  source?: string;
  /** Произволен вход: чисти се вътре и се добавя само ако е безопасен път. */
  redirect?: string | null;
  /** Историческо: единствената допустима стойност е `strict_unlock`. */
  legacyType?: "strict_unlock";
}): string {
  const price = parseCheckoutPriceKey(input.priceId);
  const source = parseCheckoutSource(input.source);
  const parts = [
    "session_id={CHECKOUT_SESSION_ID}",
    `price_id=${price}`,
    `source=${source}`,
  ];
  if (input.legacyType === "strict_unlock") parts.push("type=strict_unlock");
  const redirect = sanitizeReturnPath(input.redirect, { origin: input.origin });
  if (redirect) parts.push(`redirect=${encodeURIComponent(redirect)}`);
  return `${input.origin}/checkout/return?${parts.join("&")}`;
}


/**
 * Чете описателя от query параметрите на връщането. Само през allowlist —
 * подправена стойност никога не става етикет в аналитиката.
 */
export function describeCheckoutReturn(params: URLSearchParams): CheckoutDescriptor {
  const price = parseCheckoutPriceKey(params.get("price_id"));
  const source = parseCheckoutSource(params.get("source"));
  const legacyStrict = params.get("type") === "strict_unlock";
  const kind = (() => {
    const fromPrice = purchaseKindForPrice(price);
    if (fromPrice !== "unknown") return fromPrice;
    if (legacyStrict) return "strict_unlock" as PurchaseKind;
    return parsePurchaseKind(params.get("kind"));
  })();
  const described = price === "unknown"
    ? legacyStrict
      ? { plan: "strict_unlock", billing: "one_time" }
      : { plan: "unknown", billing: "unknown" }
    : describePriceId(price);
  return { kind, plan: described.plan, billing: described.billing, source };
}

/**
 * Детерминистичен, необратим кратък токен от Stripe session id — служи само за
 * клиентска идемпотентност. Суровият идентификатор НЕ се съхранява никъде.
 */
export function compactSessionToken(sessionId: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < sessionId.length; i++) {
    const c = sessionId.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0;
    h1 = (h1 * 0x01000193) >>> 0;
    h2 = (h2 + c * (i + 1)) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
    h2 = (h2 * 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}
