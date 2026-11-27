import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { buildCors } from "../_shared/cors.ts";

const ZERO_DECIMAL = new Set(["bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg","rwf","ugx","vnd","vuv","xaf","xof","xpf"]);
const THREE_DECIMAL = new Set(["bhd","jod","kwd","omr","tnd"]);
function toMajor(amount: number | null | undefined, currency: string) {
  const v = amount ?? 0;
  const c = (currency ?? "").toLowerCase();
  if (ZERO_DECIMAL.has(c)) return v;
  if (THREE_DECIMAL.has(c)) return v / 1000;
  return v / 100;
}
function iso(s: number | null | undefined) { return s ? new Date(s * 1000).toISOString() : null; }

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (!user) throw new Error("Unauthorized");

    const { teamId, environment } = await req.json() as { teamId: string; environment: StripeEnv };
    if (!teamId) throw new Error("Missing teamId");
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");

    const { data: isAdmin } = await admin.rpc("is_team_admin", { _user_id: user.id, _team_id: teamId });
    if (!isAdmin) throw new Error("Not allowed");

    const { data: team } = await admin.from("teams").select("stripe_customer_id, stripe_subscription_id, seat_count, status, current_period_end").eq("id", teamId).maybeSingle();
    if (!team?.stripe_customer_id) return json({ subscription: null, invoices: [] });

    const stripe = createStripeClient(environment);
    let subscription: any = null;
    if (team.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(team.stripe_subscription_id);
        const item = sub.items?.data?.[0];
        const periodEnd = item?.current_period_end ?? (sub as any).current_period_end;
        subscription = {
          id: sub.id,
          status: sub.status,
          quantity: item?.quantity ?? team.seat_count,
          unit_amount: toMajor(item?.price?.unit_amount as number | null, (item?.price?.currency as string) ?? "eur"),
          currency: (item?.price?.currency as string) ?? "eur",
          interval: item?.price?.recurring?.interval ?? null,
          current_period_end: iso(periodEnd),
          cancel_at_period_end: sub.cancel_at_period_end ?? false,
        };
      } catch (e) {
        console.warn("retrieve subscription failed:", e);
      }
    }

    const invList = await stripe.invoices.list({ customer: team.stripe_customer_id, limit: 10 });
    const invoices = invList.data.map((inv) => ({
      id: inv.id ?? "",
      number: inv.number,
      status: inv.status,
      amount_paid: toMajor(inv.amount_paid, inv.currency),
      currency: inv.currency,
      created: iso(inv.created),
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
      pdf_url: inv.invoice_pdf ?? null,
    }));

    return json({ subscription, invoices });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 400);
  }
});
