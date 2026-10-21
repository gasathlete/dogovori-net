import "@testing-library/jest-dom";

if (typeof window !== "undefined") Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom няма ResizeObserver. Без него компоненти с наблюдение на размер
// хвърлят необработена грешка в commit фазата на React и тестовият процес
// приключва с неясен провал.
if (!("ResizeObserver" in globalThis)) {
  class TestResizeObserver implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    TestResizeObserver as unknown as typeof ResizeObserver;
}

// Pre-start disclaimers are covered by featureDisclaimerGate.test.ts; other
// suites test the flows after acceptance, so accept them for this session.
import { beforeEach as __beforeEachDisclaimer } from "vitest";
import { DISCLAIMER_FEATURES, setFeatureDisclaimer } from "@/lib/aiDisclaimerGate";
__beforeEachDisclaimer(() => {
  if (typeof window !== "undefined") DISCLAIMER_FEATURES.forEach((f) => setFeatureDisclaimer(f));
});
