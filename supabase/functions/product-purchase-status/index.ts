/**
 * Само за четене: може ли този посетител да започне НОВА покупка на
 * еднократен продукт в дадената среда. Не създава сесия, не пише нищо и не
 * разкрива нищо освен общ статус. create-product-checkout остава
 * единственият авторитет и проверява всичко отново.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { buildCors } from "../_shared/cors.ts";
import { publicProductLaunchAllowed, type LaunchGateClient } from "../_shared/product-launch-gate.ts";
import { isStaffUser } from "../_shared/sandbox-guard.ts";
import { purchaseStatus } from "./status.ts";

const Body = z.object({ environment: z.enum(["sandbox", "live"]) });

Deno.serve(async (req) => {
  const cors = buildCors(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_body" }, 400);
  const { environment } = parsed.data;

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let userId: string | null = null;
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      const { data } = await admin.auth.getUser(auth.slice(7));
      userId = data?.user?.id ?? null;
    }
    const launchOpen = await publicProductLaunchAllowed(admin as unknown as LaunchGateClient, environment);
    const staff = environment === "sandbox" && userId ? await isStaffUser(admin, userId) : false;
    return json(purchaseStatus({ environment, launchOpen, signedIn: userId !== null, staff }));
  } catch {
    // Fail-closed: при съмнение показваме „Скоро“, не формуляр.
    return json({ available: false, reason: "unavailable" });
  }
});
