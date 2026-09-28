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

  it("reserves the phone height below 1024px until visible", () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    setMatchMedia(() => false);
    const { container } = render(<LazyOnVisible minHeight={[900, 500]}><p>x</p></LazyOnVisible>);
    expect((container.firstChild as HTMLElement).style.minHeight).toBe("900px");
    expect(screen.queryByText("x")).toBeNull();
  });
});
