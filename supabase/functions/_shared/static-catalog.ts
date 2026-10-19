/** Static catalog files (sandbox + live, strictly isolated). No user document data, AI calls or quota writes. */
import { boundedRequestText } from "./webhook-proof.ts";
import { LEGAL_VERSIONS, productReturnUrl } from "./purchase-consent.ts";
import { isStaffUser } from "./sandbox-guard.ts";

// deno-lint-ignore no-explicit-any
type Any = any;
export type StaticEnv = "sandbox" | "live";
/** stripe(env) must return a client bound to that environment's credentials (server-selected). */
export interface StaticDeps { db: Any; stripe: (env: StaticEnv) => Any; env: (key: string) => string | undefined; }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const SESSION: Record<StaticEnv, RegExp> = { sandbox: /^cs_test_[A-Za-z0-9_]+$/, live: /^cs_live_[A-Za-z0-9_]+$/ };
const MIMES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
export class StaticCatalogError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 409) { super(code); this.name = "StaticCatalogError"; this.code = code; this.status = status; }
}
const deny = (code: string, status?: number): never => { throw new StaticCatalogError(code, status); };
export const isStaticEnv = (v: unknown): v is StaticEnv => v === "sandbox" || v === "live";
const asEnv = (v: unknown): StaticEnv => isStaticEnv(v) ? v : deny("invalid_environment", 400);

export async function staticRequest(req: Request, keys: readonly string[], limit = 4096): Promise<Record<string, unknown>> {
  let text: string;
  try { text = await boundedRequestText(req, limit); } catch { return deny("request_too_large", 413); }
  let body;
  try { body = JSON.parse(text); } catch { return deny("invalid_body", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((k) => !keys.includes(k))) return deny("invalid_body", 400);
  return body;
}

/** Sandbox is staff-only. Live is open to any authenticated customer. */
async function assertAudience(d: StaticDeps, userId: string, env: StaticEnv) {
  if (env === "sandbox" && !(await isStaffUser(d.db, userId))) deny("sandbox_forbidden", 403);
}

export function assertStaticAsset(a: Any, env: StaticEnv) {
  if (!a || !UUID.test(a.id) || !HASH.test(a.content_sha256) || a.environment !== env || a.revoked_at ||
    !a.legal_acceptance_ref || !a.reviewer_ref || !Number.isFinite(Date.parse(a.legal_accepted_at)) || Date.parse(a.legal_accepted_at) > Date.now() ||
    !Number.isSafeInteger(a.amount_cents) || a.amount_cents <= 0 || a.amount_cents > 100000 || a.currency !== "eur" || !/^price_[A-Za-z0-9_]+$/.test(a.stripe_price_id) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(a.filename) || a.filename.includes("..") || !MIMES.includes(a.mime_type)) deny("asset_unavailable", 404);
  if ((a.mime_type === "application/pdf" && !a.filename.endsWith(".pdf")) ||
    (a.mime_type !== "application/pdf" && !a.filename.endsWith(".docx"))) deny("asset_invalid");
}

/** Latest review decides. Must be accepted, by the recorded reviewer, for these exact bytes. */
export async function latestAcceptedReview(d: StaticDeps, a: Any) {
  const { data, error } = await d.db.from("static_catalog_asset_reviews").select("*").eq("asset_id", a.id)
    .order("created_at", { ascending: false }).limit(1);
  if (error) return deny("catalog_unavailable", 503);
  const r = data?.[0];
  if (!r || r.decision !== "accepted" || r.asset_sha256 !== a.content_sha256) return deny("asset_not_accepted", 404);
  return r;
}

export async function staticFileBytes(a: Any): Promise<Uint8Array> {
  if (typeof a.content !== "string" || !/^\\x(?:[0-9a-f]{2})+$/.test(a.content) || a.content.length > 4194306) return deny("asset_invalid");
  const bytes = Uint8Array.from(a.content.slice(2).match(/../g)!, (v: string) => parseInt(v, 16));
  if (hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>))) !== a.content_sha256) return deny("asset_integrity_failed");
  if (!magicOk(a.mime_type, bytes)) return deny("asset_invalid");
  return bytes;
}
const hex = (u: Uint8Array) => Array.from(u, (v) => v.toString(16).padStart(2, "0")).join("");
const magicOk = (mime: string, b: Uint8Array) => mime === "application/pdf"
  ? new TextDecoder().decode(b.slice(0, 5)) === "%PDF-" : b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;

