import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartnerCarousel, partnerVisibleSlots } from "@/components/PartnerCarousel";

let width = 320;
let reduced = false;
const partners = Array.from({ length: 4 }, (_, i) => ({ id: String(i), name: `Partner ${i}`, logo_url: `/logo-${i}.png`, website_url: `https://example.org/${i}` }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { constructor(private cb: Function) {} observe() { this.cb([{ contentRect: { width } }]); } disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { constructor(private cb: Function) {} observe() { this.cb([{ isIntersecting: true }]); } disconnect() {} });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); width = 320; reduced = false; });
describe("partner carousel behavior", () => {
  it("allocates two/three mobile slots and six desktop slots", () => {
    expect(partnerVisibleSlots(328)).toBe(2);
    expect(partnerVisibleSlots(358)).toBe(3);
    expect(partnerVisibleSlots(398)).toBe(3);
    expect(partnerVisibleSlots(1200)).toBe(6);
  });
  it("has no motion or duplicates for empty/single/fewer-than-visible lists", () => {
    const view = render(<PartnerCarousel partners={[]} />);
    expect(screen.queryByRole("region")).toBeNull();
    view.rerender(<PartnerCarousel partners={partners.slice(0, 1)} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button")).toBeNull();
    width = 1000;
    view.unmount();
    render(<PartnerCarousel partners={partners} />);
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("advances at 3500ms, wraps without animation and pauses explicitly/hover/focus", () => {
    const { container } = render(<PartnerCarousel partners={partners} />);
    const track = container.querySelector<HTMLElement>("[data-partner-track]");
    if (!track) throw new Error("missing track");
    const initial = track.style.transform;
    act(() => vi.advanceTimersByTime(3500));
    expect(track.style.transform).not.toBe(initial);
    expect(track.style.transition).toContain("650ms");
    fireEvent.transitionEnd(track);
    fireEvent.click(screen.getByRole("button", { name: "Спри въртенето" }));
    const pausedPosition = track.style.transform;
    act(() => vi.advanceTimersByTime(7000));
    expect(track.style.transform).toBe(pausedPosition);
    fireEvent.click(screen.getByRole("button", { name: "Продължи въртенето" }));
    fireEvent.mouseEnter(screen.getByRole("region"));
    act(() => vi.advanceTimersByTime(3500));
    expect(track.style.transform).toBe(pausedPosition);
    fireEvent.mouseLeave(screen.getByRole("region"));
    fireEvent.focus(screen.getByRole("button", { name: "Следващо лого" }));
    act(() => vi.advanceTimersByTime(3500));
    expect(track.style.transform).toBe(pausedPosition);
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Следващо лого" }));
      fireEvent.transitionEnd(track);
    }
    expect(track.style.transform).toBe(initial);
    expect(track.style.transition).toBe("none");
    for (const clone of container.querySelectorAll('li[aria-hidden="true"] a')) expect(clone.getAttribute("tabindex")).toBe("-1");
  });
  it("honors reduced motion while retaining manual steps and exact links", () => {
    reduced = true;
    const { container } = render(<PartnerCarousel partners={partners} />);
    const track = container.querySelector<HTMLElement>("[data-partner-track]");
    const initial = track?.style.transform;
    act(() => vi.advanceTimersByTime(7000));
    expect(track?.style.transform).toBe(initial);
    expect(screen.queryByRole("button", { name: "Спри въртенето" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Следващо лого" }));
    expect(track?.style.transform).not.toBe(initial);
    expect(track?.style.transition).toBe("none");
    expect(screen.getByRole("link", { name: "Partner 1" }).getAttribute("href")).toBe("https://example.org/1");
  });
});