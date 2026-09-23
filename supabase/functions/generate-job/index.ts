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
//
// Надеждност:
//  - `idempotency_key`: същият ключ в рамките на 15 мин връща същия job (без
//    двойно създаване/таксуване при „Опитай отново" или втори таб).
//  - Таймаут на upstream извикването + маркиране на „висящи" jobs като
//    `job_timeout` при проверка на статуса — няма вечно `running`.
//  - Типизиран `error_code` за всеки неуспех.
//  - Статус по HTTP е каноничен (`completed`), в базата остава `done`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { getCorrelationId, correlationHeaders } from "../_shared/correlation.ts";
import { restrictedIdentifierBlock } from "../_shared/text-identifier-gate.ts";
import {
  IDEMPOTENCY_WINDOW_MS,
  JOB_MAX_RUNTIME_MS,
  STORED_STATUS,
  UPSTREAM_TIMEOUT_MS,
  classifyUpstreamFailure,
  isValidIdempotencyKey,
  normalizeJobStatus,
} from "../_shared/generation-status.ts";

interface StartBody {
  action?: "start" | "status";
  job_id?: string;
  payload?: Record<string, unknown>;
  idempotency_key?: string;
}

interface JobRow {
  id: string;
  status: string;
  result: unknown;
  error: string | null;
  error_code: string | null;
  http_status: number | null;
  created_at?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jobResponse(job: JobRow) {
  return {
    job_id: job.id,
    status: normalizeJobStatus(job.status),
    result: job.result ?? null,
    error: job.error ?? null,
    code: job.error_code ?? null,
    http_status: job.http_status ?? null,
  };
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
      if (!body.job_id || typeof body.job_id !== "string" || !UUID_RE.test(body.job_id)) {
        return json({ error: "Липсва или невалиден job_id", code: "bad_request" }, 400);
      }
      const { data: job, error } = await admin
        .from("generation_jobs")
        .select("id, status, result, error, error_code, http_status, created_at")
        .eq("id", body.job_id)
        .maybeSingle();
      if (error) return json({ error: "Неуспешна проверка на статуса", code: "internal_error" }, 500);
      if (!job) return json({ error: "Заявката не е намерена", code: "not_found" }, 404);

      // Stale sweeper: job, който „виси" над лимита, се затваря като таймаут,
      // за да не полва клиентът до безкрай и за да е измерим провалът.
      const row = job as JobRow;
      if (normalizeJobStatus(row.status) === "running" && row.created_at) {
        const age = Date.now() - Date.parse(row.created_at);
        if (Number.isFinite(age) && age > JOB_MAX_RUNTIME_MS) {
          const patch = {
            status: STORED_STATUS.error,
            error: "Генерирането надхвърли максималното време.",
            error_code: "job_timeout",
            duration_ms: Math.round(age),
            updated_at: new Date().toISOString(),
          };
          await admin.from("generation_jobs").update(patch).eq("id", row.id).eq("status", "running");
          return json(jobResponse({ ...row, ...patch }));
        }
      }
      return json(jobResponse(row));
    }

    // ---------- start ----------
    const payload = body.payload;
    if (!payload || typeof payload !== "object") {
      return json({ error: "Липсват данни за генериране", code: "bad_request" }, 400);
    }

    // Преграда за ограничени идентификатори: ПРЕДИ създаване на задача и
    // ПРЕДИ препращане към генератора.
    {
      const blocked = restrictedIdentifierBlock(payload, {
        ...corsHeaders,
        ...correlationHeaders(correlationId),
      });
      if (blocked) return blocked;
    }

    let userId: string | null = null;
    if (authHeader.startsWith("Bearer ")) {
      const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = u?.user?.id ?? null;
    }

    const idemKey = isValidIdempotencyKey(body.idempotency_key) ? body.idempotency_key : null;

