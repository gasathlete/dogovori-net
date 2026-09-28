import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeroVideoBackdrop } from "@/components/HeroVideoBackdrop";
import { LazyOnVisible } from "@/components/LazyOnVisible";

const observed: Element[] = [];
let ioCallback: IntersectionObserverCallback | null = null;
class FakeIO {
  constructor(cb: IntersectionObserverCallback) { ioCallback = cb; }
  observe(el: Element) { observed.push(el); }
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
}

function setMatchMedia(matches: (q: string) => boolean) {
  window.matchMedia = ((query: string) => ({
    matches: matches(query), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  observed.length = 0; ioCallback = null;
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("HeroVideoBackdrop lifecycle", () => {
  it("attaches the visibility observer to the video mounted after idle and pauses offscreen/hidden", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => { cb(); return 1; });
    setMatchMedia((q) => q.includes("min-width: 768px"));
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

    render(<HeroVideoBackdrop />);
    const video = await screen.findByTestId("hero-video");
    expect(observed).toContain(video);

    act(() => ioCallback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(pause).toHaveBeenCalled();
    pause.mockClear();
    act(() => ioCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(play).toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(pause).toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    expect(screen.getByRole("button", { name: "Спри фоновото видео" })).toBeInTheDocument();
  });

  it("keeps poster only on phones / coarse pointers", () => {
    setMatchMedia(() => false);
    const { container } = render(<HeroVideoBackdrop />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("srcset")).toContain("960w");
  });
});

describe("LazyOnVisible", () => {
  it("mounts immediately when the URL has a section hash so deep links resolve", () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    window.history.replaceState(null, "", "/#produkti");
    render(<LazyOnVisible minHeight={[900, 500]}><section id="produkti">Продукти</section></LazyOnVisible>);
    expect(document.getElementById("produkti")).not.toBeNull();
  });

  it("reserves phone/tablet/desktop heights via CSS until the real section replaces its skeleton", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    const { container } = render(<LazyOnVisible minHeight={[900, 700, 500]}><p>x</p></LazyOnVisible>);
    const wrap = container.firstChild as HTMLElement;
    expect(wrap.className).toBe("lov-reserve");
    expect(wrap.style.getPropertyValue("--lov-tablet")).toBe("700px");
    expect(screen.queryByText("x")).toBeNull();
    // Same-page hash navigation mounts pending sections.
    act(() => { window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(screen.getByText("x")).toBeInTheDocument();
    await act(async () => { await Promise.resolve(); });
    expect(wrap.className).toBe("");
  });

  it("keeps the reservation while a Suspense skeleton is showing", () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    window.history.replaceState(null, "", "/#x");
    const { container } = render(<LazyOnVisible minHeight={[900, 700, 500]}><section data-section-skeleton="" /></LazyOnVisible>);
    expect((container.firstChild as HTMLElement).className).toBe("lov-reserve");
  });
});
