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
 */
import { invokeEdgeFunction, type InvokeResult } from "@/lib/invokeEdgeFunction";

interface JobStatus {
  job_id?: string;
  status?: "running" | "done" | "error" | "rejected";
  result?: unknown;
  error?: string | null;
  code?: string | null;
  http_status?: number | null;
}

const POLL_INTERVAL_MS = 2500;
const MAX_WAIT_MS = 5 * 60 * 1000;
/** Толерираме кратки мрежови прекъсвания по време на полването. */
const MAX_CONSECUTIVE_POLL_ERRORS = 8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function generateContractJob<T>(
  payload: Record<string, unknown>,
  options: {
    onRetry?: (attempt: number, max: number) => void;
    /** Извиква се докато чакаме — за прогрес индикатор в UI. */
    onWaiting?: (elapsedMs: number) => void;
    /** true → прекъсваме полването (потребителят е отказал/стартирал нов опит). */
    isStale?: () => boolean;
  } = {},
): Promise<InvokeResult<T>> {
  const start = await invokeEdgeFunction<{ job_id?: string; error?: string }>("generate-job", {
    retries: 3,
    onRetry: options.onRetry,
    body: { action: "start", payload },
  });

  const jobId = start.data?.job_id;
  if (!jobId) {
    return {
      data: (start.data as unknown as T) ?? null,
      error: start.error ?? { message: start.data?.error || "Неуспешно стартиране на генерирането" },
      correlationId: start.correlationId,
    };
  }

  const began = Date.now();
  let pollErrors = 0;

  while (Date.now() - began < MAX_WAIT_MS) {
    if (options.isStale?.()) {
      return { data: null, error: null, correlationId: start.correlationId };
    }
    await sleep(POLL_INTERVAL_MS);
    options.onWaiting?.(Date.now() - began);

    const poll = await invokeEdgeFunction<JobStatus>("generate-job", {
      retries: 1,
      body: { action: "status", job_id: jobId },
    });

    if (!poll.data) {
      if (++pollErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        return {
          data: null,
          error: poll.error ?? { message: "Няма връзка със сървъра." },
          correlationId: start.correlationId,
        };
      }
      continue;
    }
    pollErrors = 0;

    const s = poll.data.status;
    if (s === "done") {
      return { data: (poll.data.result as T) ?? null, error: null, correlationId: start.correlationId };
    }
    if (s === "error" || s === "rejected") {
      // Отговорите с тяло (нужно потвърждение, квота, чувствителни данни) се
      // връщат непокътнати, за да ги обработи същата логика както преди.
      const httpStatus = poll.data.http_status ?? undefined;
      return {
        data: (poll.data.result as T) ?? null,
        error: {
          message: poll.data.error || "Неуспешно създаване",
          ...(httpStatus ? { status: httpStatus } : {}),
          correlationId: start.correlationId,
        },
        correlationId: start.correlationId,
      };
    }
  }

  return {
    data: null,
    error: { message: "Генерирането отне твърде дълго. Опитайте отново.", correlationId: start.correlationId },
    correlationId: start.correlationId,
  };
}
