import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ---------- generationErrors: класификация на провалите ---------- */
import { classifyGenerationError, errorClassOf, isRetryableCode } from "@/lib/generationErrors";

describe("classifyGenerationError — сървърният код има приоритет", () => {
  it("quota / auth / rate limit → прегради и статуси", () => {
    const quota = classifyGenerationError({ data: { error: "Изчерпан лимит", code: "quota_exceeded" }, error: { message: "x", status: 402 } });
    expect(quota.code).toBe("quota_exceeded");
    expect(quota.gate).toBe(true);
    expect(quota.retryable).toBe(false);
    expect(quota.httpStatus).toBe(402);

    const auth = classifyGenerationError({ data: { error: "Влезте", requires_login: true } });
    expect(auth.code).toBe("requires_login");
    expect(auth.gate).toBe(true);

    const authByCode = classifyGenerationError({ data: { error: "x", code: "auth_required" }, error: { message: "y", status: 401 } });
    expect(authByCode.code).toBe("requires_login");

    const rl = classifyGenerationError({ error: { message: "Edge Function returned a non-2xx status code", status: 429 } });
    expect(rl.code).toBe("rate_limited");
    expect(rl.retryable).toBe(true);
  });

  it("needs_confirmation и чувствителни данни са прегради, не провали", () => {
    expect(classifyGenerationError({ data: { error: "needs_confirmation" } }).gate).toBe(true);
    const sb = classifyGenerationError({ data: { error: "x", code: "special_category_blocked" } });
    expect(sb.code).toBe("sensitive_blocked");
    expect(sb.gate).toBe(true);
  });

  it("AI парсване / upstream / timeout се разпознават и са retryable без такса", () => {
    const parse = classifyGenerationError({ data: { error: "AI отговорът не можа да бъде анализиран като JSON", code: "ai_parse_failed" } });
    expect(parse.code).toBe("ai_parse_failed");
    expect(parse.retryable).toBe(true);
    expect(errorClassOf(parse.code)).toBe("ai");

    const upstream = classifyGenerationError({ error: { message: "AI gateway 502 bad gateway", status: 502 } });
    expect(["server_error", "ai_upstream"]).toContain(upstream.code);
    expect(upstream.retryable).toBe(true);

    const timeout = classifyGenerationError({ error: { message: "timeout", code: "job_timeout" } });
    expect(timeout.code).toBe("timeout");
    expect(errorClassOf(timeout.code)).toBe("network");
  });

  it("мрежови сривове от различни браузъри → network", () => {
    for (const msg of ["Failed to send a request to the Edge Function", "TypeError: Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."]) {
      const e = classifyGenerationError({ thrownMessage: msg });
      expect(e.code, msg).toBe("network");
      expect(e.retryable).toBe(true);
    }
  });

  it("неизвестни съобщения не изтичат PII в code; raw се реже до 200", () => {
    const e = classifyGenerationError({ thrownMessage: `Грешка при ivan@example.com ${"x".repeat(500)}` });
    expect(e.code).toBe("unknown");
    expect(e.raw?.length).toBeLessThanOrEqual(200);
    expect(isRetryableCode("unknown")).toBe(true);
    expect(errorClassOf("unknown")).toBe("app");
  });
});

/* ---------- generateContractJob: идемпотентност и повторно закачане ---------- */
const invoke = vi.fn();
vi.mock("@/lib/invokeEdgeFunction", () => ({
  invokeEdgeFunction: (...args: unknown[]) => invoke(...args),
}));
vi.mock("@/lib/opSession", () => ({ getOpSessionId: () => "abcdef12-0000-4000-8000-000000000000" }));

import {
  computeIdempotencyKey,
  stableStringify,
  rememberJob,
  recallJob,
  forgetJob,
  generateContractJob,
  POLL_INTERVAL_MS,
} from "@/lib/generateContractJob";

type Body = { action: "start" | "status"; job_id?: string; idempotency_key?: string; payload?: unknown };
const bodyOf = (call: unknown[]): Body => (call[1] as { body: Body }).body;

