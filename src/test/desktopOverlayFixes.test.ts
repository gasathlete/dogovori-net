import { describe, expect, it } from "vitest";
import { computeLauncherOffset } from "@/hooks/useLauncherOffset";
import { shouldHandleEscape } from "@/lib/escapeLayer";
import { clearBufferedEvents, dispatchBuffered, drainBufferedEvents } from "@/lib/bufferedEvents";

describe("AI launcher placement", () => {
  it("stays at the default corner when nothing is below it", () => {
    expect(computeLauncherOffset({ viewportHeight: 800, cookieTop: null, footerTop: null, launcherHeight: 48 })).toEqual({ bottom: 24, hidden: false });
  });
  it("rises above an open cookie banner", () => {
    expect(computeLauncherOffset({ viewportHeight: 800, cookieTop: 640, footerTop: null, launcherHeight: 48 }).bottom).toBe(172);
  });
  it("rises above the visible footer", () => {
    expect(computeLauncherOffset({ viewportHeight: 768, cookieTop: null, footerTop: 500, launcherHeight: 48 }).bottom).toBe(280);
  });
  it("hides when the footer leaves no room", () => {
    expect(computeLauncherOffset({ viewportHeight: 768, cookieTop: null, footerTop: 100, launcherHeight: 48 }).hidden).toBe(true);
  });
});

describe("Escape layering", () => {
  it("ignores Escape while a dialog layer is open", () => {
    const el = document.createElement("div"); el.setAttribute("role", "dialog"); el.setAttribute("data-state", "open");
    document.body.appendChild(el);
    expect(shouldHandleEscape(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(false);
    el.remove();
    expect(shouldHandleEscape(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(true);
  });
  it("does not replay a story request that was already handled", () => {
    dispatchBuffered("t:story");
    clearBufferedEvents("t:story");
    let replays = 0;
    drainBufferedEvents("t:story", () => { replays += 1; });
    expect(replays).toBe(0);
  });
});
