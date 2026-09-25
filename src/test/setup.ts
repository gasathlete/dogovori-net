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
