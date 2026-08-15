/**
 * qa-bot-runner — три QA бота, които всеки ден изпълняват по 3–4 „умни"
 * операции срещу критичните функции на сайта и записват резултата.
 *
 * Принципи:
 *  - SAFE MODE: ботовете използват само синтетични данни (без реални клиентски
 *    записи), никога не пишат в продуктови таблици и всичко записано в лога
 *    минава през `sanitize()` (маскиране на имейли/телефони/ЕГН/ЕИК/IBAN).
 *  - RATE LIMITING: твърд дневен лимит операции на бот (`max_ops_per_day`) +
 *    споделен token-bucket, за да не се дублират стартирания.
 *  - CIRCUIT BREAKER: при 3 последователни неуспешни изпълнения ботът се
 *    поставя в пауза за 12 часа. Повтарящи се 4xx/5xx в рамките на едно
 *    изпълнение го прекъсват веднага.
 *
 * Достъп: service_role (pg_cron) или служител (ръчно стартиране от /admin/bots).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCors } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { getCorrelationId, correlationHeaders } from "../_shared/correlation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/* ------------------------------------------------------------------ */
/* Safe mode: маскиране + ограничаване на всичко, което влиза в лога  */
/* ------------------------------------------------------------------ */

const MASKS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]"],
  [/\b\d{10}\b/g, "[egn]"],
  [/\b\d{9}\b/g, "[eik]"],
  [/\b(?:\+359|0)\s?\d[\d\s-]{7,}\b/g, "[phone]"],
  [/\b[A-Z]{2}\d{2}[A-Z0-9]{10,}\b/g, "[iban]"],
  [/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, "[jwt]"],
];

export function sanitize(value: unknown, maxLen = 600): string {
  let text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  if (!text) return "";
  for (const [re, rep] of MASKS) text = text.replace(re, rep);
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function sanitizeDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    out[k] = typeof v === "number" || typeof v === "boolean" || v === null ? v : sanitize(v, 300);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Синтетични данни — единственият вход, разрешен в safe mode          */
/* ------------------------------------------------------------------ */

const SYNTHETIC = {
  searchTerms: ["наем на офис", "договор за услуга", "NDA", "трудов договор", "заем"],
  question: "Какъв срок за предизвестие е обичаен при договор за услуга?",
  bogusToken: "qa-bot-nonexistent-token-000",
  companyName: "QA Тест ООД (синтетичен)",
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ------------------------------------------------------------------ */
/* Стъпки                                                             */
/* ------------------------------------------------------------------ */

interface StepCtx {
  sb: ReturnType<typeof admin>;
  cid: string;
  safeMode: boolean;
}

interface StepResult {
  status: "pass" | "fail" | "skip";
  target?: string;
  httpStatus?: number;
  detail?: Record<string, unknown>;
  error?: string;
}

interface Step {
  action: string;
  /** Изисква AI кредити / бавно е — най-много веднъж на изпълнение. */
  costly?: boolean;
  run: (ctx: StepCtx) => Promise<StepResult>;
}

async function callFn(
  name: string,
  body: Record<string, unknown>,
  cid: string,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "x-correlation-id": cid,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: (await res.text()).slice(0, 4000) };
}

/** Търсене в каталога — трябва да връща резултати. */
const stepTemplateSearch: Step = {
  action: "template_search",
  run: async ({ sb }) => {
    const term = pick(SYNTHETIC.searchTerms);
    const { data, error, status } = await sb
      .from("template_search_index")
      .select("doc_key", { count: "exact", head: false })
      .ilike("title", `%${term.split(" ")[0]}%`)
      .limit(5);
    if (error) return { status: "fail", target: "template_search_index", httpStatus: status, error: error.message };
    const found = data?.length ?? 0;
    return {
      status: found > 0 ? "pass" : "fail",
      target: "template_search_index",
      httpStatus: status,
      detail: { term, found },
      error: found === 0 ? `Няма резултати за „${term}"` : undefined,
    };
  },
};

/** Каталогът не е празен и няма шаблони без ключ. */
const stepCatalogIntegrity: Step = {
  action: "catalog_integrity",
  run: async ({ sb }) => {
    const { count, error } = await sb
      .from("template_search_index")
      .select("id", { count: "exact", head: true });
    if (error) return { status: "fail", target: "template_search_index", error: error.message };
    const { count: broken } = await sb
      .from("template_search_index")
      .select("id", { count: "exact", head: true })
      .is("doc_key", null);
    return {
      status: (count ?? 0) > 100 && !broken ? "pass" : "fail",
      target: "template_search_index",
      detail: { total: count ?? 0, missing_doc_key: broken ?? 0 },
      error: (count ?? 0) <= 100 ? "Каталогът изглежда непълен" : broken ? "Има шаблони без doc_key" : undefined,
    };
  },
};

/** Плановете и цените са налични и в EUR. */
const stepPlansPricing: Step = {
  action: "plans_pricing",
  run: async ({ sb }) => {
    const { data, error } = await sb.from("plans").select("slug, name, price_eur, is_active");
    if (error) return { status: "fail", target: "plans", error: error.message };
    const rows = (data ?? []) as Array<{ slug: string; name: string; price_eur: number | null; is_active: boolean }>;
    const bad = rows.filter((r) => r.is_active && (r.price_eur === null || Number.isNaN(Number(r.price_eur))));
    return {
      status: rows.length > 0 && bad.length === 0 ? "pass" : "fail",
      target: "plans",
      detail: { plans: rows.length, invalid: bad.length, slugs: rows.map((r) => r.slug).join(",") },
      error: bad.length ? `Планове без валидна цена: ${bad.map((b) => b.slug).join(",")}` : undefined,
    };
  },
};

/** Публичните броячи работят (RPC smoke test). */
const stepPublicCounters: Step = {
  action: "public_counters",
  run: async ({ sb }) => {
    const { data, error } = await sb.rpc("get_registered_users_count");
    if (error) return { status: "fail", target: "rpc:get_registered_users_count", error: error.message };
    const n = Number(data ?? 0);
    return {
      status: Number.isFinite(n) ? "pass" : "fail",
      target: "rpc:get_registered_users_count",
      detail: { users: n },
    };
  },
};

/** AI асистентът за анонимни отговаря с валиден JSON/текст. */
const stepAssistantAnon: Step = {
  action: "assistant_anon",
  costly: true,
  run: async ({ cid }) => {
    const r = await callFn("assistant-chat-anon", { messages: [{ role: "user", content: SYNTHETIC.question }] }, cid);
    const ok = r.status >= 200 && r.status < 300 && r.text.length > 20;
    return {
      status: ok ? "pass" : "fail",
      target: "fn:assistant-chat-anon",
      httpStatus: r.status,
      detail: { bytes: r.text.length },
      error: ok ? undefined : `HTTP ${r.status}: ${sanitize(r.text, 300)}`,
    };
  },
};

/** Няма ръст на неуспешни AI JSON парсвания през последните 24 часа. */
const stepAiJsonHealth: Step = {
  action: "ai_json_health",
  run: async ({ sb }) => {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count, error } = await sb
      .from("ai_parse_failures")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    if (error) return { status: "fail", target: "ai_parse_failures", error: error.message };
    const n = count ?? 0;
    return {
      status: n <= 10 ? "pass" : "fail",
      target: "ai_parse_failures",
      detail: { last_24h: n, threshold: 10 },
      error: n > 10 ? `${n} неуспешни AI парсвания за 24ч` : undefined,
    };
  },
};

