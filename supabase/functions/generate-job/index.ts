// Асинхронно генериране на документ.
//
// Защо: `generate-contract` е дълга AI операция (често 60–150 s). При директно
// извикване от браузъра всяко прекъсване на връзката/мобилната мрежа връща
// „Failed to send a request to the Edge Function" и цялата работа се губи —
// това беше основната причина за ~60% провалени генерирания.
//
// Тук работата се изнася във фонов task (`EdgeRuntime.waitUntil`), клиентът
// получава job_id за милисекунди и след това само полва статуса. Мрежов срив
// по време на полването е безвреден — резултатът чака в базата.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { getCorrelationId, correlationHeaders } from "../_shared/correlation.ts";

interface StartBody {
  action?: "start" | "status";
  job_id?: string;
  payload?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const corsHeaders = buildCors(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json().catch(() => ({}))) as StartBody;
    const action = body.action ?? "start";
    const authHeader = req.headers.get("Authorization") ?? "";

    // ---------- status ----------
    if (action === "status") {
      if (!body.job_id || typeof body.job_id !== "string") {
        return json({ error: "Липсва job_id" }, 400);
      }
      const { data: job, error } = await admin
        .from("generation_jobs")
        .select("id, status, result, error, error_code, http_status")
        .eq("id", body.job_id)
        .maybeSingle();
      if (error) return json({ error: "Неуспешна проверка на статуса" }, 500);
      if (!job) return json({ error: "Заявката не е намерена" }, 404);
      return json({
        job_id: job.id,
        status: job.status,
        result: job.result ?? null,
        error: job.error ?? null,
        code: job.error_code ?? null,
        http_status: job.http_status ?? null,
      });
    }

    // ---------- start ----------
    const payload = body.payload;
    if (!payload || typeof payload !== "object") return json({ error: "Липсват данни за генериране" }, 400);

    let userId: string | null = null;
    if (authHeader.startsWith("Bearer ")) {
      const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = u?.user?.id ?? null;
    }

    const { data: job, error: insErr } = await admin
      .from("generation_jobs")
      .insert({ user_id: userId, status: "running", correlation_id: correlationId })
      .select("id")
      .single();
    if (insErr || !job) {
      console.error("generate-job insert failed", insErr);
      return json({ error: "Неуспешно стартиране на генерирането" }, 500);
    }

    const run = async () => {
      const started = Date.now();
      try {
        // Извикваме съществуващата функция сървър-към-сървър: същата логика,
        // квоти и лимити, но без чуплива браузър връзка.
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-contract`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            ...(authHeader ? { Authorization: authHeader } : {}),
            "x-correlation-id": correlationId,
            "x-forwarded-for": req.headers.get("x-forwarded-for") ?? "",
          },
          body: JSON.stringify(payload),
        });
        // Тялото е отговор на нашата функция (не AI съдържание) — затова е безопасно.
        const bodyText = await res.text();
        let parsed: unknown = null;
        try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch { /* нетипичен отговор */ }

        const asObj = (parsed ?? {}) as { error?: string; code?: string };
        if (res.ok && parsed && !asObj.error) {
          await admin.from("generation_jobs").update({
            status: "done", result: parsed, duration_ms: Date.now() - started, updated_at: new Date().toISOString(),
          }).eq("id", job.id);
          return;
        }
        // 4xx с тяло (нужно потвърждение, квота, чувствителни данни) стигат до
        // клиента непокътнати — UI-ът вече знае как да ги обработи.
        await admin.from("generation_jobs").update({
          status: res.ok ? "error" : "rejected",
          result: parsed ?? null,
          error: asObj.error ?? `http_${res.status}`,
          error_code: asObj.code ?? null,
          http_status: res.status,
          duration_ms: Date.now() - started,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
      } catch (e) {
        console.error("generate-job background failure", e);
        await admin.from("generation_jobs").update({
          status: "error",
          error: e instanceof Error ? e.message : String(e),
          error_code: "background_failure",
          duration_ms: Date.now() - started,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
      }
    };

    // @ts-ignore EdgeRuntime е налично в Supabase Edge Runtime.
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(run());
    } else {
      void run();
    }

    return json({ job_id: job.id, status: "running" }, 202);
  } catch (e) {
    console.error("generate-job error", e);
    return json({ error: e instanceof Error ? e.message : "Неочаквана грешка" }, 500);
  }
});
