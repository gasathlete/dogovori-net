/**
 * Асинхронно генериране на документ през `generate-job`.
 *
 * Защо: директното извикване на `generate-contract` държи една HTTP връзка
 * отворена 60–150 s. При мобилна мрежа/заспиване на таба това връща
 * „Failed to send a request to the Edge Function" и цялата работа се губи —
 * това беше основната причина за високия дял провалени генерирания.
 *
 * Тук стартът е милисекунди, а резултатът се тегли чрез полване. Прекъсване
 * по време на полването е безвредно — работата продължава на сървъра.
 *
 * Идемпотентност („Опитай отново" без двойно създаване/таксуване):
 *  - За всеки payload се изчислява стабилен ключ (hash на данните + op сесия).
 *  - job_id се помни локално за ключа; при повторен опит първо проверяваме
 *    дали предишният job още върви/е готов и се закачаме към него, вместо да
 *    стартираме нов.
 *  - Същият ключ се праща и на сървъра (`idempotency_key`), който връща
 *    съществуващия job, ако има такъв — втора защита при два таба/устройства.
 */
import { invokeEdgeFunction, type InvokeResult } from "@/lib/invokeEdgeFunction";
import { getOpSessionId } from "@/lib/opSession";
import { classifyGenerationError, type GenerationError } from "@/lib/generationErrors";
import { canStartNewProcessing } from "@/lib/prelaunch";
import { offerMarketingBonus } from "@/lib/marketingBonus";

export type JobStatusValue = "running" | "done" | "completed" | "error" | "rejected";

interface JobStatus {
  job_id?: string;
  status?: JobStatusValue | string;
  result?: unknown;
  error?: string | null;
  code?: string | null;
  http_status?: number | null;
}

export interface GenerationJobResult<T> extends InvokeResult<T> {
  /** Типизирана грешка, когато има такава. */
  generationError?: GenerationError;
  /** ID на job-а на сървъра (за диагностика / повторно закачане). */
  jobId?: string;
  /** true, ако сме продължили предишен job вместо да стартираме нов. */
  reattached?: boolean;
  /** Брой мрежови опити за стартиране (1 = без повторение). */
  startAttempts?: number;
}

export interface GenerateJobOptions {
  /** Internal: quota recovery is limited to one restart with the same key. */
  bonusRecoveryAttempted?: boolean;
  onRetry?: (attempt: number, max: number) => void;
  /** Извиква се докато чакаме — за прогрес индикатор в UI. */
  onWaiting?: (elapsedMs: number) => void;
  /** true → прекъсваме полването (потребителят е отказал/стартирал нов опит). */
  isStale?: () => boolean;
  /** Извиква се, когато продължаваме предишен job вместо нов старт. */
  onReattach?: (jobId: string) => void;
  /** Явен ключ за идемпотентност; по подразбиране се извежда от payload-а. */
  idempotencyKey?: string;
  /**
   * Разрешение за НОВ старт (не за статус/повторно закачане). По подразбиране
   * е предварителната преграда; абонамент НЕ я заобикаля. Сървърът проверява
   * отделно собствения си флаг.
   */
  canStartNew?: () => boolean;
}

export const GENERATION_PRELAUNCH_CODE = "generation_prelaunch_closed";

export const POLL_INTERVAL_MS = 2500;
export const MAX_WAIT_MS = 5 * 60 * 1000;
/** Толерираме кратки мрежови прекъсвания по време на полването. */
export const MAX_CONSECUTIVE_POLL_ERRORS = 8;
/** Колко дълго помним job_id за повторно закачане. */
const REATTACH_TTL_MS = 10 * 60 * 1000;
const REATTACH_KEY = "gen_job_reattach_v1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Стабилно сериализиране: подредени ключове, без undefined. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

/** FNV-1a 32-bit — бърз, детерминистичен fallback без Web Crypto. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

async function digest(s: string): Promise<string> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 40);
    }
  } catch {
    /* fall through */
  }
  return `${fnv1a(s)}${fnv1a(s.split("").reverse().join(""))}`;
}

/**
 * Ключ за идемпотентност: hash на payload-а + op сесия на таба. Същите
 * отговори в същия таб → същият ключ; редакция на отговор → нов ключ.
 */
export async function computeIdempotencyKey(payload: Record<string, unknown>): Promise<string> {
  const h = await digest(stableStringify(payload));
  return `${getOpSessionId().slice(0, 8)}-${h}`;
}

type ReattachStore = Record<string, { job_id: string; ts: number }>;