beforeEach(() => {
  invoke.mockReset();
  sessionStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("computeIdempotencyKey", () => {
  it("е стабилен спрямо реда на ключовете и undefined, различен при промяна на отговор", async () => {
    const a = await computeIdempotencyKey({ slug: "trudov", answers: { b: 2, a: 1 }, skip: undefined });
    const b = await computeIdempotencyKey({ answers: { a: 1, b: 2 }, slug: "trudov" });
    const c = await computeIdempotencyKey({ slug: "trudov", answers: { a: 1, b: 3 } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith("abcdef12-")).toBe(true);
    expect(stableStringify({ z: [1, { y: null }], a: "x" })).toBe('{"a":"x","z":[1,{"y":null}]}');
  });
});

describe("reattach store", () => {
  it("помни job за 10 минути и забравя при поискване", () => {
    const t0 = 1_700_000_000_000;
    rememberJob("k1", "job-1", t0);
    expect(recallJob("k1", t0 + 60_000)).toBe("job-1");
    expect(recallJob("k1", t0 + 11 * 60_000)).toBeNull();
    rememberJob("k2", "job-2", t0);
    forgetJob("k2");
    expect(recallJob("k2", t0)).toBeNull();
  });
});

describe("generateContractJob", () => {
  it("изпраща idempotency_key при старт и връща резултата след completed", async () => {
    invoke
      .mockResolvedValueOnce({ data: { job_id: "job-1" }, error: null, correlationId: "cid-1" })
      .mockResolvedValueOnce({ data: { status: "running" }, error: null, correlationId: "cid-2" })
      .mockResolvedValueOnce({ data: { status: "completed", result: { ok: true } }, error: null, correlationId: "cid-3" });

    const p = generateContractJob<{ ok: boolean }>({ slug: "x", answers: { a: 1 } });
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2 + 10);
    const res = await p;

    expect(res.data).toEqual({ ok: true });
    expect(res.error).toBeNull();
    expect(res.jobId).toBe("job-1");
    expect(res.reattached).toBe(false);
    expect(res.startAttempts).toBe(1);
    const start = bodyOf(invoke.mock.calls[0]);
    expect(start.action).toBe("start");
    expect(start.idempotency_key).toMatch(/^abcdef12-[0-9a-f]+$/);
    // Успех → ключът е освободен (нов опит със същите данни е нов job).
    expect(recallJob(start.idempotency_key!)).toBeNull();
  });

  it("се закача към вече завършен job без нов старт (reattach)", async () => {
    const payload = { slug: "x", answers: { a: 1 } };
    const key = await computeIdempotencyKey(payload);
    rememberJob(key, "job-old");
    invoke.mockResolvedValueOnce({ data: { status: "done", result: { ok: 1 } }, error: null, correlationId: "cid" });
    const onReattach = vi.fn();

    const res = await generateContractJob(payload, { onReattach });

    expect(res.reattached).toBe(true);
    expect(res.data).toEqual({ ok: 1 });
    expect(onReattach).toHaveBeenCalledWith("job-old");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(bodyOf(invoke.mock.calls[0])).toMatchObject({ action: "status", job_id: "job-old" });
  });

  it("забравя невалиден стар job и стартира нов", async () => {
    const payload = { slug: "y", answers: {} };
    const key = await computeIdempotencyKey(payload);
    rememberJob(key, "job-gone");
    invoke
      .mockResolvedValueOnce({ data: { status: "error", error: "изтекъл" }, error: null, correlationId: "c0" })
      .mockResolvedValueOnce({ data: { job_id: "job-new" }, error: null, correlationId: "c1" })
      .mockResolvedValueOnce({ data: { status: "done", result: { v: 2 } }, error: null, correlationId: "c2" });

    const p = generateContractJob(payload);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 10);
    const res = await p;

    expect(res.reattached).toBe(false);
    expect(res.jobId).toBe("job-new");
    expect(res.data).toEqual({ v: 2 });
    expect(bodyOf(invoke.mock.calls[1]).action).toBe("start");
  });

  it("грешка на job-а → типизирана грешка, тялото се запазва и ключът се освобождава", async () => {
    invoke
      .mockResolvedValueOnce({ data: { job_id: "job-e" }, error: null, correlationId: "cid" })
      .mockResolvedValueOnce({
        data: { status: "error", error: "Изчерпан лимит", code: "quota_exceeded", http_status: 402, result: { error: "Изчерпан лимит", code: "quota_exceeded", quota: { used: 2 } } },
        error: null,
        correlationId: "cid2",
      });

    const p = generateContractJob<{ error?: string; quota?: unknown }>({ slug: "z" });
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 10);
    const res = await p;

    expect(res.generationError?.code).toBe("quota_exceeded");
    expect(res.generationError?.gate).toBe(true);
    expect(res.error?.status).toBe(402);
    expect(res.data).toMatchObject({ code: "quota_exceeded" });
    expect(recallJob(bodyOf(invoke.mock.calls[0]).idempotency_key!)).toBeNull();
  });

  it("провален старт без job_id връща класифицирана грешка", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: "Failed to send a request to the Edge Function" }, correlationId: "cid" });
    const res = await generateContractJob({ slug: "n" });
    expect(res.jobId).toBeUndefined();
    expect(res.generationError?.code).toBe("network");
    expect(res.generationError?.retryable).toBe(true);
  });

  it("isStale прекъсва полването без грешка", async () => {
    invoke
      .mockResolvedValueOnce({ data: { job_id: "job-s" }, error: null, correlationId: "cid" })
      .mockResolvedValue({ data: { status: "running" }, error: null, correlationId: "cid" });
    let stale = false;
    const p = generateContractJob({ slug: "s" }, { isStale: () => stale });
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 10);
    stale = true;
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 10);
    const res = await p;
    expect(res.data).toBeNull();
    expect(res.error).toBeNull();
    expect(res.jobId).toBe("job-s");
  });
});
