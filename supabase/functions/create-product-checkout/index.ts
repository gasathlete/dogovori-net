/**
 * Плащане за точно един еднократен продукт, обвързан с точно един документ.
 *
 * Отделна функция, за да не се смесва с абонаментния/legacy checkout:
 * тук няма промокодове, няма операции и няма кредити.
 *
 * Правилото е едно: истината се проверява на сървъра. Браузърът не задава
 * сума, цена, адрес за връщане или пълнота на документа.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { createStripeClient } from "../_shared/stripe.ts";
import { resolveOrCreateCustomer } from "../_shared/customer.ts";
import { buildCors } from "../_shared/cors.ts";
import {
  SandboxForbiddenError,
  assertEnvironmentAllowed,
  sandboxForbiddenResponse,
} from "../_shared/sandbox-guard.ts";
import {
  ProductPurchaseError,
  requireProductPrice,
  requireProductSpec,
} from "../_shared/product-purchase.ts";
import {
  PRODUCT_SOURCE_CHAR_UNIT,
  ProductSourceError,
  verifyStoredProductSource,
} from "../_shared/product-source.ts";
import {
  ProductContextError,
  sameProductContext,
  validateProductContext,
} from "../_shared/product-intake-context.ts";
import { evaluateProductEligibility } from "../_shared/product-eligibility.ts";
import { PRODUCT_GENERATION_POLICY_VERSION } from "../_shared/product-generation-policy.ts";
import {
  ConsentMissingError,
  LEGAL_VERSIONS,
  ReturnUrlError,
  productReturnUrl,
  requireProductConsent,
} from "../_shared/purchase-consent.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Точно тези полета се приемат в тялото. Непознато поле е отказ. */
const ALLOWED_BODY_KEYS = Object.freeze([
  "productId",
  "uploadedContractId",
  "requestId",
  "environment",
  "context",
  "termsAccepted",
  "aiAckAccepted",
  "immediatePerformanceConsent",
  "withdrawalLossAcknowledged",
]);

class RequestShapeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RequestShapeError";
  }
}

function assertKnownKeys(body: Record<string, unknown>) {
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.includes(key)) throw new RequestShapeError("unknown_field");
  }
}

