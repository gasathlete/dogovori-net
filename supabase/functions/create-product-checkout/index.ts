/**
 * Плащане за точно един еднократен продукт, обвързан с точно един документ.
 *
 * Отделна функция, за да не се смесва с абонаментния/legacy checkout:
 * тук няма промокодове, няма операции и няма кредити.
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
import { ProductSourceError, verifyStoredProductSource } from "../_shared/product-source.ts";
import {
  ConsentMissingError,
  LEGAL_VERSIONS,
  ReturnUrlError,
  buildProductReturnUrl,
  consentMetadata,
  requireProductConsent,
} from "../_shared/purchase-consent.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Кратки, ограничени полета за контекста. Никога суров текст на документа. */
function boundedContext(raw: unknown): Record<string, string> {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  const take = (key: string, max: number) => {
    const v = src[key];
    if (typeof v !== "string") return;
    const trimmed = v.trim();
    if (!trimmed) return;
    if (trimmed.length > max) throw new Error("context_too_long");
    out[key] = trimmed;
  };
  take("role", 120);
  take("objective", 400);
  take("counterparty_context", 400);
  const position = src.preferred_position;
  if (typeof position === "string" && position) {
    if (!["conservative", "balanced", "assertive"].includes(position)) {
      throw new Error("invalid_position");
    }
    out.preferred_position = position;
  }
  return out;
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

    const body = (await req.json()) as Record<string, unknown>;
    const { productId, uploadedContractId, requestId, environment, origin } = body as {
      productId: string;
      uploadedContractId: string;
      requestId: string;
      environment: "sandbox" | "live";
      origin: string;
    };

    if (environment !== "sandbox" && environment !== "live") {
      return fail("invalid_environment", 400, corsHeaders);
    }
    if (!UUID_RE.test(String(uploadedContractId))) return fail("invalid_document", 400, corsHeaders);
    if (!UUID_RE.test(String(requestId))) return fail("invalid_request_id", 400, corsHeaders);

    const spec = requireProductSpec(productId);
    const consent = requireProductConsent(body);
    const context = boundedContext(body.context);
    const returnUrl = buildProductReturnUrl(
      origin,
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
        "id, user_id, extracted_text, text_hash, updated_at, product_extraction_status, product_extracted_chars, product_source_pages",
      )
      .eq("id", uploadedContractId)
      .maybeSingle();
    if (!doc || doc.user_id !== userId) return fail("document_not_found", 404, corsHeaders);
    const verifiedSource = await verifyStoredProductSource(doc, sha256HexServer);
    const sourceHash = verifiedSource.sourceHash;

    // Заявката е идемпотентна по (user, requestId): повторен опит преизползва
    // същия ред и същата отворена Stripe сесия.
    const { data: existingIntake } = await admin
      .from("product_checkout_intakes")
      .select(
        "id, product_id, source_hash, source_updated_at, environment, status, stripe_session_id",
      )
      .eq("user_id", userId)
      .eq("request_id", requestId)
      .maybeSingle();

    let intakeId = existingIntake?.id as string | undefined;
    let reusedSession: { id: string; client_secret: string | null } | null = null;
    if (existingIntake) {
      // Обвързването е точно: продукт, документ (hash) и ревизия на текста.
      const sameRevision =
        !existingIntake.source_updated_at ||
        !doc.updated_at ||
        String(existingIntake.source_updated_at) === String(doc.updated_at);
      if (
        existingIntake.product_id !== spec.id ||
        existingIntake.source_hash !== sourceHash ||
        existingIntake.environment !== environment ||
        !sameRevision
      ) {
        return fail("intake_conflict", 409, corsHeaders);
      }
      if (existingIntake.status === "paid") return fail("already_paid", 409, corsHeaders);
      // Повторен опит в същата сесия: преизползваме отворената Stripe сесия,
      // вместо да създаваме второ плащане.
      const existingSessionId = existingIntake.stripe_session_id as string | null;
      if (existingSessionId) {
        try {
          const stripeForReuse = createStripeClient(environment);
          const prior = await stripeForReuse.checkout.sessions.retrieve(existingSessionId);
          if (
            prior.status === "open" &&
            prior.client_secret &&
            prior.metadata?.productId === spec.id &&
            prior.metadata?.userId === userId &&
            prior.metadata?.sourceHash === sourceHash &&
            prior.metadata?.intakeId === existingIntake.id &&
            prior.metadata?.environment === environment
          ) {
            reusedSession = { id: prior.id, client_secret: prior.client_secret };
          }
        } catch {
          reusedSession = null;
        }
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
          source_updated_at: doc.updated_at,
          context,
          status: "pending",
          environment,
          terms_version: LEGAL_VERSIONS.terms,
          privacy_version: LEGAL_VERSIONS.privacy,
          refund_version: LEGAL_VERSIONS.refund,
          ai_notice_version: LEGAL_VERSIONS.aiNotice,
          terms_accepted: consent.termsAccepted,
          ai_ack_accepted: consent.aiAckAccepted,
          immediate_performance_consent: consent.immediatePerformanceConsent,
          withdrawal_loss_acknowledged: consent.withdrawalLossAcknowledged,
          consent_recorded_at: new Date().toISOString(),
          // Измерената истина за източника — само пълно прочетен документ.
          source_char_count: verifiedSource.charCount,
          source_page_count: verifiedSource.pageCount,
          source_extraction_status: "full",
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

    const stripe = createStripeClient(environment);
    const prices = await stripe.prices.list({ lookup_keys: [spec.lookupKey] });
    const price = requireProductPrice(prices.data as never, spec.id);

    const customerId = await resolveOrCreateCustomer(stripe, { email, userId });

    const session = await stripe.checkout.sessions.create(
      {
        line_items: [{ price: price.id!, quantity: 1 }],
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: returnUrl,
        customer: customerId,
        // Никакви промокодове и отстъпки върху фиксираните микропродукти.
        payment_intent_data: { description: spec.name },
        metadata: {
          type: "product",
          userId,
          productId: spec.id,
          lookupKey: spec.lookupKey,
          intakeId: intakeId!,
          sourceHash,
          sourceDocumentId: uploadedContractId,
          environment,
          ...consentMetadata(consent),
        },
      },
      { idempotencyKey: `product:${userId}:${requestId}` },
    );

    await admin
      .from("product_checkout_intakes")
      .update({
        status: "checkout_created",
        stripe_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", intakeId!)
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({ clientSecret: session.client_secret, intakeId, productId: spec.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    if (e instanceof SandboxForbiddenError) return sandboxForbiddenResponse(corsHeaders);
    if (e instanceof ConsentMissingError) return fail("consent_required", 400, corsHeaders);
    if (e instanceof ReturnUrlError) return fail("invalid_return_url", 400, corsHeaders);
    if (e instanceof ProductPurchaseError) return fail(e.reason, 400, corsHeaders);
    if (e instanceof ProductSourceError) return fail(e.reason, 400, corsHeaders);
    const code = e instanceof Error && e.message.length < 40 ? e.message : "checkout_failed";
    console.error("create-product-checkout error:", e);
    return fail(code, 400, corsHeaders);
  }
});
