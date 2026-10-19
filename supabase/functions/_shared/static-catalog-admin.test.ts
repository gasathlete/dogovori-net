// Integration tests for the static catalog orchestration over an in-memory ledger (no network, no secrets).
// The fake RPCs mirror the SQL guards in docs/migrations/static_catalog_env_upgrade_2026_10_19.sql.
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createStaticCheckout, deliverStaticCatalog, listStaticCatalog, listStaticOrders, recordStaticPaid, registerStaticAsset,
  reverseStaticPaid, staticOrderState, validateStaticAssetInput, type StaticEnv,
} from "./static-catalog.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const STAFF = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const PDF = new TextEncoder().encode("%PDF-1.7 SYNTHETIC TEST FIXTURE - not legally reviewed");
const hexOf = (u: Uint8Array) => Array.from(u, (v) => v.toString(16).padStart(2, "0")).join("");
const sha = async (u: Uint8Array) => hexOf(new Uint8Array(await crypto.subtle.digest("SHA-256", u)));
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return (e as { code?: string }).code ?? String(e); } };

function makeDb(staff: string[]) {
  const t: Record<string, Row[]> = { static_catalog_assets: [], static_catalog_orders: [], static_catalog_payment_events: [],
    static_catalog_entitlements: [], static_catalog_asset_reviews: [], static_catalog_reviewers: [] };
  const query = (name: string) => {
    const filters: ((r: Row) => boolean)[] = []; let lim = 1000; let desc = false; let patch: Row | null = null;
    const rows = () => { let r = t[name].filter((x) => filters.every((f) => f(x))); if (desc) r = [...r].reverse(); return r.slice(0, lim); };
    const q: Row = {
      select: () => q, eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q), is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), q),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q), order: (_k: string, o?: { ascending?: boolean }) => (desc = o?.ascending === false, q),
      limit: (n: number) => (lim = n, q),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: (v: unknown) => void) => {
        if (patch) { const hit = rows(); hit.forEach((r) => Object.assign(r, patch)); return res({ data: hit, error: null }); }
        return res({ data: rows(), error: null });
      },
      update: (p: Row) => (patch = p, q),
      upsert: async (r: Row) => { if (!t[name].some((x) => x.id === r.id)) t[name].push({ ...r, created_at: new Date().toISOString() }); return { error: null }; },
      insert: (r: Row) => {
        const row = { id: crypto.randomUUID(), created_at: new Date(Date.now() + t[name].length).toISOString(), ...r };
        if (name === "static_catalog_assets") {
          row.content_sha256 = ""; // computed below like the generated column
          const bytes = Uint8Array.from((r.content as string).slice(2).match(/../g)!, (v) => parseInt(v, 16));
          const p = sha(bytes).then((h) => { row.content_sha256 = h; t[name].push(row); return { data: row, error: null }; });
          return { select: () => ({ maybeSingle: () => p }) };
        }
        t[name].push(row);
        return Object.assign(Promise.resolve({ error: null }), { select: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) });
      },
    };
    return q;
  };
  const rpc = async (fn: string, a: Row) => {
    if (fn === "is_staff") return { data: staff.includes(a._user_id), error: null };
    const prefix = a.p_environment === "live" ? "cs_live_" : "cs_test_";
    if (!a.p_session_id.startsWith(prefix)) return { data: null, error: { message: "invalid_payment_proof" } };
    if (fn === "record_static_catalog_payment_env") {
      const o = t.static_catalog_orders.find((x) => x.id === a.p_order_id);
      if (!o || o.environment !== a.p_environment || o.stripe_session_id !== a.p_session_id) return { data: null, error: { message: "static_payment_mismatch" } };
      if (!t.static_catalog_payment_events.some((e) => e.stripe_event_id === a.p_event_id))
        t.static_catalog_payment_events.push({ stripe_event_id: a.p_event_id, stripe_session_id: a.p_session_id, event_at: a.p_paid_at, kind: "paid", environment: a.p_environment });
      const rev = t.static_catalog_payment_events.find((e) => e.stripe_session_id === a.p_session_id && e.kind !== "paid");
      if (!t.static_catalog_entitlements.some((e) => e.order_id === o.id))
        t.static_catalog_entitlements.push({ order_id: o.id, user_id: o.user_id, asset_id: o.asset_id, asset_sha256: o.asset_sha256, stripe_session_id: a.p_session_id,
          stripe_event_id: a.p_event_id, paid_at: a.p_paid_at, revoked_at: rev?.event_at ?? null, environment: a.p_environment });
      return { data: { ok: true }, error: null };
    }
    if (fn === "revoke_static_catalog_payment_env") {
      if (!t.static_catalog_payment_events.some((e) => e.stripe_event_id === a.p_event_id))
        t.static_catalog_payment_events.push({ stripe_event_id: a.p_event_id, stripe_session_id: a.p_session_id, event_at: a.p_event_at, kind: a.p_kind, environment: a.p_environment });
      t.static_catalog_entitlements.filter((e) => e.stripe_session_id === a.p_session_id && e.environment === a.p_environment).forEach((e) => e.revoked_at ??= a.p_event_at);
      return { data: { ok: true }, error: null };
    }
    return { data: null, error: { message: "unknown_rpc" } };
  };
  return { t, db: { from: query, rpc } };
}