function checkoutFlag(d: StaticDeps, env: StaticEnv) {
  const k = env === "live" ? "STATIC_CATALOG_LIVE_CHECKOUT_ENABLED" : "STATIC_CATALOG_SANDBOX_CHECKOUT_ENABLED";
  return d.env(k) === "true";
}

export async function createStaticCheckout(d: StaticDeps, userId: string, body: Record<string, unknown>) {
  const env = asEnv(body.environment);
  if (!checkoutFlag(d, env)) return deny("static_checkout_closed", 503);
  if (!UUID.test(String(body.assetId)) || !UUID.test(String(body.requestId))) return deny("invalid_id", 400);
  await assertAudience(d, userId, env);
  if (body.termsAccepted !== true || body.immediatePerformanceConsent !== true || body.withdrawalLossAcknowledged !== true) return deny("consent_required", 400);
  const { data: a, error: ae } = await d.db.from("static_catalog_assets").select("*").eq("id", body.assetId).eq("environment", env).maybeSingle();
  if (ae) return deny("catalog_unavailable", 503);
  assertStaticAsset(a, env);
  await latestAcceptedReview(d, a);
  await staticFileBytes(a);
  const order = { id: body.requestId, user_id: userId, asset_id: a.id, asset_sha256: a.content_sha256, amount_cents: a.amount_cents,
    currency: a.currency, stripe_price_id: a.stripe_price_id, terms_version: LEGAL_VERSIONS.terms, refund_version: LEGAL_VERSIONS.refund,
    withdrawal_version: LEGAL_VERSIONS.withdrawal, terms_accepted: true, immediate_performance_consent: true, withdrawal_loss_acknowledged: true, environment: env };
  const { error: insertError } = await d.db.from("static_catalog_orders").upsert(order, { onConflict: "id", ignoreDuplicates: true });
  if (insertError) return deny("order_unavailable", 503);
  const { data: o, error: oe } = await d.db.from("static_catalog_orders").select("*").eq("id", body.requestId).maybeSingle();
  if (oe || !o || Object.entries(order).some(([k, v]) => o[k] !== v)) return deny("order_conflict");
  const stripe = d.stripe(env);
  const live = env === "live";
  const price = await stripe.prices.retrieve(a.stripe_price_id);
  if (!price || price.id !== a.stripe_price_id || price.livemode !== live || price.active !== true || price.type !== "one_time" || price.recurring ||
    price.unit_amount !== a.amount_cents || price.currency !== a.currency || price.tax_behavior !== "inclusive") return deny("price_mismatch");
  const session = await stripe.checkout.sessions.create({ mode: "payment", line_items: [{ price: a.stripe_price_id, quantity: 1 }],
    client_reference_id: o.id, payment_method_types: ["card"], allow_promotion_codes: false,
    success_url: productReturnUrl(d.env("APP_BASE_URL"), `/pokupki?order=${o.id}&session_id={CHECKOUT_SESSION_ID}`),
    cancel_url: productReturnUrl(d.env("APP_BASE_URL"), `/pokupki?order=${o.id}&cancelled=1`),
    payment_intent_data: { description: `${a.product_key} v${a.version}` },
    metadata: { type: "static_catalog", userId, orderId: o.id, assetId: a.id, assetHash: a.content_sha256, environment: env },
  }, { idempotencyKey: `static-catalog:${env}:${userId}:${o.id}` });
  if (!session || !SESSION[env].test(session.id) || session.livemode !== live || !session.url) return deny("session_invalid");
  if (o.stripe_session_id && o.stripe_session_id !== session.id) return deny("session_conflict");
  const { data: bound, error: be } = await d.db.from("static_catalog_orders").update({ stripe_session_id: session.id }).eq("id", o.id).eq("user_id", userId).select("id");
  if (be || !bound?.length) return deny("session_binding_failed", 503);
  return { ok: true, order_id: o.id, url: session.url, environment: env };
}

