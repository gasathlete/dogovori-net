/** Isolated sandbox static files. No user documents, AI calls, quota writes or live payments. */
import { boundedRequestText } from "./webhook-proof.ts";
import { LEGAL_VERSIONS, productReturnUrl } from "./purchase-consent.ts";
import { isStaffUser } from "./sandbox-guard.ts";

// Minimal injected clients make the real orchestration testable without SDKs/secrets.
// deno-lint-ignore no-explicit-any
type Any = any;
export interface StaticDeps { db: Any; stripe: () => Any; env: (key: string) => string | undefined; }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
export class StaticCatalogError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 409) { super(code); this.name = "StaticCatalogError"; this.code=code; this.status=status; }
}
const deny = (code: string, status?: number): never => { throw new StaticCatalogError(code,status); };

export async function staticRequest(req: Request, keys: readonly string[]): Promise<Record<string, unknown>> {
  let body;
  try { body=JSON.parse(await boundedRequestText(req,4096)); } catch { return deny("invalid_body",400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k=>!keys.includes(k))) return deny("invalid_body",400);
  return body;
}

export function assertStaticAsset(a: Any) {
  if (!a || !UUID.test(a.id) || !HASH.test(a.content_sha256) || a.environment!=="sandbox" || a.revoked_at ||
    !a.legal_acceptance_ref || !a.reviewer_ref || !Number.isFinite(Date.parse(a.legal_accepted_at)) || Date.parse(a.legal_accepted_at)>Date.now() ||
    !Number.isSafeInteger(a.amount_cents) || a.amount_cents<=0 || a.amount_cents>100000 || a.currency!=="eur" || !/^price_[A-Za-z0-9_]+$/.test(a.stripe_price_id) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(a.filename) || a.filename.includes("..") ||
    !["application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(a.mime_type)) deny("asset_unavailable",404);
  if ((a.mime_type==="application/pdf" && !a.filename.endsWith(".pdf")) ||
    (a.mime_type!=="application/pdf" && !a.filename.endsWith(".docx"))) deny("asset_invalid");
}

export async function createStaticCheckout(d: StaticDeps, userId: string, body: Record<string, unknown>) {
  if (d.env("STATIC_CATALOG_SANDBOX_CHECKOUT_ENABLED")!=="true") return deny("static_checkout_closed",503);
  if (body.environment!=="sandbox") return deny("live_checkout_unavailable",403);
  if (!UUID.test(String(body.assetId)) || !UUID.test(String(body.requestId))) return deny("invalid_id",400);
  if (!(await isStaffUser(d.db,userId))) return deny("sandbox_forbidden",403);
  if (body.termsAccepted!==true || body.immediatePerformanceConsent!==true || body.withdrawalLossAcknowledged!==true) return deny("consent_required",400);
  const {data:a,error:ae}=await d.db.from("static_catalog_assets").select("*").eq("id",body.assetId).maybeSingle();
  if (ae) return deny("catalog_unavailable",503);
  assertStaticAsset(a);
  await staticFileBytes(a); // Prove deliverability before creating an order or calling Stripe.
  const order={id:body.requestId,user_id:userId,asset_id:a.id,asset_sha256:a.content_sha256,amount_cents:a.amount_cents,
    currency:a.currency,stripe_price_id:a.stripe_price_id,terms_version:LEGAL_VERSIONS.terms,refund_version:LEGAL_VERSIONS.refund,
    withdrawal_version:LEGAL_VERSIONS.withdrawal,terms_accepted:true,immediate_performance_consent:true,withdrawal_loss_acknowledged:true,environment:"sandbox"};
  const {error:insertError}=await d.db.from("static_catalog_orders").upsert(order,{onConflict:"id",ignoreDuplicates:true});
  if (insertError) return deny("order_unavailable",503);
  const {data:o,error:oe}=await d.db.from("static_catalog_orders").select("*").eq("id",body.requestId).maybeSingle();
  if (oe || !o || Object.entries(order).some(([k,v])=>o[k]!==v)) return deny("order_conflict");
  const stripe=d.stripe();
  const price=await stripe.prices.retrieve(a.stripe_price_id);
  if (!price || price.id!==a.stripe_price_id || price.livemode!==false || price.active!==true || price.type!=="one_time" || price.recurring ||
    price.unit_amount!==a.amount_cents || price.currency!==a.currency || price.tax_behavior!=="inclusive") return deny("price_mismatch");
  const session=await stripe.checkout.sessions.create({mode:"payment",line_items:[{price:a.stripe_price_id,quantity:1}],
    client_reference_id:o.id,payment_method_types:["card"],allow_promotion_codes:false,
    success_url:productReturnUrl(d.env("APP_BASE_URL"),`/checkout/return?session_id={CHECKOUT_SESSION_ID}&type=static_catalog`),
    cancel_url:productReturnUrl(d.env("APP_BASE_URL"),"/paketi"),
    metadata:{type:"static_catalog",userId,orderId:o.id,assetId:a.id,assetHash:a.content_sha256,environment:"sandbox"},
  },{idempotencyKey:`static-catalog:${userId}:${o.id}`});
  if (!session || !/^cs_test_[A-Za-z0-9_]+$/.test(session.id) || session.livemode!==false || !session.url) return deny("session_invalid");
  if (o.stripe_session_id && o.stripe_session_id!==session.id) return deny("session_conflict");
  const {data:bound,error:be}=await d.db.from("static_catalog_orders").update({stripe_session_id:session.id}).eq("id",o.id).eq("user_id",userId).select("id");
  if (be || !bound?.length) return deny("session_binding_failed",503);
  return {ok:true,order_id:o.id,url:session.url,environment:"sandbox"};
}

export async function staticFileBytes(a: Any): Promise<Uint8Array> {
  if (typeof a.content!=="string" || !/^\\x(?:[0-9a-f]{2})+$/.test(a.content) || a.content.length>4194306) return deny("asset_invalid");
  const hex: string=a.content.slice(2);
  const bytes=Uint8Array.from(hex.match(/../g)!,v=>parseInt(v,16));
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  if (Array.from(digest,v=>v.toString(16).padStart(2,"0")).join("")!==a.content_sha256) return deny("asset_integrity_failed");
  const magic=new TextDecoder().decode(bytes.slice(0,5));
  if (a.mime_type==="application/pdf" ? magic!=="%PDF-" : !(bytes[0]===0x50 && bytes[1]===0x4b && bytes[2]===3 && bytes[3]===4)) return deny("asset_invalid");
  return bytes;
}

export async function deliverStaticCatalog(d: StaticDeps,userId:string,orderId:unknown,cors:Record<string,string>={}) {
  if (!UUID.test(String(orderId))) return deny("not_found",404);
  // Delivery is independent of the new-checkout flag so paid re-downloads survive a checkout pause.
  if (!(await isStaffUser(d.db,userId))) return deny("sandbox_forbidden",403);
  const {data:e,error:ee}=await d.db.from("static_catalog_entitlements").select("*").eq("order_id",orderId).eq("user_id",userId).maybeSingle();
  if (ee) return deny("delivery_unavailable",503);
  if (!e || e.revoked_at || e.environment!=="sandbox" || !/^cs_test_[A-Za-z0-9_]+$/.test(e.stripe_session_id) || !e.stripe_event_id || !e.paid_at) return deny("not_found",404);
  const {data:o,error:oe}=await d.db.from("static_catalog_orders").select("*").eq("id",orderId).eq("user_id",userId).maybeSingle();
  const {data:a,error:ae}=await d.db.from("static_catalog_assets").select("*").eq("id",e.asset_id).maybeSingle();
  if (oe || ae) return deny("delivery_unavailable",503);
  assertStaticAsset(a);
  if (!o || o.stripe_session_id!==e.stripe_session_id || o.asset_id!==e.asset_id || o.asset_sha256!==e.asset_sha256 ||
    a.content_sha256!==e.asset_sha256 || o.amount_cents!==a.amount_cents || o.currency!==a.currency || o.stripe_price_id!==a.stripe_price_id ||
    o.environment!=="sandbox" || !o.terms_accepted || !o.immediate_performance_consent || !o.withdrawal_loss_acknowledged) return deny("payment_unverified");
  // Check the ledger too: an entitlement alone is not sufficient proof.
  const {data:proof,error:pe}=await d.db.from("static_catalog_payment_events").select("*").eq("stripe_event_id",e.stripe_event_id).maybeSingle();
  if (pe || !proof || proof.kind!=="paid" || proof.stripe_session_id!==e.stripe_session_id || Date.parse(proof.event_at)!==Date.parse(e.paid_at)) return deny("payment_unverified");
  const bytes=await staticFileBytes(a);
  // Last state read after hashing narrows the reversal race; bytes already delivered cannot be recalled.
  const {data:latest,error:le}=await d.db.from("static_catalog_entitlements").select("revoked_at").eq("order_id",orderId).eq("user_id",userId).maybeSingle();
  if (le) return deny("delivery_unavailable",503);
  if (!latest || latest.revoked_at) return deny("not_found",404);
  const responseBytes = new Uint8Array(bytes.length);
  responseBytes.set(bytes);
  return new Response(responseBytes.buffer,{headers:{...cors,"Content-Type":a.mime_type,"Content-Disposition":`attachment; filename="${a.filename}"`,
    "Cache-Control":"private, no-store, max-age=0","Pragma":"no-cache","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox; default-src 'none'; frame-ancestors 'none'","X-Frame-Options":"DENY"}});
}

export async function recordStaticPaid(d:StaticDeps,session:Any,env:string,proof:Any) {
  if (env!=="sandbox" || session.livemode!==false || session.mode!=="payment" || session.payment_status!=="paid") return deny("static_payment_environment_mismatch");
  const m=session.metadata;
  if (!m || m.type!=="static_catalog" || m.environment!=="sandbox" || !UUID.test(m.userId) || !UUID.test(m.orderId) || !UUID.test(m.assetId) || !HASH.test(m.assetHash) ||
    !/^cs_test_[A-Za-z0-9_]+$/.test(session.id) || !proof?.eventId || !proof?.paidAt) return deny("static_payment_proof_missing");
  if (!(await isStaffUser(d.db,m.userId))) return deny("sandbox_forbidden",403);
  const {data:o,error:oe}=await d.db.from("static_catalog_orders").select("*").eq("id",m.orderId).maybeSingle();
  if (oe || !o || o.user_id!==m.userId || o.asset_id!==m.assetId || o.asset_sha256!==m.assetHash || o.stripe_session_id!==session.id ||
    session.amount_total!==o.amount_cents || session.currency!==o.currency || session.client_reference_id!==o.id || session.amount_subtotal!==o.amount_cents ||
    session.total_details?.amount_discount!==0 || session.total_details?.amount_shipping!==0) return deny("static_payment_mismatch");
  const items=await d.stripe().checkout.sessions.listLineItems(session.id,{limit:2,expand:["data.price"]});
  const item=items?.data?.[0]; const price=item?.price;
  if (items.has_more || items?.data?.length!==1 || item.quantity!==1 || item.amount_total!==o.amount_cents || !price || price.id!==o.stripe_price_id ||
    price.livemode!==false || price.type!=="one_time" || price.recurring || price.unit_amount!==o.amount_cents || price.currency!==o.currency || price.tax_behavior!=="inclusive") return deny("static_line_items_mismatch");
  const {data,error}=await d.db.rpc("record_static_catalog_payment",{p_order_id:o.id,p_session_id:session.id,p_event_id:proof.eventId,p_paid_at:proof.paidAt,
    p_user_id:m.userId,p_asset_id:m.assetId,p_asset_sha256:m.assetHash,p_price_id:price.id,p_amount_cents:o.amount_cents,p_currency:o.currency});
  if (error || data?.ok!==true) return deny("static_payment_record_failed",503);
}

export async function reverseStaticPaid(d:StaticDeps,object:Any,env:string,kind:string,proof:Any) {
  if (env!=="sandbox") return;
  const id=(v:Any)=>typeof v==="string"?v:v?.id;
  let pi=id(object.payment_intent);
  if (!pi && id(object.charge)) pi=id((await d.stripe().charges.retrieve(id(object.charge))).payment_intent);
  if (!pi) return;
  const sessions=await d.stripe().checkout.sessions.list({payment_intent:pi,limit:3});
  const matching=(sessions?.data??[]).filter((s:Any)=>s.metadata?.type==="static_catalog" && s.metadata?.environment==="sandbox" && s.livemode===false && s.mode==="payment");
  if (sessions.has_more || matching.length!==1) return;
  const s=matching[0];
  if (!(await isStaffUser(d.db,s.metadata.userId))) return deny("sandbox_forbidden",403);
  if (!proof?.eventId || !proof?.paidAt) return deny("static_reversal_proof_missing");
  const {data,error}=await d.db.rpc("revoke_static_catalog_payment",{p_session_id:s.id,p_event_id:proof.eventId,p_event_at:proof.paidAt,p_kind:kind});
  if (error || data?.ok!==true) return deny("static_reversal_failed",503);
}

/** Legal report 12.10.2026: these templates need rework/clarification; registration is refused until a new reviewed version exists. */
export const STATIC_LEGAL_HOLD = /(predizvestie|prekratyavane.*naem|naem.*prekratyavane|garazh|parkomyast|eood|uchredyavane|priemo-predavatelen)/;

export function validateStaticAssetInput(b: Record<string, unknown>): { errors: string[]; bytes?: Uint8Array } {
  const errors: string[] = [];
  const s = (k: string) => typeof b[k] === "string" ? (b[k] as string).trim() : "";
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(s("productKey"))) errors.push("product_key_invalid");
  else if (STATIC_LEGAL_HOLD.test(s("productKey"))) errors.push("legal_rework_required");
  if (s("version").length < 1 || s("version").length > 80) errors.push("version_invalid");
  const fn = s("filename");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(fn) || fn.includes("..")) errors.push("filename_invalid");
  const mime = s("mimeType");
  const pdf = mime === "application/pdf";
  if (!pdf && mime !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") errors.push("mime_invalid");
  else if (!fn.endsWith(pdf ? ".pdf" : ".docx")) errors.push("extension_mismatch");
  if (!Number.isSafeInteger(b.amountCents) || (b.amountCents as number) < 1 || (b.amountCents as number) > 100000) errors.push("amount_invalid");
  if (!/^price_[A-Za-z0-9_]+$/.test(s("stripePriceId"))) errors.push("price_id_invalid");
  const ref = s("legalAcceptanceRef");
  if (ref.length < 3 || ref.length > 200) errors.push("legal_acceptance_ref_required");
  if (b.reviewerAttestation !== true) errors.push("reviewer_attestation_required");
  let bytes: Uint8Array | undefined;
  try {
    const raw = atob(s("contentBase64"));
    bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  } catch { errors.push("content_invalid"); }
  if (bytes) {
    if (bytes.length < 1 || bytes.length > 2097152) errors.push("content_size_invalid");
    const magicOk = pdf ? new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" : bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
    if (!magicOk) errors.push("content_type_mismatch");
  }
  return { errors, bytes };
}

const hex = (u: Uint8Array) => Array.from(u, (v) => v.toString(16).padStart(2, "0")).join("");

/** Staff-only. The reviewer is the authenticated staff account itself; acceptance time is server time. */
export async function registerStaticAsset(d: StaticDeps, userId: string, b: Record<string, unknown>) {
  if (!(await isStaffUser(d.db, userId))) return deny("sandbox_forbidden", 403);
  const { errors, bytes } = validateStaticAssetInput(b);
  if (errors.length) return { ok: false, errors };
  const sha = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes!)));
  const price = await d.stripe().prices.retrieve(String(b.stripePriceId).trim()).catch(() => null);
  if (!price || price.livemode !== false || price.active !== true || price.type !== "one_time" || price.recurring ||
    price.unit_amount !== b.amountCents || price.currency !== "eur" || price.tax_behavior !== "inclusive") return { ok: false, errors: ["price_mismatch"] };
  const row = { product_key: String(b.productKey).trim(), version: String(b.version).trim(), filename: String(b.filename).trim(),
    mime_type: String(b.mimeType).trim(), content: "\\x" + hex(bytes!), reviewer_ref: `staff:${userId}`,
    legal_acceptance_ref: String(b.legalAcceptanceRef).trim(), legal_accepted_at: new Date().toISOString(),
    environment: "sandbox", amount_cents: b.amountCents, currency: "eur", stripe_price_id: price.id };
  const { data, error } = await d.db.from("static_catalog_assets").insert(row).select("id,content_sha256").maybeSingle();
  if (error) return { ok: false, errors: [error.code === "23505" ? "version_exists" : "asset_insert_failed"] };
  if (data?.content_sha256 !== sha) return { ok: false, errors: ["asset_integrity_failed"] };
  return { ok: true, asset_id: data.id, sha256: sha };
}