function stripeFor(env: StaticEnv) {
  const live = env === "live";
  const sessions: Row[] = [];
  return {
    sessions,
    client: {
      prices: { retrieve: async (id: string) => ({ id, livemode: live, active: true, type: "one_time", recurring: null, unit_amount: 299, currency: "eur", tax_behavior: "inclusive" }) },
      checkout: { sessions: {
        create: async (p: Row) => { const s = { id: `${live ? "cs_live_" : "cs_test_"}${sessions.length + 1}`, livemode: live, url: "https://checkout.example/s", ...p }; sessions.push(s); return s; },
        listLineItems: async () => ({ has_more: false, data: [{ quantity: 1, amount_total: 299, price: { id: "price_x", livemode: live, type: "one_time", recurring: null, unit_amount: 299, currency: "eur", tax_behavior: "inclusive" } }] }),
        list: async () => ({ has_more: false, data: sessions.map((s) => ({ ...s, mode: "payment", payment_intent: "pi_1" })) }),
      } },
      charges: { retrieve: async () => ({ payment_intent: "pi_1" }) },
    },
  };
}

async function world(flags: Record<string, string> = { STATIC_CATALOG_SANDBOX_CHECKOUT_ENABLED: "true", STATIC_CATALOG_LIVE_CHECKOUT_ENABLED: "true" }) {
  const { t, db } = makeDb([STAFF]);
  const sb = stripeFor("sandbox"), lv = stripeFor("live");
  const deps = { db, env: (k: string) => flags[k], stripe: (e: StaticEnv) => (e === "live" ? lv : sb).client };
  t.static_catalog_reviewers.push({ user_id: STAFF, capacity: "owner_operator", active: true });
  const reg = (env: StaticEnv, extra: Row = {}) => registerStaticAsset(deps, STAFF, { environment: env, productKey: "dogovor-za-uslugi", templateSlug: "dogovor-za-uslugi",
    sourceRef: "SYNTHETIC test fixture", version: `${env}-1`, filename: "uslugi.pdf", mimeType: "application/pdf", contentBase64: btoa(String.fromCharCode(...PDF)),
    amountCents: 299, stripePriceId: "price_x", reviewRef: "SYNTHETIC-NO-LEGAL-REVIEW", reviewerAttestation: true, ...extra });
  return { t, deps, sb, lv, reg };
}

const consent = { termsAccepted: true, immediatePerformanceConsent: true, withdrawalLossAcknowledged: true };
async function buy(w: Awaited<ReturnType<typeof world>>, env: StaticEnv, user: string) {
  const asset = w.t.static_catalog_assets.find((a) => a.environment === env)!;
  const orderId = crypto.randomUUID();
  await createStaticCheckout(w.deps, user, { action: "checkout", environment: env, assetId: asset.id, requestId: orderId, ...consent });
  const o = w.t.static_catalog_orders.find((x) => x.id === orderId)!;
  const session = { id: o.stripe_session_id, livemode: env === "live", mode: "payment", payment_status: "paid", amount_total: 299, amount_subtotal: 299, currency: "eur",
    client_reference_id: orderId, total_details: { amount_discount: 0, amount_shipping: 0 },
    metadata: { type: "static_catalog", userId: user, orderId, assetId: asset.id, assetHash: asset.content_sha256, environment: env } };
  return { orderId, session };
}