export async function deliverStaticCatalog(d: StaticDeps, userId: string, orderId: unknown, cors: Record<string, string> = {}) {
  if (!UUID.test(String(orderId))) return deny("not_found", 404);
  // Independent of checkout flags: paid re-downloads survive a checkout pause.
  const { data: e, error: ee } = await d.db.from("static_catalog_entitlements").select("*").eq("order_id", orderId).eq("user_id", userId).maybeSingle();
  if (ee) return deny("delivery_unavailable", 503);
  if (!e || e.revoked_at || !isStaticEnv(e.environment)) return deny("not_found", 404);
  const env: StaticEnv = e.environment;
  await assertAudience(d, userId, env);
  if (!SESSION[env].test(e.stripe_session_id) || !e.stripe_event_id || !e.paid_at) return deny("not_found", 404);
  const { data: o, error: oe } = await d.db.from("static_catalog_orders").select("*").eq("id", orderId).eq("user_id", userId).maybeSingle();
  const { data: a, error: ae } = await d.db.from("static_catalog_assets").select("*").eq("id", e.asset_id).maybeSingle();
  if (oe || ae) return deny("delivery_unavailable", 503);
  assertStaticAsset(a, env);
  if (!o || o.environment !== env || o.stripe_session_id !== e.stripe_session_id || o.asset_id !== e.asset_id || o.asset_sha256 !== e.asset_sha256 ||
    a.content_sha256 !== e.asset_sha256 || o.amount_cents !== a.amount_cents || o.currency !== a.currency || o.stripe_price_id !== a.stripe_price_id ||
    !o.terms_accepted || !o.immediate_performance_consent || !o.withdrawal_loss_acknowledged) return deny("payment_unverified");
  const { data: proof, error: pe } = await d.db.from("static_catalog_payment_events").select("*").eq("stripe_event_id", e.stripe_event_id).maybeSingle();
  if (pe || !proof || proof.kind !== "paid" || proof.environment !== env || proof.stripe_session_id !== e.stripe_session_id ||
    Date.parse(proof.event_at) !== Date.parse(e.paid_at)) return deny("payment_unverified");
  const bytes = await staticFileBytes(a);
  const { data: latest, error: le } = await d.db.from("static_catalog_entitlements").select("revoked_at").eq("order_id", orderId).eq("user_id", userId).maybeSingle();
  if (le) return deny("delivery_unavailable", 503);
  if (!latest || latest.revoked_at) return deny("not_found", 404);
  const out = new Uint8Array(bytes.length); out.set(bytes);
  return new Response(out.buffer, { headers: { ...cors, "Content-Type": a.mime_type, "Content-Disposition": `attachment; filename="${a.filename}"`,
    "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none'", "X-Frame-Options": "DENY" } });
}

export async function recordStaticPaid(d: StaticDeps, session: Any, envIn: string, proof: Any) {
  const env = isStaticEnv(envIn) ? envIn : deny("static_payment_environment_mismatch");
  const live = env === "live";
  if (session.livemode !== live || session.mode !== "payment" || session.payment_status !== "paid") return deny("static_payment_environment_mismatch");
  const m = session.metadata;
  if (!m || m.type !== "static_catalog" || m.environment !== env || !UUID.test(m.userId) || !UUID.test(m.orderId) || !UUID.test(m.assetId) || !HASH.test(m.assetHash) ||
    !SESSION[env].test(session.id) || !proof?.eventId || !proof?.paidAt) return deny("static_payment_proof_missing");
  await assertAudience(d, m.userId, env);
  const { data: o, error: oe } = await d.db.from("static_catalog_orders").select("*").eq("id", m.orderId).maybeSingle();
  if (oe || !o || o.environment !== env || o.user_id !== m.userId || o.asset_id !== m.assetId || o.asset_sha256 !== m.assetHash || o.stripe_session_id !== session.id ||
    session.amount_total !== o.amount_cents || session.currency !== o.currency || session.client_reference_id !== o.id || session.amount_subtotal !== o.amount_cents ||
    session.total_details?.amount_discount !== 0 || session.total_details?.amount_shipping !== 0) return deny("static_payment_mismatch");
  const items = await d.stripe(env).checkout.sessions.listLineItems(session.id, { limit: 2, expand: ["data.price"] });
  const item = items?.data?.[0]; const price = item?.price;
  if (items.has_more || items?.data?.length !== 1 || item.quantity !== 1 || item.amount_total !== o.amount_cents || !price || price.id !== o.stripe_price_id ||
    price.livemode !== live || price.type !== "one_time" || price.recurring || price.unit_amount !== o.amount_cents || price.currency !== o.currency || price.tax_behavior !== "inclusive") return deny("static_line_items_mismatch");
  const { data, error } = await d.db.rpc("record_static_catalog_payment_env", { p_environment: env, p_order_id: o.id, p_session_id: session.id, p_event_id: proof.eventId,
    p_paid_at: proof.paidAt, p_user_id: m.userId, p_asset_id: m.assetId, p_asset_sha256: m.assetHash, p_price_id: price.id, p_amount_cents: o.amount_cents, p_currency: o.currency });
  if (error || data?.ok !== true) return deny("static_payment_record_failed", 503);
}