/** SHA-256 върху точно нормализирания текст — същият вход като в браузъра. */
async function sha256HexServer(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fail(code: string, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return fail("unauthorized", 401, corsHeaders);
    const token = authHeader.slice("Bearer ".length);

    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await asUser.auth.getUser(token);
    if (userErr || !userData?.user) return fail("unauthorized", 401, corsHeaders);
    const userId = userData.user.id;
    const email = userData.user.email ?? undefined;

    const parsed = await req.json().catch(() => null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("invalid_body", 400, corsHeaders);
    }
    const body = parsed as Record<string, unknown>;
    assertKnownKeys(body);

    const { productId, uploadedContractId, requestId, environment } = body as {
      productId: string;
      uploadedContractId: string;
      requestId: string;
      environment: "sandbox" | "live";
    };

    if (environment !== "sandbox" && environment !== "live") {
      return fail("invalid_environment", 400, corsHeaders);
    }
    // Сървърен кран: продуктовото плащане е ЗАТВОРЕНО по подразбиране и се
    // включва изрично с конфигурация. Не се разчита на скриване в интерфейса.
    const checkoutBlockers = productCheckoutBlockers(
      readProductIntegrationConfig((key) => Deno.env.get(key)),
      environment,
    );
    if (checkoutBlockers.length > 0) {
      const code = checkoutBlockers[0];
      return new Response(
        JSON.stringify({ error: code, message: productIntegrationMessage(code) }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!UUID_RE.test(String(uploadedContractId))) return fail("invalid_document", 400, corsHeaders);
    if (!UUID_RE.test(String(requestId))) return fail("invalid_request_id", 400, corsHeaders);

    const spec = requireProductSpec(productId);
    const consent = requireProductConsent(body);
    const context = validateProductContext(body.context, spec.id);
    // Адресът за връщане е фиксиран и НИКОГА не идва от заявката.
    const returnUrl = productReturnUrl(
      Deno.env.get("APP_BASE_URL") ?? undefined,
      `/produkti/rezultat?session_id={CHECKOUT_SESSION_ID}&type=product&product=${spec.id}`,
    );

    // Sandbox плащанията дават реален entitlement — само за staff.
    await assertEnvironmentAllowed(asUser, environment, userId);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Документът трябва да е на този потребител, текстът да е ЦЯЛ и хешът да
    // съвпада с преизчисления тук. Твърденията на браузъра не са доказателство.
    const { data: doc } = await admin
      .from("uploaded_contracts")
      .select(
        "id, user_id, extracted_text, text_hash, updated_at, product_extraction_status, product_extracted_chars, product_source_pages, product_source_kind",
      )
      .eq("id", uploadedContractId)
      .maybeSingle();
    if (!doc || doc.user_id !== userId) return fail("document_not_found", 404, corsHeaders);
    const verifiedSource = await verifyStoredProductSource(doc, sha256HexServer);
    const sourceHash = verifiedSource.sourceHash;
    const sourceUpdatedAt = verifiedSource.sourceUpdatedAt;

    // СЪЩАТА проверка, която изпълнението ще повтори: можем ли наистина да
    // обработим точно този документ с точно този продукт? Ако не — отказваме
    // ПРЕДИ да се създаде или преизползва платима сесия.
    const eligibility = evaluateProductEligibility({
      productId: spec.id,
      source: {
        text: verifiedSource.text,
        charCount: verifiedSource.charCount,
        charUnit: verifiedSource.charUnit,
        sourceKind: verifiedSource.sourceKind,
        extractionStatus: "full",
      },
      context,
    });
    if (!eligibility.ok) {
      return new Response(
        JSON.stringify({ error: eligibility.code, message: eligibility.message }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Цената се разрешава ПРЕДИ заявката: точната цена е част от заявката.
    const stripe = createStripeClient(environment);
    const prices = await stripe.prices.list({ lookup_keys: [spec.lookupKey] });
    const price = requireProductPrice(prices.data as never, spec.id, environment);

    // Заявката е идемпотентна по (user, requestId): повторен опит преизползва
    // същия ред и същата отворена Stripe сесия — но само при пълно съвпадение.
    const { data: existingIntake } = await admin
      .from("product_checkout_intakes")
      .select(
        "id, product_id, source_hash, source_updated_at, uploaded_contract_id, environment, status, stripe_session_id, stripe_price_id, stripe_price_lookup_key, expected_amount_cents, context, terms_accepted, ai_ack_accepted, immediate_performance_consent, withdrawal_loss_acknowledged, terms_version, privacy_version, withdrawal_version, refund_version, ai_notice_version, source_char_count, source_char_unit, source_kind, source_page_count, source_extraction_status, generation_policy_version",
      )
      .eq("user_id", userId)
      .eq("request_id", requestId)
      .maybeSingle();

    let intakeId = existingIntake?.id as string | undefined;
    let reusedSession: { id: string; client_secret: string | null } | null = null;
    if (existingIntake) {
      const sameContext = sameProductContext(existingIntake.context, context);
      const mismatch =
        existingIntake.product_id !== spec.id ||
        existingIntake.uploaded_contract_id !== uploadedContractId ||
        existingIntake.source_hash !== sourceHash ||
        String(existingIntake.source_updated_at) !== String(sourceUpdatedAt) ||
        existingIntake.environment !== environment ||
        existingIntake.expected_amount_cents !== spec.amountCents ||
        existingIntake.stripe_price_lookup_key !== spec.lookupKey ||
        existingIntake.stripe_price_id !== price.id ||
        existingIntake.source_extraction_status !== "full" ||
        existingIntake.source_char_count !== verifiedSource.charCount ||
        existingIntake.source_char_unit !== PRODUCT_SOURCE_CHAR_UNIT ||
        existingIntake.source_kind !== verifiedSource.sourceKind ||
        (existingIntake.source_page_count ?? null) !== verifiedSource.pageCount ||
        existingIntake.terms_accepted !== true ||
        existingIntake.ai_ack_accepted !== true ||
        existingIntake.immediate_performance_consent !== true ||
        existingIntake.withdrawal_loss_acknowledged !== true ||
        existingIntake.terms_version !== LEGAL_VERSIONS.terms ||
        existingIntake.privacy_version !== LEGAL_VERSIONS.privacy ||
        existingIntake.withdrawal_version !== LEGAL_VERSIONS.withdrawal ||
        existingIntake.refund_version !== LEGAL_VERSIONS.refund ||
        existingIntake.ai_notice_version !== LEGAL_VERSIONS.aiNotice ||
        // Повторният опит не сменя ТИХО политиката за обработка.
        existingIntake.generation_policy_version !== PRODUCT_GENERATION_POLICY_VERSION ||
        !sameContext;
      if (mismatch) return fail("intake_conflict", 409, corsHeaders);
      if (existingIntake.status === "paid") return fail("already_paid", 409, corsHeaders);

      const existingSessionId = existingIntake.stripe_session_id as string | null;
      if (existingSessionId) {
        const prior = await stripe.checkout.sessions.retrieve(existingSessionId);
        const sameSession =
          prior.mode === "payment" &&
          prior.status === "open" &&
          !!prior.client_secret &&
          prior.currency?.toLowerCase() === spec.currency &&
          prior.amount_total === spec.amountCents &&
          prior.livemode === (environment === "live") &&
          prior.metadata?.purchase_kind === "product" &&
          prior.metadata?.productId === spec.id &&
          prior.metadata?.userId === userId &&
          prior.metadata?.intakeId === existingIntake.id &&
          prior.metadata?.sourceDocumentId === uploadedContractId &&
          prior.metadata?.environment === environment;
        if (!sameSession) return fail("intake_conflict", 409, corsHeaders);
        reusedSession = { id: prior.id, client_secret: prior.client_secret };
      }
    } else {
      const { data: inserted, error: intakeErr } = await admin
        .from("product_checkout_intakes")
        .insert({
          request_id: requestId,
          user_id: userId,
          product_id: spec.id,
          uploaded_contract_id: uploadedContractId,
          source_hash: sourceHash,
          source_updated_at: sourceUpdatedAt,
          context,
          status: "pending",
          environment,
          currency: spec.currency,
          expected_amount_cents: spec.amountCents,
          stripe_price_id: price.id,
          stripe_price_lookup_key: spec.lookupKey,
          terms_version: LEGAL_VERSIONS.terms,
          privacy_version: LEGAL_VERSIONS.privacy,
          withdrawal_version: LEGAL_VERSIONS.withdrawal,
          refund_version: LEGAL_VERSIONS.refund,
          ai_notice_version: LEGAL_VERSIONS.aiNotice,
          terms_accepted: consent.termsAccepted,
          ai_ack_accepted: consent.aiAckAccepted,
          immediate_performance_consent: consent.immediatePerformanceConsent,
          withdrawal_loss_acknowledged: consent.withdrawalLossAcknowledged,
          consent_recorded_at: new Date().toISOString(),
          // Измерената истина за източника — само пълно прочетен документ.
          source_char_count: verifiedSource.charCount,
          source_char_unit: PRODUCT_SOURCE_CHAR_UNIT,
          source_kind: verifiedSource.sourceKind,
          source_page_count: verifiedSource.pageCount,
          source_extraction_status: "full",
          generation_policy_version: PRODUCT_GENERATION_POLICY_VERSION,
        })
        .select("id")
        .single();
      if (intakeErr || !inserted) return fail("intake_failed", 500, corsHeaders);
      intakeId = inserted.id as string;
    }

    if (reusedSession) {
      return new Response(
        JSON.stringify({ clientSecret: reusedSession.client_secret, intakeId, productId: spec.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const customerId = await resolveOrCreateCustomer(stripe, { email, userId });

    const session = await stripe.checkout.sessions.create(
      {
        line_items: [{ price: price.id, quantity: 1 }],
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: returnUrl,
        customer: customerId,
        // Никакви промокодове и отстъпки върху фиксираните микропродукти.
        payment_intent_data: { description: spec.name },
        // Само непрозрачни идентификатори и затворени изброявания. Без хешове,
        // имена на файлове, съгласия и контекст — истината е в заявката.
        metadata: {
          purchase_kind: "product",
          productId: spec.id,
          userId,
          intakeId: intakeId!,
          sourceDocumentId: uploadedContractId,
          environment,
        },
      },
      { idempotencyKey: `product:${userId}:${requestId}` },
    );

    // Ако не успеем да запишем сесията, не връщаме платима, но непроследена
    // сесия — затваряме я, докъдето е безопасно, и се проваляме.
    const { error: persistErr } = await admin
      .from("product_checkout_intakes")
      .update({
        status: "checkout_created",
        stripe_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", intakeId!)
      .eq("user_id", userId);
    if (persistErr) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireErr) {
        console.error("failed to expire untracked product session:", expireErr);
      }
      return fail("intake_failed", 500, corsHeaders);
    }

    return new Response(
      JSON.stringify({ clientSecret: session.client_secret, intakeId, productId: spec.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    if (e instanceof SandboxForbiddenError) return sandboxForbiddenResponse(corsHeaders);
    if (e instanceof ConsentMissingError) return fail("consent_required", 400, corsHeaders);
    if (e instanceof ReturnUrlError) return fail("invalid_return_url", 400, corsHeaders);
    if (e instanceof RequestShapeError) return fail(e.code, 400, corsHeaders);
    if (e instanceof ProductPurchaseError) return fail(e.reason, 400, corsHeaders);
    if (e instanceof ProductSourceError) return fail(e.reason, 400, corsHeaders);
    if (e instanceof ProductContextError) return fail(e.reason, 400, corsHeaders);
    const code = e instanceof Error && e.message.length < 40 ? e.message : "checkout_failed";
    console.error("create-product-checkout error:", e);
    return fail(code, 400, corsHeaders);
  }
});