Deno.test("register requires an authorized reviewer; identity/capacity come from the registry, not the form", async () => {
  const w = await world();
  assertEquals(await code(registerStaticAsset(w.deps, CUSTOMER, {})), "staff_required");
  const r = await w.reg("sandbox");
  assertEquals(r.ok, true);
  assertEquals(w.t.static_catalog_asset_reviews[0].reviewer_user_id, STAFF);
  assertEquals(w.t.static_catalog_assets[0].reviewer_ref, `owner_operator:${STAFF}`);
  assertEquals(validateStaticAssetInput({ reviewerAttestation: false }).errors.includes("reviewer_attestation_required"), true);
  assertEquals(validateStaticAssetInput({ sourceRef: "" }).errors.includes("source_ref_required"), true);
});

Deno.test("asset without accepted review (e.g. unreviewed candidate) is not sold; withdrawn acceptance hides it", async () => {
  const w = await world();
  await w.reg("live");
  const a = w.t.static_catalog_assets[0];
  w.t.static_catalog_asset_reviews.length = 0; // simulate upload whose review was never recorded
  assertEquals((await listStaticCatalog(w.deps, CUSTOMER, "live")).items.length, 0);
  assertEquals(await code(createStaticCheckout(w.deps, CUSTOMER, { environment: "live", assetId: a.id, requestId: crypto.randomUUID(), ...consent })), "asset_not_accepted");
  w.t.static_catalog_asset_reviews.push({ asset_id: a.id, asset_sha256: a.content_sha256, decision: "accepted", created_at: "2026-01-01" },
    { asset_id: a.id, asset_sha256: a.content_sha256, decision: "rejected", created_at: "2026-01-02" });
  assertEquals((await listStaticCatalog(w.deps, CUSTOMER, "live")).items.length, 0);
});

Deno.test("a new corrected version of the same document can be accepted by a human reviewer", async () => {
  const w = await world();
  await w.reg("live");
  assertEquals((await w.reg("live", { version: "live-2" })).ok, true);
  assertEquals((await listStaticCatalog(w.deps, CUSTOMER, "live")).items.length, 2);
});

Deno.test("sandbox is staff-only, live is open to ordinary customers", async () => {
  const w = await world();
  await w.reg("sandbox"); await w.reg("live");
  assertEquals(await code(listStaticCatalog(w.deps, CUSTOMER, "sandbox")), "sandbox_forbidden");
  assertEquals((await listStaticCatalog(w.deps, CUSTOMER, "live")).items.length, 1);
});

Deno.test("live checkout flag defaults closed; consents required", async () => {
  const w = await world({});
  await w.reg("live");
  const a = w.t.static_catalog_assets[0];
  assertEquals(await code(createStaticCheckout(w.deps, CUSTOMER, { environment: "live", assetId: a.id, requestId: crypto.randomUUID(), ...consent })), "static_checkout_closed");
  const w2 = await world(); await w2.reg("live");
  assertEquals(await code(createStaticCheckout(w2.deps, CUSTOMER, { environment: "live", assetId: w2.t.static_catalog_assets[0].id, requestId: crypto.randomUUID(), ...consent, termsAccepted: false })), "consent_required");
});

Deno.test("full live flow: pending → paid → owned download, replay idempotent, refund revokes, other user denied", async () => {
  const w = await world();
  await w.reg("live");
  const { orderId, session } = await buy(w, "live", CUSTOMER);
  assertEquals((await listStaticOrders(w.deps, CUSTOMER)).orders[0].state, "pending");
  await recordStaticPaid(w.deps, session, "live", { eventId: "evt_paid1", paidAt: "2026-10-19T10:00:00Z" });
  await recordStaticPaid(w.deps, session, "live", { eventId: "evt_paid1", paidAt: "2026-10-19T10:00:00Z" }); // replay
  assertEquals(w.t.static_catalog_entitlements.length, 1);
  assertEquals((await listStaticOrders(w.deps, CUSTOMER, orderId)).orders[0].state, "paid");
  const res = await deliverStaticCatalog(w.deps, CUSTOMER, orderId) as Response;
  assertEquals(new Uint8Array(await res.arrayBuffer()).length, PDF.length);
  const again = await deliverStaticCatalog(w.deps, CUSTOMER, orderId) as Response; await again.arrayBuffer(); // repeat download
  assertEquals(await code(deliverStaticCatalog(w.deps, OTHER, orderId)), "not_found");
  assertEquals((await listStaticOrders(w.deps, OTHER)).orders.length, 0);
  await reverseStaticPaid(w.deps, { payment_intent: "pi_1", livemode: true }, "live", "refund_full", { eventId: "evt_ref1", paidAt: "2026-10-19T11:00:00Z" });
  assertEquals(await code(deliverStaticCatalog(w.deps, CUSTOMER, orderId)), "not_found");
  assertEquals((await listStaticOrders(w.deps, CUSTOMER)).orders[0].state, "refunded");
});