export async function reverseStaticPaid(d: StaticDeps, object: Any, envIn: string, kind: string, proof: Any) {
  if (!isStaticEnv(envIn)) return;
  const env = envIn; const live = env === "live";
  if (typeof object?.livemode === "boolean" && object.livemode !== live) return; // cross-environment event: never touch the other ledger
  const id = (v: Any) => typeof v === "string" ? v : v?.id;
  let pi = id(object.payment_intent);
  if (!pi && id(object.charge)) pi = id((await d.stripe(env).charges.retrieve(id(object.charge))).payment_intent);
  if (!pi) return;
  const sessions = await d.stripe(env).checkout.sessions.list({ payment_intent: pi, limit: 3 });
  const matching = (sessions?.data ?? []).filter((s: Any) => s.metadata?.type === "static_catalog" && s.metadata?.environment === env &&
    s.livemode === live && s.mode === "payment" && SESSION[env].test(s.id));
  if (sessions.has_more || matching.length !== 1) return;
  const s = matching[0];
  await assertAudience(d, s.metadata.userId, env);
  if (!proof?.eventId || !proof?.paidAt) return deny("static_reversal_proof_missing");
  const { data, error } = await d.db.rpc("revoke_static_catalog_payment_env", { p_environment: env, p_session_id: s.id, p_event_id: proof.eventId, p_event_at: proof.paidAt, p_kind: kind });
  if (error || data?.ok !== true) return deny("static_reversal_failed", 503);
}

// ---------- Customer catalog, orders, status ----------

/** Only accepted, intact assets are listed. Metadata only, never bytes or reviewer identities. */
export async function listStaticCatalog(d: StaticDeps, userId: string, envIn: unknown) {
  const env = asEnv(envIn);
  await assertAudience(d, userId, env);
  const { data, error } = await d.db.from("static_catalog_assets").select("*").eq("environment", env).is("revoked_at", null).limit(200);
  if (error) return deny("catalog_unavailable", 503);
  const items = [];
  for (const a of data ?? []) {
    try {
      assertStaticAsset(a, env); await latestAcceptedReview(d, a); await staticFileBytes(a);
      items.push({ id: a.id, product_key: a.product_key, template_slug: a.template_slug ?? null, version: a.version, filename: a.filename,
        mime_type: a.mime_type, sha256: a.content_sha256, amount_cents: a.amount_cents, currency: a.currency });
    } catch { /* not sellable: omitted from customer view, visible in admin readiness */ }
  }
  return { ok: true, checkout_open: checkoutFlag(d, env), legal_versions: { terms: LEGAL_VERSIONS.terms, refund: LEGAL_VERSIONS.refund, withdrawal: LEGAL_VERSIONS.withdrawal }, items };
}

export type StaticOrderState = "pending" | "paid" | "refunded" | "failed";
export function staticOrderState(o: Any, e: Any): StaticOrderState {
  if (e?.revoked_at) return "refunded";
  if (e?.paid_at && e?.stripe_event_id) return "paid";
  if (!o.stripe_session_id) return "failed";
  return "pending";
}

/** Owned orders only; state derives from webhook-written entitlements, never from the return URL. */
export async function listStaticOrders(d: StaticDeps, userId: string, onlyOrderId?: unknown) {
  if (onlyOrderId !== undefined && !UUID.test(String(onlyOrderId))) return deny("invalid_id", 400);
  let q = d.db.from("static_catalog_orders").select("id,asset_id,amount_cents,currency,stripe_session_id,environment,created_at").eq("user_id", userId);
  if (onlyOrderId !== undefined) q = q.eq("id", onlyOrderId);
  const { data: orders, error } = await q.order("created_at", { ascending: false }).limit(50);
  if (error) return deny("orders_unavailable", 503);
  const staff = (orders ?? []).some((o: Any) => o.environment === "sandbox") ? await isStaffUser(d.db, userId) : false;
  const visible = (orders ?? []).filter((o: Any) => o.environment === "live" || staff);
  const { data: ents } = await d.db.from("static_catalog_entitlements").select("order_id,paid_at,revoked_at,stripe_event_id").eq("user_id", userId);
  const byOrder = new Map((ents ?? []).map((e: Any) => [e.order_id, e]));
  const assetIds = [...new Set(visible.map((o: Any) => o.asset_id))];
  const { data: assets } = assetIds.length ? await d.db.from("static_catalog_assets").select("id,product_key,version,filename").in("id", assetIds) : { data: [] };
  const byAsset = new Map((assets ?? []).map((a: Any) => [a.id, a]));
  return { ok: true, orders: visible.map((o: Any) => {
    const a: Any = byAsset.get(o.asset_id);
    return { id: o.id, environment: o.environment, amount_cents: o.amount_cents, currency: o.currency, created_at: o.created_at,
      product_key: a?.product_key ?? null, version: a?.version ?? null, filename: a?.filename ?? null, state: staticOrderState(o, byOrder.get(o.id)) };
  }) };
}