/** Фунията получава събития — иначе аналитиката е сляпа. */
const stepFunnelHealth: Step = {
  action: "funnel_health",
  run: async ({ sb }) => {
    const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { count, error } = await sb
      .from("funnel_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    if (error) return { status: "fail", target: "funnel_events", error: error.message };
    const n = count ?? 0;
    return {
      status: n > 0 ? "pass" : "fail",
      target: "funnel_events",
      detail: { last_48h: n },
      error: n === 0 ? "Няма funnel събития за 48ч — възможен срив в аналитиката" : undefined,
    };
  },
};

/** Негативен тест: невалиден share token не трябва да връща документ. */
const stepSharedLinkGuard: Step = {
  action: "shared_link_guard",
  run: async ({ cid }) => {
    const r = await callFn("get-shared-document", { token: SYNTHETIC.bogusToken }, cid);
    const ok = r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404;
    return {
      status: ok ? "pass" : "fail",
      target: "fn:get-shared-document",
      httpStatus: r.status,
      detail: { expected: "4xx" },
      error: ok ? undefined : `Очакван 4xx, получен ${r.status}`,
    };
  },
};

/** Негативен тест: анонимен клиент не вижда защитени таблици (RLS). */
const stepRlsGuard: Step = {
  action: "rls_guard",
  run: async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const targets = ["saved_documents", "contacts", "qa_bot_actions"] as const;
    const leaks: string[] = [];
    for (const t of targets) {
      const { data, error } = await anon.from(t).select("id").limit(1);
      if (!error && (data?.length ?? 0) > 0) leaks.push(t);
    }
    return {
      status: leaks.length === 0 ? "pass" : "fail",
      target: "rls:" + targets.join(","),
      detail: { checked: targets.length, leaks: leaks.join(",") || "няма" },
      error: leaks.length ? `RLS изтичане: ${leaks.join(",")}` : undefined,
    };
  },
};

