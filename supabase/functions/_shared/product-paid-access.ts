/**
 * Точна проверка на достъпа до ЕДИН платен резултат.
 *
 * Използва се от функциите за избор по поправка и за уточнение. Изисква ТОЧНО
 * право по идентификатор — никога „последната поръчка на потребителя“ — и сверява
 * плащането, съгласията, версията на политиката и целия неизменен източник.
 * Общите операции/квоти НЕ се докосват: платеният продукт не харчи операции.
 */
import { PRODUCT_GENERATION_POLICY_VERSION } from "./product-generation-policy.ts";
import { requireProductSpec, type ProductPurchaseSpec } from "./product-purchase.ts";
import {
  PRODUCT_SOURCE_CHAR_UNIT,
  verifyStoredProductSource,
} from "./product-source.ts";
import {
  readyProductResult,
  type ProductResult,
  type ProductSourceBinding,
} from "./product-result-contract.ts";

export type PaidAccessCode =
  | "not_found"
  | "payment_unverified"
  | "policy_changed"
  | "processing"
  | "source_changed"
  | "result_invalid";

const MESSAGES: Readonly<Record<PaidAccessCode, string>> = Object.freeze({
  not_found: "Не намираме тази поръчка.",
  payment_unverified: "Плащането още не е потвърдено. Опитайте отново след минута.",
  policy_changed: "Правилата се промениха. Свържете се с нас за решение.",
  processing: "Обработваме документа. Ще видите резултата тук.",
  source_changed:
    "Документът е променен след плащането. Резултатът е обвързан с точния платен документ.",
  result_invalid: "Резултатът не може да се покаже. Свържете се с нас за решение.",
});

export function paidAccessMessage(code: PaidAccessCode): string {
  return MESSAGES[code];
}

export interface PaidAccessFailure {
  readonly ok: false;
  readonly code: PaidAccessCode;
  readonly status: number;
  readonly message: string;
}

export interface PaidAccessGranted {
  readonly ok: true;
  readonly entitlementId: string;
  readonly spec: ProductPurchaseSpec;
  readonly intakeContext: unknown;
  readonly policyVersion: string;
  readonly binding: ProductSourceBinding;
  readonly result: ProductResult;
  readonly resultRaw: unknown;
  /** Пълният нормализиран текст — само когато е поискан изрично. */
  readonly sourceText: string | null;
}

export type PaidAccess = PaidAccessGranted | PaidAccessFailure;

/** Минимална служебна граница: точният клиент се подава от функцията. */
// deno-lint-ignore no-explicit-any
export type PaidAccessDbClient = { from(table: string): any };

const deny = (code: PaidAccessCode, status: number): PaidAccessFailure =>
  Object.freeze({ ok: false as const, code, status, message: MESSAGES[code] });

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Връща готовия резултат само когато плащането, съгласията, заявката, политиката
 * и целият източник съвпадат точно. Всяко несъответствие е отказ, не поправка.
 */
