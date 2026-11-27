import { describe, it, expect, beforeEach } from "vitest";
import {
  ensureFeatureDisclaimer, hasFeatureDisclaimer, isDisclaimerCancel, DISCLAIMER_BODY, DISCLAIMER_VERSION,
} from "@/lib/aiDisclaimerGate";

function answerNext(accepted: boolean) {
  const h = (e: Event) => {
    window.removeEventListener("ai-disclaimer:request", h);
    const { id } = (e as CustomEvent).detail;
    setTimeout(() => window.dispatchEvent(new CustomEvent("ai-disclaimer:resolved", { detail: { id, accepted } })), 0);
  };
  window.addEventListener("ai-disclaimer:request", h);
}

describe("feature disclaimer gate", () => {
  beforeEach(() => sessionStorage.clear());

  it("uses the exact owner text without the retired phrase", () => {
    expect(DISCLAIMER_BODY).toContain("Проверете внимателно преди подписване.");
    expect(DISCLAIMER_BODY).not.toContain("Не използвайте текущата версия");
  });

  it("cancel rejects and stores nothing", async () => {
    answerNext(false);
    const err = await ensureFeatureDisclaimer("analysis").catch((e) => e);
    expect(isDisclaimerCancel(err)).toBe(true);
    expect(hasFeatureDisclaimer("analysis")).toBe(false);
  });

  it("accept resolves, is scoped per feature and version, and does not reprompt", async () => {
    answerNext(true);
    await ensureFeatureDisclaimer("generation");
    expect(hasFeatureDisclaimer("generation")).toBe(true);
    expect(hasFeatureDisclaimer("assistant")).toBe(false);
    expect(sessionStorage.getItem(`dogovori:disclaimer:generation:${DISCLAIMER_VERSION}`)).toBe("1");
    let prompted = false;
    const h = () => { prompted = true; };
    window.addEventListener("ai-disclaimer:request", h);
    await ensureFeatureDisclaimer("generation");
    window.removeEventListener("ai-disclaimer:request", h);
    expect(prompted).toBe(false);
  });

  it("concurrent calls share one dialog", async () => {
    let count = 0;
    const h = (e: Event) => {
      count++;
      const { id } = (e as CustomEvent).detail;
      setTimeout(() => window.dispatchEvent(new CustomEvent("ai-disclaimer:resolved", { detail: { id, accepted: true } })), 0);
    };
    window.addEventListener("ai-disclaimer:request", h);
    await Promise.all([ensureFeatureDisclaimer("assistant"), ensureFeatureDisclaimer("assistant")]);
    window.removeEventListener("ai-disclaimer:request", h);
    expect(count).toBe(1);
  });
});