/** Негативен тест: защитена функция отказва без валиден потребител. */
const stepAuthGuard: Step = {
  action: "auth_guard",
  run: async ({ cid }) => {
    const r = await callFn("team-members", {}, cid);
    const ok = r.status === 401 || r.status === 403;
    return {
      status: ok ? "pass" : "fail",
      target: "fn:team-members",
      httpStatus: r.status,
      detail: { expected: "401/403" },
      error: ok ? undefined : `Очакван 401/403, получен ${r.status}`,
    };
  },
};

/** Rate limit механизмът реагира при burst (проверка на самата защита). */
const stepRateLimitGuard: Step = {
  action: "rate_limit_guard",
  run: async () => {
    const key = `qa-bot-probe:${new Date().toISOString().slice(0, 13)}`;
    let blocked = false;
    for (let i = 0; i < 4; i++) {
      const rl = await checkRateLimit(key, 2, 60);
      if (!rl.ok) blocked = true;
    }
    return {
      status: blocked ? "pass" : "fail",
      target: "rate_limit_check",
      detail: { probes: 4, limit: 2 },
      error: blocked ? undefined : "Rate limit не се задейства при burst",
    };
  },
};

/** Генераторът връща валиден договор от синтетични данни. */
const stepGenerateContract: Step = {
  action: "generate_contract",
  costly: true,
  run: async ({ cid }) => {
    const r = await callFn(
      "generate-contract",
      {
        docKey: "dogovor-za-usluga",
        answers: {
          party_a_name: SYNTHETIC.companyName,
          party_b_name: "QA Изпълнител ЕООД (синтетичен)",
          subject: "Тестова услуга за автоматична проверка",
          price: "1000",
        },
        userConfirmed: true,
        qaBot: true,
      },
      cid,
    );
    let hasContract = false;
    try {
      const j = JSON.parse(r.text);
      hasContract = Boolean(j?.contract?.title || j?.contract?.clauses);
    } catch { /* невалиден JSON = провал */ }
    const ok = r.status >= 200 && r.status < 300 && hasContract;
    return {
      status: ok ? "pass" : "fail",
      target: "fn:generate-contract",
      httpStatus: r.status,
      detail: { bytes: r.text.length, parsed: hasContract },
      error: ok ? undefined : `HTTP ${r.status}, parsed=${hasContract}: ${sanitize(r.text, 300)}`,
    };
  },
};

/** Регистър на стъпките по бот. Всеки ден се изпълнява подмножество. */
const BOT_STEPS: Record<string, Step[]> = {
  "catalog-scout": [stepTemplateSearch, stepCatalogIntegrity, stepPlansPricing, stepPublicCounters],
  "doc-smith": [stepAiJsonHealth, stepAssistantAnon, stepGenerateContract, stepFunnelHealth],
  "guard-warden": [stepSharedLinkGuard, stepRlsGuard, stepAuthGuard, stepRateLimitGuard],
};

/* ------------------------------------------------------------------ */
/* Изпълнение                                                         */
/* ------------------------------------------------------------------ */

interface BotRow {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  safe_mode: boolean;
  max_ops_per_day: number;
  consecutive_failures: number;
  paused_until: string | null;
}

const MAX_CONSECUTIVE_FAILURES = 3;
const PAUSE_HOURS = 12;
/** Повтарящи се грешки в едно изпълнение го прекъсват. */
const MAX_FAILURES_PER_RUN = 2;

async function opsToday(sb: ReturnType<typeof admin>, botId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await sb
    .from("qa_bot_actions")
    .select("id", { count: "exact", head: true })
    .eq("bot_id", botId)
    .gte("created_at", since);
  return count ?? 0;
}

