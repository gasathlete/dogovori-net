/**
 * Гард: репортерът не изнася НИЩО навън без съгласие за аналитика,
 * а при съгласие праща само LCP/INP/CLS централно, с груби измерения,
 * валиден и съгласуван с прага рейтинг, най-много веднъж на метрика.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RecordWebVitalAggregateArgs } from "@/lib/webVitals/pendingSchema";

type CentralArgs = RecordWebVitalAggregateArgs;

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
  delete window.__lovableVitalsBooted;
  const { initWebVitalsReporter } = await import("@/lib/webVitalsReporter");
  initWebVitalsReporter();
  // requestIdleCallback fallback → setTimeout
  await vi.advanceTimersByTimeAsync(3000);
}

const rpcArgs = (i = 0): CentralArgs => rpc.mock.calls[i][1] as CentralArgs;
const gaProps = (i = 0): Record<string, unknown> => trackEvent.mock.calls[i][1] as Record<string, unknown>;

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

  it("съгласието се проверява в момента на callback-а, не при boot", async () => {
    consent = false;
    await boot();
    handlers.LCP?.({ name: "LCP", value: 1200, rating: "good" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).not.toHaveBeenCalled();
    consent = true; // потребителят приема бисквитките след зареждането
    handlers.INP?.({ name: "INP", value: 150, rating: "good" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpcArgs()._metric).toBe("INP");
    consent = false; // оттегляне — следващата метрика остава само локална
    handlers.CLS?.({ name: "CLS", value: 0.02, rating: "good" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("dogovori:perf-log")).toContain("CLS");
  });

  it("със съгласие: core метриките се пращат с груби измерения, без идентификатори", async () => {
    consent = true;
    await boot("/document/2b0f5f7e-1111-2222-3333-444455556666?token=abc#x");
    handlers.INP?.({ name: "INP", value: 180, rating: "good" });
    await vi.advanceTimersByTimeAsync(0);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn] = rpc.mock.calls[0] as [string, CentralArgs];
    expect(fn).toBe("record_web_vital_aggregate");
    const args = rpcArgs();
    expect(args).toEqual({
      _metric: "INP",
      _rating: "good",
      _route_group: "other",
      _device_class: expect.stringMatching(/^(mobile|tablet|desktop)$/),
      _navigation_type: expect.stringMatching(/^(navigate|reload|back-forward|prerender|other)$/),
      _value: 180,
    });
    expect(Object.keys(args).sort()).toEqual([
      "_device_class",
      "_metric",
      "_navigation_type",
      "_rating",
      "_route_group",
      "_value",
    ]);
    for (const payload of [JSON.stringify(args), JSON.stringify(gaProps())]) {
      expect(payload).not.toContain("2b0f5f7e");
      expect(payload).not.toContain("/document/");
      expect(payload).not.toContain("token");
      expect(payload).not.toContain("abc");
    }
  });

  it("FCP/TTFB не се пазят централно (само локален лог + consent-gated аналитика)", async () => {
    consent = true;
    await boot();
    handlers.FCP?.({ name: "FCP", value: 900, rating: "good" });
    handlers.TTFB?.({ name: "TTFB", value: 300, rating: "good" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("dogovori:perf-log")).toContain("TTFB");
  });

  it("една метрика се записва централно най-много веднъж", async () => {
    consent = true;
    await boot();
    handlers.CLS?.({ name: "CLS", value: 0.05, rating: "good" });
    handlers.CLS?.({ name: "CLS", value: 0.09, rating: "good" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpcArgs()._value).toBe(50);
    expect(trackEvent).toHaveBeenCalledTimes(2);
  });

  it("не стартира два пъти (глобален маркер в Window)", async () => {
    consent = true;
    await boot();
    const { initWebVitalsReporter } = await import("@/lib/webVitalsReporter");
    initWebVitalsReporter(); // втори опит — игнориран
    await vi.advanceTimersByTimeAsync(3000);
    handlers.LCP?.({ name: "LCP", value: 1000, rating: "good" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(window.__lovableVitalsBooted).toBe(true);
  });
});

describe("webVitalsReporter — валидност на рейтинга преди централния запис", () => {
  it("несъответствие рейтинг ↔ стойност не се записва централно", async () => {
    consent = true;
    await boot();
    handlers.LCP?.({ name: "LCP", value: 3000, rating: "good" }); // 3000 ms не е good
    handlers.INP?.({ name: "INP", value: 100, rating: "poor" }); // 100 ms не е poor
    handlers.CLS?.({ name: "CLS", value: 0.3, rating: "needs-improvement" }); // 0.3 е poor
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).not.toHaveBeenCalled();
    // Локалният лог и аналитиката не са засегнати от тази проверка.
    expect(trackEvent).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem("dogovori:perf-log")).toContain("LCP");
  });

  it("невалиден рейтинг (извън allow-list) не се записва централно", async () => {
    consent = true;
    await boot();
    handlers.LCP?.({ name: "LCP", value: 1000, rating: "Good" });
    handlers.INP?.({ name: "INP", value: 100, rating: "ni" });
    handlers.CLS?.({ name: "CLS", value: 0.01, rating: undefined });
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("невалидна първа проба не блокира валидна следваща проба за същата метрика", async () => {
    consent = true;
    await boot();
    handlers.CLS?.({ name: "CLS", value: 0.5, rating: "good" }); // отхвърлена
    handlers.CLS?.({ name: "CLS", value: 0.5, rating: "poor" }); // валидна
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpcArgs()).toMatchObject({ _metric: "CLS", _rating: "poor", _value: 500 });
  });

  it("стойности извън разумните граници не се записват", async () => {
    consent = true;
    await boot();
    handlers.LCP?.({ name: "LCP", value: 700000, rating: "poor" });
    handlers.CLS?.({ name: "CLS", value: 15, rating: "poor" }); // 15 000 > 10 000
    handlers.INP?.({ name: "INP", value: Number.NaN, rating: "good" });
    await vi.advanceTimersByTimeAsync(0);
    // NaN → 0 → good: единствената съгласувана проба.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpcArgs()).toMatchObject({ _metric: "INP", _rating: "good", _value: 0 });
  });

  it("точните гранични стойности са good и за RPC, и за аналитичната кофа", async () => {
    consent = true;
    await boot();
    handlers.LCP?.({ name: "LCP", value: 2500, rating: "good" });
    handlers.INP?.({ name: "INP", value: 200, rating: "good" });
    handlers.CLS?.({ name: "CLS", value: 0.1, rating: "good" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpcArgs(0)).toMatchObject({ _metric: "LCP", _rating: "good", _value: 2500 });
    expect(rpcArgs(1)).toMatchObject({ _metric: "INP", _rating: "good", _value: 200 });
    expect(rpcArgs(2)).toMatchObject({ _metric: "CLS", _rating: "good", _value: 100 });
    expect(gaProps(0)).toMatchObject({ metric: "LCP", bucket: "good", value: 2500 });
    expect(gaProps(1)).toMatchObject({ metric: "INP", bucket: "good", value: 200 });
    expect(gaProps(2)).toMatchObject({ metric: "CLS", bucket: "good", value: 100 });
  });

  it("малко над прага е needs-improvement (и за RPC, и за кофата)", async () => {
    consent = true;
    await boot();
    handlers.LCP?.({ name: "LCP", value: 2500.4, rating: "needs-improvement" });
    handlers.INP?.({ name: "INP", value: 200.1, rating: "needs-improvement" });
    handlers.CLS?.({ name: "CLS", value: 0.1001, rating: "needs-improvement" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpcArgs(0)).toMatchObject({ _metric: "LCP", _rating: "needs-improvement", _value: 2501 });
    expect(rpcArgs(1)).toMatchObject({ _metric: "INP", _rating: "needs-improvement", _value: 201 });
    expect(rpcArgs(2)).toMatchObject({ _metric: "CLS", _rating: "needs-improvement", _value: 101 });
    expect(gaProps(0).bucket).toBe("ni");
    expect(gaProps(1).bucket).toBe("ni");
    expect(gaProps(2).bucket).toBe("ni");
  });

  it("горните включителни граници (4000/500/0.250) са needs-improvement, +1 е poor", async () => {
    consent = true;
    await boot();
    handlers.LCP?.({ name: "LCP", value: 4000, rating: "needs-improvement" });
    handlers.INP?.({ name: "INP", value: 501, rating: "poor" });
    handlers.CLS?.({ name: "CLS", value: 0.25, rating: "needs-improvement" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpcArgs(0)).toMatchObject({ _rating: "needs-improvement", _value: 4000 });
    expect(rpcArgs(1)).toMatchObject({ _rating: "poor", _value: 501 });
    expect(rpcArgs(2)).toMatchObject({ _rating: "needs-improvement", _value: 250 });
    expect(gaProps(0).bucket).toBe("ni");
    expect(gaProps(1).bucket).toBe("poor");
    expect(gaProps(2).bucket).toBe("ni");
  });
});

describe("bucketize / prepareCentralArgs (чисти функции)", () => {
  it("bucketize ползва включителните прагове за core и aux метриките", async () => {
    const { bucketize } = await import("@/lib/webVitalsReporter");
    expect(bucketize("LCP", 2500)).toBe("good");
    expect(bucketize("LCP", 2500.01)).toBe("ni");
    expect(bucketize("LCP", 4000)).toBe("ni");
    expect(bucketize("LCP", 4000.01)).toBe("poor");
    expect(bucketize("INP", 200)).toBe("good");
    expect(bucketize("INP", 500)).toBe("ni");
    expect(bucketize("INP", 501)).toBe("poor");
    expect(bucketize("CLS", 0.1)).toBe("good");
    expect(bucketize("CLS", 0.25)).toBe("ni");
    expect(bucketize("CLS", 0.2501)).toBe("poor");
    expect(bucketize("FCP", 1800)).toBe("good");
    expect(bucketize("FCP", 1801)).toBe("ni");
    expect(bucketize("TTFB", 800)).toBe("good");
    expect(bucketize("TTFB", 1800)).toBe("ni");
    expect(bucketize("TTFB", 1801)).toBe("poor");
    expect(bucketize("FID", 10)).toBe("n/a");
  });

  it("prepareCentralArgs връща null при несъответствие и типизирани аргументи иначе", async () => {
    const { prepareCentralArgs } = await import("@/lib/webVitalsReporter");
    const ctx = { routeGroup: "home", deviceClass: "desktop", navigationType: "navigate" } as const;
    expect(prepareCentralArgs("LCP", "good", 2600, ctx)).toBeNull();
    expect(prepareCentralArgs("LCP", "bad", 1000, ctx)).toBeNull();
    expect(prepareCentralArgs("LCP", null, 1000, ctx)).toBeNull();
    expect(prepareCentralArgs("CLS", "poor", 99, ctx)).toBeNull(); // 99 000 > 10 000
    const ok: CentralArgs | null = prepareCentralArgs("LCP", "good", 2500, ctx);
    expect(ok).toEqual({
      _metric: "LCP",
      _rating: "good",
      _route_group: "home",
      _device_class: "desktop",
      _navigation_type: "navigate",
      _value: 2500,
    });
  });
});