function readReattach(): ReattachStore {
  try {
    const raw = sessionStorage.getItem(REATTACH_KEY);
    const parsed = raw ? (JSON.parse(raw) as ReattachStore) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeReattach(store: ReattachStore) {
  try {
    sessionStorage.setItem(REATTACH_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function rememberJob(key: string, jobId: string, now = Date.now()) {
  const store = readReattach();
  for (const [k, v] of Object.entries(store)) if (now - v.ts > REATTACH_TTL_MS) delete store[k];
  store[key] = { job_id: jobId, ts: now };
  writeReattach(store);
}

export function recallJob(key: string, now = Date.now()): string | null {
  const v = readReattach()[key];
  if (!v || now - v.ts > REATTACH_TTL_MS) return null;
  return v.job_id;
}

export function forgetJob(key: string) {
  const store = readReattach();
  if (key in store) {
    delete store[key];
    writeReattach(store);
  }
}

const isTerminalOk = (s: string | undefined) => s === "done" || s === "completed";
const isTerminalErr = (s: string | undefined) => s === "error" || s === "rejected";

export async function generateContractJob<T>(
  payload: Record<string, unknown>,
  options: GenerateJobOptions = {},
): Promise<GenerationJobResult<T>> {
  const key = options.idempotencyKey ?? (await computeIdempotencyKey(payload));

  // 1) Повторно закачане към предишен job за същите данни (без нов старт).
  let jobId: string | null = null;
  let reattached = false;
  let correlationId = "";
  const previous = recallJob(key);
  if (previous) {
    const probe = await invokeEdgeFunction<JobStatus>("generate-job", {
      retries: 1,
      body: { action: "status", job_id: previous },
    });
    const st = probe.data?.status;
    if (probe.data && (st === "running" || isTerminalOk(st))) {
      jobId = previous;
      reattached = true;
      correlationId = probe.correlationId;
      options.onReattach?.(previous);
      if (isTerminalOk(st)) {
        return {
          data: (probe.data.result as T) ?? null,
          error: null,
          correlationId,
          jobId,
          reattached,
          startAttempts: 0,
        };
      }
    } else {
      forgetJob(key);
    }
  }

  // 2) Нов старт (с мрежови повторения — стартът е идемпотентен чрез ключа).
  let startAttempts = 0;
  if (!jobId) {
    const allowed = (options.canStartNew ?? (() => canStartNewProcessing("document_generation")))();
    if (!allowed) {
      // Нищо не се изпраща: данните не напускат браузъра.
      const message = "Изготвянето на нов документ още не е отворено. Нищо не е изпратено и нищо не е таксувано.";
      const data = { error: message, code: GENERATION_PRELAUNCH_CODE, charge_state: "not_charged" };
      return {
        data: data as unknown as T,
        error: { message },
        correlationId,
        generationError: classifyGenerationError({ error: { message, status: 503, code: GENERATION_PRELAUNCH_CODE }, data }),
        startAttempts: 0,
      };
    }
    const start = await invokeEdgeFunction<{ job_id?: string; error?: string; code?: string; status?: string }>("generate-job", {
      retries: 3,
      onRetry: (attempt, max) => {
        startAttempts = attempt;
        options.onRetry?.(attempt, max);
      },
      body: { action: "start", payload, idempotency_key: key },
    });
    startAttempts += 1;
    correlationId = start.correlationId;

    if (!start.data?.job_id) {
      const generationError = classifyGenerationError({ error: start.error, data: start.data });
      return {
        data: (start.data as unknown as T) ?? null,
        error: start.error ?? { message: start.data?.error || "Неуспешно стартиране на генерирането" },
        correlationId,
        generationError,
        startAttempts,
      };
    }
    jobId = start.data.job_id;
    rememberJob(key, jobId);
  }

  // 3) Полване до краен статус.
  const began = Date.now();
  let pollErrors = 0;

  while (Date.now() - began < MAX_WAIT_MS) {
    if (options.isStale?.()) {
      return { data: null, error: null, correlationId, jobId, reattached, startAttempts };
    }
    await sleep(POLL_INTERVAL_MS);
    options.onWaiting?.(Date.now() - began);

    const poll = await invokeEdgeFunction<JobStatus>("generate-job", {
      retries: 1,
      body: { action: "status", job_id: jobId },
    });

    if (!poll.data) {
      if (++pollErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        // Job-ът най-вероятно още върви — оставяме ключа, за да се закачим отново.
        const generationError = classifyGenerationError({
          error: poll.error ?? { message: "Няма връзка със сървъра." },
        });
        return {
          data: null,
          error: poll.error ?? { message: "Няма връзка със сървъра." },
          correlationId,
          generationError,
          jobId,
          reattached,
          startAttempts,
        };
      }
      continue;
    }
    pollErrors = 0;

    const s = poll.data.status;
    if (isTerminalOk(s)) {
      forgetJob(key);
      return { data: (poll.data.result as T) ?? null, error: null, correlationId, jobId, reattached, startAttempts };
    }
    if (isTerminalErr(s)) {
      // Job-ът е приключил с грешка → нов опит трябва да е НОВ job.
      forgetJob(key);
      const httpStatus = poll.data.http_status ?? undefined;
      const message = poll.data.error || "Неуспешно създаване";
      const resultBody = (poll.data.result ?? null) as (T & { error?: string; code?: string }) | null;
      const generationError = classifyGenerationError({
        error: { message, status: httpStatus, correlationId, code: poll.data.code ?? undefined },
        data: resultBody ?? (poll.data.code ? { error: message, code: poll.data.code } : null),
        jobStatus: s,
      });
      if (generationError.code === "quota_exceeded" && !options.bonusRecoveryAttempted && await offerMarketingBonus()) {
        return generateContractJob<T>(payload, { ...options, idempotencyKey: key, bonusRecoveryAttempted: true });
      }
      // Отговорите с тяло (нужно потвърждение, квота, чувствителни данни) се
      // връщат непокътнати, за да ги обработи същата логика както преди.
      return {
        data: resultBody,
        error: {
          message,
          ...(httpStatus ? { status: httpStatus } : {}),
          correlationId,
        },
        correlationId,
        generationError,
        jobId,
        reattached,
        startAttempts,
      };
    }
  }

  // Изтекло време за изчакване — job-ът остава запомнен за повторно закачане.
  const generationError = classifyGenerationError({ error: { message: "timeout", code: "job_timeout", correlationId } });
  return {
    data: null,
    error: { message: "Генерирането отне твърде дълго. Опитайте отново.", correlationId },
    correlationId,
    generationError,
    jobId,
    reattached,
    startAttempts,
  };
}