// ---------- Admin: register + review ----------

export function validateStaticAssetInput(b: Record<string, unknown>): { errors: string[]; bytes?: Uint8Array } {
  const errors: string[] = [];
  const s = (k: string) => typeof b[k] === "string" ? (b[k] as string).trim() : "";
  if (!isStaticEnv(b.environment)) errors.push("environment_invalid");
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(s("productKey"))) errors.push("product_key_invalid");
  if (!/^[a-z0-9][a-z0-9-]{1,119}$/.test(s("templateSlug"))) errors.push("template_slug_invalid");
  if (s("sourceRef").length < 3 || s("sourceRef").length > 300) errors.push("source_ref_required");
  if (s("version").length < 1 || s("version").length > 80) errors.push("version_invalid");
  const fn = s("filename");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(fn) || fn.includes("..")) errors.push("filename_invalid");
  const mime = s("mimeType");
  if (!MIMES.includes(mime)) errors.push("mime_invalid");
  else if (!fn.endsWith(mime === "application/pdf" ? ".pdf" : ".docx")) errors.push("extension_mismatch");
  if (!Number.isSafeInteger(b.amountCents) || (b.amountCents as number) < 1 || (b.amountCents as number) > 100000) errors.push("amount_invalid");
  if (!/^price_[A-Za-z0-9_]+$/.test(s("stripePriceId"))) errors.push("price_id_invalid");
  if (s("reviewRef").length < 3 || s("reviewRef").length > 200) errors.push("review_ref_required");
  if (s("evidenceNote").length > 1000) errors.push("evidence_note_too_long");
  if (b.reviewerAttestation !== true) errors.push("reviewer_attestation_required");
  let bytes: Uint8Array | undefined;
  try { bytes = Uint8Array.from(atob(s("contentBase64")), (c) => c.charCodeAt(0)); } catch { errors.push("content_invalid"); }
  if (bytes) {
    if (bytes.length < 1 || bytes.length > 2097152) errors.push("content_size_invalid");
    if (MIMES.includes(mime) && !magicOk(mime, bytes)) errors.push("content_type_mismatch");
  }
  return { errors, bytes };
}

async function authorizedReviewer(d: StaticDeps, userId: string) {
  if (!(await isStaffUser(d.db, userId))) return deny("staff_required", 403);
  const { data: r, error } = await d.db.from("static_catalog_reviewers").select("*").eq("user_id", userId).maybeSingle();
  if (error) return deny("catalog_unavailable", 503);
  if (!r || r.active !== true || !["lawyer", "owner_operator"].includes(r.capacity)) return deny("reviewer_not_authorized", 403);
  return r;
}