Deno.test("downloads survive a checkout pause", async () => {
  const flags: Record<string, string> = { STATIC_CATALOG_LIVE_CHECKOUT_ENABLED: "true" };
  const w = await world(flags);
  await w.reg("live");
  const { orderId, session } = await buy(w, "live", CUSTOMER);
  await recordStaticPaid(w.deps, session, "live", { eventId: "evt_p", paidAt: "2026-10-19T10:00:00Z" });
  delete flags.STATIC_CATALOG_LIVE_CHECKOUT_ENABLED;
  const res = await deliverStaticCatalog(w.deps, CUSTOMER, orderId) as Response;
  assertEquals(res.status, 200); await res.arrayBuffer();
});

Deno.test("out-of-order: refund before paid webhook leaves entitlement revoked", async () => {
  const w = await world();
  await w.reg("live");
  const { orderId, session } = await buy(w, "live", CUSTOMER);
  await reverseStaticPaid(w.deps, { payment_intent: "pi_1", livemode: true }, "live", "refund_full", { eventId: "evt_r", paidAt: "2026-10-19T09:00:00Z" });
  await recordStaticPaid(w.deps, session, "live", { eventId: "evt_p", paidAt: "2026-10-19T10:00:00Z" });
  assertEquals(await code(deliverStaticCatalog(w.deps, CUSTOMER, orderId)), "not_found");
});

Deno.test("environment confusion: live event for test order and test event for live order are rejected", async () => {
  const w = await world();
  await w.reg("sandbox"); await w.reg("live");
  const test = await buy(w, "sandbox", STAFF);
  await assertRejects(() => recordStaticPaid(w.deps, { ...test.session, livemode: true }, "live", { eventId: "evt_x", paidAt: "2026-10-19T10:00:00Z" }));
  await assertRejects(() => recordStaticPaid(w.deps, test.session, "live", { eventId: "evt_x", paidAt: "2026-10-19T10:00:00Z" }));
  const live = await buy(w, "live", CUSTOMER);
  await assertRejects(() => recordStaticPaid(w.deps, live.session, "sandbox", { eventId: "evt_y", paidAt: "2026-10-19T10:00:00Z" }));
  await assertRejects(() => recordStaticPaid(w.deps, { ...live.session, metadata: { ...live.session.metadata, environment: "sandbox" }, livemode: false }, "sandbox", { eventId: "evt_y", paidAt: "2026-10-19T10:00:00Z" }));
  assertEquals(w.t.static_catalog_entitlements.length, 0);
  await recordStaticPaid(w.deps, live.session, "live", { eventId: "evt_ok", paidAt: "2026-10-19T10:00:00Z" });
  await reverseStaticPaid(w.deps, { payment_intent: "pi_1", livemode: false }, "live", "refund_full", { eventId: "evt_z", paidAt: "2026-10-19T11:00:00Z" });
  assertEquals(w.t.static_catalog_entitlements[0].revoked_at, null); // test-mode refund object cannot revoke live
});

Deno.test("a paid entitlement without a matching paid ledger event is not delivered", async () => {
  const w = await world();
  await w.reg("live");
  const { orderId, session } = await buy(w, "live", CUSTOMER);
  await recordStaticPaid(w.deps, session, "live", { eventId: "evt_p", paidAt: "2026-10-19T10:00:00Z" });
  w.t.static_catalog_payment_events[0].environment = "sandbox";
  assertEquals(await code(deliverStaticCatalog(w.deps, CUSTOMER, orderId)), "payment_unverified");
});

Deno.test("order state derives only from webhook ledger", () => {
  assertEquals(staticOrderState({ stripe_session_id: "cs_live_1" }, { paid_at: "x" }), "pending");
  assertEquals(staticOrderState({ stripe_session_id: null }, null), "failed");
});