/** Staff readiness view: metadata only, never file bytes. */
export async function staticReadiness(d: StaticDeps, userId: string) {
  if (!(await isStaffUser(d.db, userId))) return deny("sandbox_forbidden", 403);
  const { data, error } = await d.db.from("static_catalog_assets").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return deny("catalog_unavailable", 503);
  const assets = [];
  for (const a of data ?? []) {
    const errors: string[] = [];
    try { assertStaticAsset(a); await staticFileBytes(a); } catch (e) { errors.push(e instanceof StaticCatalogError ? e.code : "asset_invalid"); }
    if (STATIC_LEGAL_HOLD.test(a.product_key)) errors.push("legal_rework_required");
    assets.push({ id: a.id, product_key: a.product_key, version: a.version, filename: a.filename, sha256: a.content_sha256,
      amount_cents: a.amount_cents, reviewer_ref: a.reviewer_ref, legal_acceptance_ref: a.legal_acceptance_ref,
      legal_accepted_at: a.legal_accepted_at, revoked_at: a.revoked_at, ready: errors.length === 0, errors });
  }
  return { ok: true, checkout_enabled: d.env("STATIC_CATALOG_SANDBOX_CHECKOUT_ENABLED") === "true", assets };
}

export type StaticOrderState = "pending" | "paid" | "refunded" | "failed";
export function staticOrderState(o: Any, e: Any): StaticOrderState {
  if (e?.revoked_at) return "refunded";
  if (e?.paid_at && e?.stripe_event_id) return "paid";
  if (!o.stripe_session_id) return "failed";
  return "pending";
}

/** Owned purchases for the caller only. */
export async function listStaticOrders(d: StaticDeps, userId: string) {
  if (!(await isStaffUser(d.db, userId))) return deny("sandbox_forbidden", 403);
  const { data: orders, error } = await d.db.from("static_catalog_orders").select("id,asset_id,amount_cents,currency,stripe_session_id,created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
  if (error) return deny("orders_unavailable", 503);
  const { data: ents } = await d.db.from("static_catalog_entitlements").select("order_id,paid_at,revoked_at,stripe_event_id").eq("user_id", userId);
  const byOrder = new Map((ents ?? []).map((e: Any) => [e.order_id, e]));
  return { ok: true, orders: (orders ?? []).map((o: Any) => ({ id: o.id, asset_id: o.asset_id, amount_cents: o.amount_cents,
    currency: o.currency, created_at: o.created_at, state: staticOrderState(o, byOrder.get(o.id)) })) };
}
