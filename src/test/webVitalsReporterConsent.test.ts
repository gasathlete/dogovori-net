/**
 * Гард: репортерът не изнася НИЩО навън без съгласие за аналитика,
 * а при съгласие праща само LCP/INP/CLS централно, с груби измерения.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const handlers: Record<string, (m: unknown) => void> = {};
const rpc = vi.fn().mockResolvedValue({ error: null });
const trackEvent = vi.fn();
let consent = false;

vi.mock("web-vitals", () => ({
  onLCP: (cb: (m: unknown) => void) => { handlers.LCP = cb; },
  onINP: (cb: (m: unknown) => void) => { handlers.INP = cb; },
  onCLS: (cb: (m: unknown) => void) => { handlers.CLS = cb; },
  onFCP: (cb: (m: unknown) => void) => { handlers.FCP = cb; },
  onTTFB: (cb: (m: unknown) => void) => { handlers.TTFB = cb; },
}));
vi.mock("@/lib/analytics", () => ({
  trackEvent: (...a: unknown[]) => trackEvent(...a),
  getCategoryConsent: () => consent,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

async function boot(path = "/shablon/faktura-obrazets") {
  vi.resetModules();
  window.history.replaceState({}, "", path);
  delete (window as unknown as Record<string, unknown>).__lovableVitalsBooted;
  const { initWebVitalsReporter } = await import("@/lib/webVitalsReporter");
  initWebVitalsReporter();
  // requestIdleCallback fallback → setTimeout
  await vi.advanceTimersByTimeAsync(3000);
}

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockClear();
  trackEvent.mockClear();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("webVitalsReporter — съгласие", () => {
  it("без съгласие: няма trackEvent и няма RPC, но има локален лог", async () => {
    consent = false;
    await boot();
    handlers.LCP?.({ name: "LCP", value: 1200, rating: "good" });
    await vi.advanceTimersByTimeAsync(0);
    expect(trackEvent).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(localStorage.getItem("dogovori:perf-log")).toContain("LCP");
  });

  it("със съгласие: core метриките се пращат с груби измерения", async () => {
    consent = true;
    await boot("/document/2b0f5f7e-1111-2222-3333-444455556666");
    handlers.INP?.({ name: "INP", value: 180, rating: "good" });
    await vi.advanceTimersByTimeAsync(0);
    expect(trackEvent).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("record_web_vital_aggregate");
    expect(args._metric).toBe("INP");
    expect(args._value).toBe(180);
    expect(args._route_group).toBe("other");
    const payload = JSON.stringify(args);
    expect(payload).not.toContain("2b0f5f7e");
    expect(payload).not.toContain("/document/");
  });

  it("FCP/TTFB не се пазят централно", async () => {
    consent = true;
    await boot();
    handlers.FCP?.({ name: "FCP", value: 900, rating: "good" });
    handlers.TTFB?.({ name: "TTFB", value: 300, rating: "good" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledTimes(2);
  });

  it("една метрика се записва централно най-много веднъж", async () => {
    consent = true;
    await boot();
    handlers.CLS?.({ name: "CLS", value: 0.05, rating: "good" });
    handlers.CLS?.({ name: "CLS", value: 0.09, rating: "good" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect((rpc.mock.calls[0][1] as Record<string, unknown>)._value).toBe(50);
  });
});