async function runBot(
  sb: ReturnType<typeof admin>,
  bot: BotRow,
  trigger: string,
  cid: string,
): Promise<{ slug: string; status: string; ops: number; failures: number; note?: string }> {
  // --- Safe mode / circuit breaker проверки преди старт ---
  if (!bot.enabled) return { slug: bot.slug, status: "skipped", ops: 0, failures: 0, note: "изключен" };
  if (bot.paused_until && new Date(bot.paused_until) > new Date()) {
    return { slug: bot.slug, status: "skipped", ops: 0, failures: 0, note: "в пауза (circuit breaker)" };
  }

  const used = await opsToday(sb, bot.id);
  const budget = Math.max(0, bot.max_ops_per_day - used);
  if (budget === 0) {
    return { slug: bot.slug, status: "skipped", ops: 0, failures: 0, note: "дневният лимит е изчерпан" };
  }

  // Споделен token-bucket: пази от паралелни/дублирани стартирания.
  const rl = await checkRateLimit(`qa-bot:${bot.slug}`, bot.max_ops_per_day, 24 * 3600);
  if (!rl.ok) {
    return { slug: bot.slug, status: "skipped", ops: 0, failures: 0, note: "rate limit" };
  }

  const all = BOT_STEPS[bot.slug] ?? [];
  // Умен избор: винаги ротираме началната стъпка, най-много една „скъпа".
  const offset = new Date().getUTCHours() % Math.max(1, all.length);
  const rotated = [...all.slice(offset), ...all.slice(0, offset)];
  const planned: Step[] = [];
  let costlyUsed = false;
  for (const s of rotated) {
    if (planned.length >= Math.min(budget, 4)) break;
    if (s.costly) {
      if (costlyUsed) continue;
      costlyUsed = true;
    }
    planned.push(s);
  }

  const { data: runIns, error: runErr } = await sb
    .from("qa_bot_runs")
    .insert({
      bot_id: bot.id,
      status: "running",
      ops_planned: planned.length,
      trigger,
      correlation_id: cid,
    })
    .select("id")
    .single();
  if (runErr || !runIns) {
    return { slug: bot.slug, status: "error", ops: 0, failures: 0, note: sanitize(runErr?.message, 200) };
  }
  const runId = (runIns as { id: string }).id;

  let failures = 0;
  let done = 0;
  let aborted: string | null = null;

  for (let i = 0; i < planned.length; i++) {
    const step = planned[i];
    const t0 = Date.now();
    let res: StepResult;
    let stack: string | null = null;
    try {
      res = await step.run({ sb, cid, safeMode: bot.safe_mode });
    } catch (e) {
      const err = e as Error;
      stack = sanitize(err.stack ?? "", 2000);
      res = { status: "fail", error: err.message, detail: { thrown: true } };
    }
    done++;
    if (res.status === "fail") failures++;

    await sb.from("qa_bot_actions").insert({
      run_id: runId,
      bot_id: bot.id,
      seq: i + 1,
      action: step.action,
      target: res.target ? sanitize(res.target, 120) : null,
      status: res.status,
      http_status: res.httpStatus ?? null,
      duration_ms: Date.now() - t0,
      detail: sanitizeDetail({ safe_mode: bot.safe_mode, ...(res.detail ?? {}) }),
      error_message: res.error ? sanitize(res.error, 600) : null,
      error_stack: stack,
    });

    // Спираме при повтарящи се грешки (включително 4xx/5xx).
    if (failures >= MAX_FAILURES_PER_RUN) {
      aborted = `прекъснат след ${failures} грешки`;
      break;
    }
  }

  const status = failures === 0 ? "passed" : "failed";
  await sb
    .from("qa_bot_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      ops_done: done,
      failures,
      notes: aborted,
    })
    .eq("id", runId);

  // Circuit breaker: 3 последователни провала → пауза.
  const nextConsecutive = failures === 0 ? 0 : bot.consecutive_failures + 1;
  const pause = nextConsecutive >= MAX_CONSECUTIVE_FAILURES;
  await sb
    .from("qa_bots")
    .update({
      consecutive_failures: nextConsecutive,
      last_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      paused_until: pause ? new Date(Date.now() + PAUSE_HOURS * 3600 * 1000).toISOString() : null,
      paused_reason: pause ? `${nextConsecutive} последователни провала — автоматична пауза ${PAUSE_HOURS}ч` : null,
    })
    .eq("id", bot.id);

  return { slug: bot.slug, status, ops: done, failures, note: aborted ?? undefined };
}

Deno.serve(async (req) => {
  const cors = buildCors(req, "POST, OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const cid = getCorrelationId(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, ...correlationHeaders(cid), "Content-Type": "application/json" },
    });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const sb = admin();
    let trigger = "cron";
    let onlySlug: string | null = null;
    try {
      const body = await req.json();
      if (body?.trigger) trigger = String(body.trigger).slice(0, 20);
      if (body?.slug) onlySlug = String(body.slug).slice(0, 60);
    } catch { /* празно тяло от cron */ }

    // Достъп: service_role (cron) или служител (ръчно от админ панела).
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: claims } = await anonClient.auth.getClaims(token);
    const role = (claims?.claims as { role?: string } | undefined)?.role;
    if (role !== "service_role") {
      const { data: userData } = await createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }).auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "unauthorized" }, 401);
      const { data: isStaff } = await sb.rpc("is_staff", { _user_id: uid });
      if (!isStaff) return json({ error: "forbidden" }, 403);
      trigger = "manual";
    }

    let q = sb
      .from("qa_bots")
      .select("id, slug, name, enabled, safe_mode, max_ops_per_day, consecutive_failures, paused_until");
    if (onlySlug) q = q.eq("slug", onlySlug);
    const { data: bots, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const results = [];
    for (const bot of (bots ?? []) as BotRow[]) {
      results.push(await runBot(sb, bot, trigger, cid));
    }
    return json({ ok: true, correlation_id: cid, trigger, results });
  } catch (e) {
    return json({ error: sanitize((e as Error).message, 300), correlation_id: cid }, 500);
  }
});
