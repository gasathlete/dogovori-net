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
//  - `idempotency_key`: сървърен ключ (собственик + payload + клиентски ключ)
//    връща същия собствен job (без двойно създаване/таксуване).
//  - Таймаут на upstream извикването; „висящ" job се показва като
//    `job_timeout` при статус (само четене) — няма вечно `running`.
//  - Типизиран `error_code` за всеки неуспех.
//  - Статус по HTTP е каноничен (`completed`), в базата остава `done`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { getCorrelationId, correlationHeaders } from "../_shared/correlation.ts";
import { restrictedIdentifierBlock } from "../_shared/text-identifier-gate.ts";
import {
  JOB_MAX_RUNTIME_MS,
  STORED_STATUS,
  UPSTREAM_TIMEOUT_MS,
  classifyUpstreamFailure,
  isValidIdempotencyKey,
  normalizeJobStatus,
} from "../_shared/generation-status.ts";

// Сигурност (Gate 8):
//  - status: САМО удостоверен собственик; SELECT е ограничен по id И user_id.
//    Невалиден Bearer НЕ се понижава до анонимен. Статусът е само четене —
//    „висящ" job се показва като job_timeout, без запис.
//  - Стари анонимни задачи (user_id NULL) нямат доказуем собственик → отказ.
//  - start: сървърният ключ се извежда от проверения собственик + каноничен
//    payload + клиентския ключ; всяко търсене е ограничено и по user_id.
//  - Нов старт минава през същия server-side флаг generate_contract СЛЕД
//    точното възпроизвеждане и ПРЕДИ запис/фон/препращане.
import { isNewProcessingOpen, newProcessingClosedResponse } from "../_shared/new-processing-gate.ts";
import { generationJobServerKey, readOnlyJobView } from "../_shared/generation-job-auth.ts";

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
const JOB_COLS = "id, status, result, error, error_code, http_status, created_at";

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
  if (req.method !== "POST") return json({ error: "Методът не е разрешен", code: "method_not_allowed" }, 405);

  try {
    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return json({ error: "Невалидна заявка", code: "bad_request" }, 400);
    }
    const body = raw as Record<string, unknown>;
    const action = body.action;
    if (action !== "start" && action !== "status") {
      return json({ error: "Непознато действие", code: "bad_request" }, 400);
    }

    // Предварителна валидация БЕЗ мрежа.
    if (action === "status") {
      if (typeof body.job_id !== "string" || !UUID_RE.test(body.job_id)) {
        return json({ error: "Липсва или невалиден job_id", code: "bad_request" }, 400);
      }
    } else {
      const p = body.payload;
      if (!p || typeof p !== "object" || Array.isArray(p)) {
        return json({ error: "Липсват данни за генериране", code: "bad_request" }, 400);
      }
      if (!isValidIdempotencyKey(body.idempotency_key)) {
        return json({ error: "Невалиден ключ на заявката", code: "bad_request" }, 400);
      }
    }

    // Удостоверяване. Липсващ header или точно публичният anon ключ = анонимен.
    // Всеки друг Bearer трябва да е валидна сесия; иначе 401 (без понижаване).
    const authHeader = req.headers.get("Authorization") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    let userId: string | null = null;
    if (authHeader) {
      const m = /^Bearer (\S+)$/.exec(authHeader);
      if (!m) return json({ error: "Невалидна сесия", code: "unauthorized" }, 401);
      const token = m[1];
      if (!(anonKey && token === anonKey)) {
        const { data: u, error: uErr } = await admin.auth.getUser(token);
        const id = u?.user?.id;
        if (uErr || typeof id !== "string" || !UUID_RE.test(id)) {
          return json({ error: "Невалидна сесия", code: "unauthorized" }, 401);
        }
        userId = id;
      }
    }

    // ---------- status (само четене, само собственик) ----------
    if (action === "status") {
      if (!userId) {
        // Няма доказуем собственик за анонимни задачи → не разкриваме нищо.
        return json({ error: "Влезте в профила си, за да видите заявката.", code: "unauthorized", requires_login: true }, 401);
      }
      const { data: job, error } = await admin
        .from("generation_jobs")
        .select(JOB_COLS)
        .eq("id", body.job_id as string)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return json({ error: "Неуспешна проверка на статуса", code: "internal_error" }, 500);
      if (!job) return json({ error: "Заявката не е намерена", code: "not_found" }, 404);
      return json(jobResponse(readOnlyJobView(job as JobRow, Date.now(), JOB_MAX_RUNTIME_MS)));
    }

    // ---------- start ----------
    const payload = body.payload as Record<string, unknown>;

    // Преграда за ограничени идентификатори: ПРЕДИ всяко четене/запис.
    {
      const blocked = restrictedIdentifierBlock(payload, {
        ...corsHeaders,
        ...correlationHeaders(correlationId),
      });
      if (blocked) return blocked;
    }

    if (!userId) {
      // Нова анонимна обработка: затворена в предварителния режим; дори при
      // отворен флаг няма проверим собственик за последващ статус → вход.
      if (!isNewProcessingOpen("generate_contract")) {
        return newProcessingClosedResponse("generate_contract", { ...corsHeaders, ...correlationHeaders(correlationId) }, { charge_state: "not_charged" });
      }
      return json({ error: "Влезте в профила си, за да изготвите документа.", code: "unauthorized", requires_login: true }, 401);
    }

    const idemKey = await generationJobServerKey(userId, payload, body.idempotency_key as string);

    const lookupOwn = async () => await admin
      .from("generation_jobs")
      .select(JOB_COLS)
      .eq("idempotency_key", idemKey)
      .eq("user_id", userId)
      .in("status", [STORED_STATUS.running, STORED_STATUS.completed])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Точно възпроизвеждане на собствен running/done job (без времеви прозорец:
    // уникалният индекс покрива running/done независимо от възрастта).
    const { data: existing, error: exErr } = await lookupOwn();
    if (exErr) return json({ error: "Неуспешна проверка на заявката", code: "internal_error" }, 500);
    let staleId: string | null = null;
    if (existing) {
      const view = readOnlyJobView(existing as JobRow, Date.now(), JOB_MAX_RUNTIME_MS);
      const st = normalizeJobStatus(view.status);
      if (st === "running" || st === "completed") {
        return json({ ...jobResponse(view), reused: true }, st === "running" ? 202 : 200);
      }
      staleId = (existing as JobRow).id;
    }

    // Gate 8: нова обработка — само server-side флаг; тялото не може да я отвори.
    if (!isNewProcessingOpen("generate_contract")) {
      return newProcessingClosedResponse("generate_contract", { ...corsHeaders, ...correlationHeaders(correlationId) }, { charge_state: "not_charged" });
    }

    if (staleId) {
      // Собствен „висящ" job освобождава ключа (само собственик, само running).
      await admin.from("generation_jobs").update({
        status: STORED_STATUS.error,
        error: "Генерирането надхвърли максималното време.",
        error_code: "job_timeout",
        updated_at: new Date().toISOString(),
      }).eq("id", staleId).eq("user_id", userId).eq("status", STORED_STATUS.running);
    }

    const { data: job, error: insErr } = await admin
      .from("generation_jobs")
      .insert({
        user_id: userId,
        status: STORED_STATUS.running,
        correlation_id: correlationId,
        idempotency_key: idemKey,
      })
      .select("id")
      .single();
    if (insErr || !job) {
      // Състезание: уникалният индекс отхвърля втория старт → връщаме СОБСТВЕНИЯ
      // победител (ключът вече съдържа собственика; търсенето също е по user_id).
      if (insErr && /duplicate|unique|23505/i.test(`${insErr.code ?? ""} ${insErr.message ?? ""}`)) {
        const { data: winner } = await lookupOwn();
        if (winner) {
          const view = readOnlyJobView(winner as JobRow, Date.now(), JOB_MAX_RUNTIME_MS);
          return json({ ...jobResponse(view), reused: true }, normalizeJobStatus(view.status) === "completed" ? 200 : 202);
        }
        return json({ error: "Заявката вече се обработва", code: "idempotency_conflict" }, 409);
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