    // Идемпотентност: същият ключ → същият job (ако още върви или е готов).
    if (idemKey) {
      const since = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS).toISOString();
      const { data: existing } = await admin
        .from("generation_jobs")
        .select("id, status, result, error, error_code, http_status, created_at")
        .eq("idempotency_key", idemKey)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        const st = normalizeJobStatus((existing as JobRow).status);
        if (st === "running" || st === "completed") {
          return json({ ...jobResponse(existing as JobRow), reused: true }, st === "running" ? 202 : 200);
        }
      }
    }

    const { data: job, error: insErr } = await admin
      .from("generation_jobs")
      .insert({
        user_id: userId,
        status: STORED_STATUS.running,
        correlation_id: correlationId,
        ...(idemKey ? { idempotency_key: idemKey } : {}),
      })
      .select("id")
      .single();
    if (insErr || !job) {
      // Състезание между два старта с еднакъв ключ → уникалният индекс отхвърля
      // втория; връщаме първия job вместо грешка.
      if (idemKey && insErr && /duplicate|unique|23505/i.test(`${insErr.code ?? ""} ${insErr.message ?? ""}`)) {
        const { data: winner } = await admin
          .from("generation_jobs")
          .select("id, status, result, error, error_code, http_status, created_at")
          .eq("idempotency_key", idemKey)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (winner) return json({ ...jobResponse(winner as JobRow), reused: true }, 202);
      }
      console.error("generate-job insert failed", insErr);
      return json({ error: "Неуспешно стартиране на генерирането", code: "internal_error" }, 500);
    }

    const run = async () => {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
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
          signal: controller.signal,
        });
        // Тялото е отговор на нашата функция (не AI съдържание) — затова е безопасно.
        const bodyText = await res.text();
        let parsed: unknown = null;
        try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch { /* нетипичен отговор */ }

        const asObj = (parsed ?? {}) as { error?: string; code?: string; retry_after_seconds?: number };

        // ПРАВНА ПРЕГРАДА: 503 legal_verification_unavailable се пренася
        // непокътната — задачата НЕ се маркира като завършена, не се харчи
        // втора квота и не се превръща в обща 500 грешка.
        if (asObj.code === "legal_verification_unavailable") {
          await admin.from("generation_jobs").update({
            status: STORED_STATUS.rejected,
            result: parsed ?? null,
            error: asObj.error ?? "legal_verification_unavailable",
            error_code: "legal_verification_unavailable",
            http_status: res.status || 503,
            duration_ms: Date.now() - started,
            updated_at: new Date().toISOString(),
          }).eq("id", job.id);
          return;
        }

        if (res.ok && parsed && !asObj.error) {
          await admin.from("generation_jobs").update({
            status: STORED_STATUS.completed, result: parsed, duration_ms: Date.now() - started, updated_at: new Date().toISOString(),
          }).eq("id", job.id);
          return;
        }
        // 4xx с тяло (нужно потвърждение, квота, чувствителни данни) стигат до
        // клиента непокътнати — UI-ът вече знае как да ги обработи.
        // 2xx с {error} = логическа грешка на upstream (напр. невалиден AI JSON) → error.
        const errorCode = classifyUpstreamFailure({
          httpStatus: res.status,
          bodyCode: asObj.code ?? null,
          bodyError: asObj.error ?? null,
        });
        await admin.from("generation_jobs").update({
          status: res.ok ? STORED_STATUS.error : STORED_STATUS.rejected,
          result: parsed ?? null,
          error: asObj.error ?? `http_${res.status}`,
          error_code: errorCode,
          http_status: res.status,
          duration_ms: Date.now() - started,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
      } catch (e) {
        const thrown = e instanceof Error ? e.message : String(e);
        const aborted = controller.signal.aborted || /abort/i.test(thrown);
        console.error(`generate-job background failure [cid=${correlationId}]`, aborted ? "upstream timeout" : e);
        await admin.from("generation_jobs").update({
          status: STORED_STATUS.error,
          error: aborted ? "Генерирането надхвърли максималното време." : thrown,
          error_code: aborted ? "job_timeout" : classifyUpstreamFailure({ thrown }),
          duration_ms: Date.now() - started,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
      } finally {
        clearTimeout(timer);
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
    return json({ error: e instanceof Error ? e.message : "Неочаквана грешка", code: "internal_error" }, 500);
  }
});