/** The signed-in reviewer uploads exact bytes and records their own decision. Identity and capacity come from the server-side reviewer registry. */
export async function registerStaticAsset(d: StaticDeps, userId: string, b: Record<string, unknown>) {
  const reviewer = await authorizedReviewer(d, userId);
  const { errors, bytes } = validateStaticAssetInput(b);
  if (errors.length) return { ok: false, errors };
  const env = b.environment as StaticEnv;
  const sha = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes! as Uint8Array<ArrayBuffer>)));
  const price = await d.stripe(env).prices.retrieve(String(b.stripePriceId).trim()).catch(() => null);
  if (!price || price.livemode !== (env === "live") || price.active !== true || price.type !== "one_time" || price.recurring ||
    price.unit_amount !== b.amountCents || price.currency !== "eur" || price.tax_behavior !== "inclusive") return { ok: false, errors: ["price_mismatch"] };
  const row = { product_key: String(b.productKey).trim(), template_slug: String(b.templateSlug).trim(), source_ref: String(b.sourceRef).trim(),
    version: String(b.version).trim(), filename: String(b.filename).trim(), mime_type: String(b.mimeType).trim(), content: "\\x" + hex(bytes!),
    reviewer_ref: `${reviewer.capacity}:${userId}`, legal_acceptance_ref: String(b.reviewRef).trim(), legal_accepted_at: new Date().toISOString(),
    uploaded_by: userId, environment: env, amount_cents: b.amountCents, currency: "eur", stripe_price_id: price.id };
  const { data, error } = await d.db.from("static_catalog_assets").insert(row).select("id,content_sha256").maybeSingle();
  if (error) return { ok: false, errors: [error.code === "23505" ? "version_exists" : "asset_insert_failed"] };
  if (data?.content_sha256 !== sha) return { ok: false, errors: ["asset_integrity_failed"] };
  const { error: re } = await d.db.from("static_catalog_asset_reviews").insert({ asset_id: data.id, asset_sha256: sha, reviewer_user_id: userId,
    reviewer_capacity: reviewer.capacity, decision: "accepted", review_ref: row.legal_acceptance_ref, evidence_note: String(b.evidenceNote ?? "").trim() || null });
  if (re) return { ok: false, asset_id: data.id, errors: ["review_record_failed"] };
  return { ok: true, asset_id: data.id, sha256: sha, reviewer_capacity: reviewer.capacity };
}

/** Records a later human decision (e.g. withdraw acceptance). Latest decision wins; history is append-only. */
export async function reviewStaticAsset(d: StaticDeps, userId: string, b: Record<string, unknown>) {
  const reviewer = await authorizedReviewer(d, userId);
  if (!UUID.test(String(b.assetId)) || !["accepted", "rejected"].includes(String(b.decision))) return deny("invalid_body", 400);
  const ref = typeof b.reviewRef === "string" ? b.reviewRef.trim() : "";
  if (ref.length < 3 || ref.length > 200 || b.reviewerAttestation !== true) return deny("review_ref_required", 400);
  const { data: a } = await d.db.from("static_catalog_assets").select("id,content_sha256").eq("id", b.assetId).maybeSingle();
  if (!a) return deny("not_found", 404);
  const { error } = await d.db.from("static_catalog_asset_reviews").insert({ asset_id: a.id, asset_sha256: a.content_sha256, reviewer_user_id: userId,
    reviewer_capacity: reviewer.capacity, decision: b.decision, review_ref: ref, evidence_note: null });
  if (error) return deny("review_record_failed", 503);
  return { ok: true };
}

/** Staff readiness view (both environments): metadata only. */
export async function staticReadiness(d: StaticDeps, userId: string) {
  if (!(await isStaffUser(d.db, userId))) return deny("staff_required", 403);
  const { data: me } = await d.db.from("static_catalog_reviewers").select("capacity,active").eq("user_id", userId).maybeSingle();
  const { data, error } = await d.db.from("static_catalog_assets").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return deny("catalog_unavailable", 503);
  const assets = [];
  for (const a of data ?? []) {
    const errors: string[] = []; let review: Any = null;
    try { assertStaticAsset(a, a.environment); await staticFileBytes(a); } catch (e) { errors.push(e instanceof StaticCatalogError ? e.code : "asset_invalid"); }
    try { review = await latestAcceptedReview(d, a); } catch (e) { errors.push(e instanceof StaticCatalogError ? e.code : "asset_not_accepted"); }
    if (!a.template_slug || !a.source_ref) errors.push("provenance_missing");
    assets.push({ id: a.id, environment: a.environment, product_key: a.product_key, template_slug: a.template_slug ?? null, source_ref: a.source_ref ?? null,
      version: a.version, filename: a.filename, sha256: a.content_sha256, amount_cents: a.amount_cents, review_ref: review?.review_ref ?? a.legal_acceptance_ref,
      reviewer: review ? `${review.reviewer_capacity}:${review.reviewer_user_id}` : null, revoked_at: a.revoked_at, ready: errors.length === 0, errors });
  }
  return { ok: true, reviewer: me?.active ? me.capacity : null, checkout: { sandbox: checkoutFlag(d, "sandbox"), live: checkoutFlag(d, "live") }, assets };
}