export async function loadReadyPaidProduct(
  admin: PaidAccessDbClient,
  userId: string,
  entitlementId: string,
  options: {
    readonly withSourceText?: boolean;
    /**
     * Пътят след връщане от плащането подава ТОЧНАТА Stripe сесия. Тя трябва да
     * съвпада със сесията на правото — иначе достъпът е отказан. Никога не се
     * търси „последната поръчка“.
     */
    readonly expectedSessionId?: string;
  } = {},
): Promise<PaidAccess> {
  const { data: ent } = await admin
    .from("product_entitlements")
    .select(
      "id, user_id, product_id, status, result, result_schema_version, intake_id, stripe_session_id, stripe_price_id, stripe_price_lookup_key, stripe_event_id, paid_at, amount_cents, currency, environment, source_document_id, source_hash, source_updated_at, source_char_count, source_char_unit, source_kind, source_page_count, source_extraction_status, generation_policy_version",
    )
    .eq("id", entitlementId)
    .maybeSingle();
  if (!ent || ent.user_id !== userId) return deny("not_found", 404);
  if (
    typeof options.expectedSessionId === "string" &&
    options.expectedSessionId !== ent.stripe_session_id
  ) {
    return deny("not_found", 404);
  }

  const spec = requireProductSpec(ent.product_id);
  if (
    ent.amount_cents !== spec.amountCents ||
    String(ent.currency).toLowerCase() !== spec.currency ||
    ent.stripe_price_lookup_key !== spec.lookupKey ||
    !ent.stripe_price_id ||
    !ent.stripe_session_id ||
    !ent.stripe_event_id ||
    !ent.paid_at ||
    !ent.intake_id ||
    (ent.environment !== "live" && ent.environment !== "sandbox")
  ) {
    return deny("payment_unverified", 409);
  }

  // Доказателството идва по двойки: право И продуктов order snapshot по ТОЧНАТА
  // Stripe сесия. Без snapshot няма платена истина.
  const { data: snapshot } = await admin
    .from("order_snapshots")
    .select(
      "id, purchase_kind, product_id, payment_status, stripe_session_id, stripe_event_id, stripe_price_id, stripe_price_lookup_key, paid_at, product_intake_id, product_source_document_id, product_source_hash, product_source_updated_at, product_source_char_count, product_source_char_unit, product_source_kind, product_source_pages, product_source_extraction_status, environment, price_amount, currency, ai_notice_version, terms_accepted, immediate_performance_consent, withdrawal_loss_acknowledged, consent_recorded_at, tax_behavior, tax_amount_cents",
    )
    .eq("purchase_kind", "product")
    .eq("product_intake_id", ent.intake_id)
    .eq("stripe_session_id", ent.stripe_session_id)
    .maybeSingle();
  if (
    !snapshot ||
    snapshot.payment_status !== "paid" ||
    snapshot.product_id !== ent.product_id ||
    snapshot.stripe_event_id !== ent.stripe_event_id ||
    snapshot.stripe_price_id !== ent.stripe_price_id ||
    snapshot.stripe_price_lookup_key !== spec.lookupKey ||
    snapshot.price_amount !== spec.amountCents ||
    String(snapshot.currency).toLowerCase() !== spec.currency ||
    !snapshot.paid_at ||
    snapshot.environment !== ent.environment ||
    snapshot.product_source_document_id !== ent.source_document_id ||
    String(snapshot.product_source_hash).toLowerCase() !==
      String(ent.source_hash).toLowerCase() ||
    String(snapshot.product_source_updated_at) !== String(ent.source_updated_at) ||
    snapshot.product_source_char_count !== ent.source_char_count ||
    snapshot.product_source_char_unit !== ent.source_char_unit ||
    snapshot.product_source_kind !== ent.source_kind ||
    (snapshot.product_source_pages ?? null) !== (ent.source_page_count ?? null) ||
    snapshot.product_source_extraction_status !== "full" ||
    snapshot.terms_accepted !== true ||
    snapshot.immediate_performance_consent !== true ||
    snapshot.withdrawal_loss_acknowledged !== true ||
    !snapshot.consent_recorded_at ||
    (snapshot.tax_behavior !== null &&
      snapshot.tax_behavior !== undefined &&
      snapshot.tax_behavior !== "inclusive") ||
    (typeof snapshot.tax_amount_cents === "number" &&
      snapshot.tax_amount_cents > spec.amountCents)
  ) {
    return deny("payment_unverified", 409);
  }

  const { data: intake } = await admin
    .from("product_checkout_intakes")
    .select(
      "id, user_id, product_id, uploaded_contract_id, source_hash, source_updated_at, source_char_count, source_char_unit, source_kind, source_page_count, source_extraction_status, context, status, environment, generation_policy_version, amount_cents, currency, stripe_price_id, stripe_price_lookup_key, terms_version, privacy_version, refund_version, ai_notice_version, withdrawal_version, terms_accepted, ai_ack_accepted, immediate_performance_consent, withdrawal_loss_acknowledged",
    )
    .eq("id", ent.intake_id)
    .maybeSingle();
  const nonEmpty = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  if (
    !intake ||
    intake.user_id !== userId ||
    intake.product_id !== ent.product_id ||
    intake.status !== "paid" ||
    intake.environment !== ent.environment ||
    intake.uploaded_contract_id !== ent.source_document_id ||
    String(intake.source_hash).toLowerCase() !== String(ent.source_hash).toLowerCase() ||
    String(intake.source_updated_at) !== String(ent.source_updated_at) ||
    intake.source_char_count !== ent.source_char_count ||
    intake.source_char_unit !== ent.source_char_unit ||
    intake.source_kind !== ent.source_kind ||
    (intake.source_page_count ?? null) !== (ent.source_page_count ?? null) ||
    intake.source_extraction_status !== "full" ||
    intake.amount_cents !== spec.amountCents ||
    String(intake.currency).toLowerCase() !== spec.currency ||
    intake.stripe_price_lookup_key !== spec.lookupKey ||
    intake.stripe_price_id !== ent.stripe_price_id ||
    !nonEmpty(intake.terms_version) ||
    !nonEmpty(intake.privacy_version) ||
    !nonEmpty(intake.refund_version) ||
    !nonEmpty(intake.ai_notice_version) ||
    !nonEmpty(intake.withdrawal_version) ||
    intake.ai_notice_version !== snapshot.ai_notice_version ||
    intake.terms_accepted !== true ||
    intake.ai_ack_accepted !== true ||
    intake.immediate_performance_consent !== true ||
    intake.withdrawal_loss_acknowledged !== true
  ) {
    return deny("payment_unverified", 409);
  }

  const intakePolicy = intake.generation_policy_version;
  const entitlementPolicy = ent.generation_policy_version;
  if (
    typeof intakePolicy !== "string" ||
    typeof entitlementPolicy !== "string" ||
    intakePolicy !== entitlementPolicy ||
    intakePolicy !== PRODUCT_GENERATION_POLICY_VERSION
  ) {
    return deny("policy_changed", 409);
  }

  if (ent.status !== "ready") return deny("processing", 409);

  const binding: ProductSourceBinding = Object.freeze({
    document_id: ent.source_document_id,
    source_hash: String(ent.source_hash).toLowerCase(),
    source_kind: ent.source_kind,
    char_count: ent.source_char_count,
    char_unit: ent.source_char_unit,
    source_updated_at: String(ent.source_updated_at),
    page_count: ent.source_page_count ?? null,
  });
  const ready = readyProductResult(ent.result, binding, spec.id);
  if (ent.result_schema_version !== 2 || !ready.ok) return deny("result_invalid", 409);

  let sourceText: string | null = null;
  if (options.withSourceText === true) {
    const { data: doc } = await admin
      .from("uploaded_contracts")
      .select(
        "id, user_id, extracted_text, text_hash, updated_at, product_extraction_status, product_extracted_chars, product_source_pages, product_source_kind",
      )
      .eq("id", ent.source_document_id)
      .maybeSingle();
    if (!doc || doc.user_id !== userId) return deny("source_changed", 409);
    let verified;
    try {
      verified = await verifyStoredProductSource(doc, sha256Hex);
    } catch {
      return deny("source_changed", 409);
    }
    if (
      verified.sourceHash !== binding.source_hash ||
      String(verified.sourceUpdatedAt) !== binding.source_updated_at ||
      verified.sourceKind !== binding.source_kind ||
      verified.charCount !== binding.char_count ||
      verified.charUnit !== binding.char_unit ||
      binding.char_unit !== PRODUCT_SOURCE_CHAR_UNIT ||
      verified.pageCount !== binding.page_count
    ) {
      return deny("source_changed", 409);
    }
    sourceText = verified.text;
  }

  return Object.freeze({
    ok: true as const,
    entitlementId: String(ent.id),
    spec,
    intakeContext: intake.context,
    policyVersion: intakePolicy,
    binding,
    result: ready.result as unknown as ProductResult,
    resultRaw: ent.result,
    sourceText,
  });
}
