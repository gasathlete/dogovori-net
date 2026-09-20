import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchVerifiedStrategy,
  hasValidStrategyEvidence,
  looksLikeStrategyEnvelope,
  readVerifiedStrategy,
} from "@/lib/strategyEvidence";

const ANALYSIS_ID = "11111111-1111-1111-1111-111111111111";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

describe("преговорната стратегия се доверява само на сървъра", () => {
  beforeEach(() => invoke.mockReset());

  it("локален запис никога не се показва без сървърна проверка", () => {
    expect(hasValidStrategyEvidence()).toBe(false);
    expect(readVerifiedStrategy()).toBeNull();
  });

  it("разпознава само наличие на плик, без да го приема за валиден", () => {
    expect(looksLikeStrategyEnvelope(null)).toBe(false);
    expect(looksLikeStrategyEnvelope({ summary: "стара" })).toBe(false);
    expect(looksLikeStrategyEnvelope({ __evidence: { version: "v2" } })).toBe(true);
  });

  it("удостоверен от сървъра резултат се показва", async () => {
    invoke.mockResolvedValue({ data: { strategy: { summary: "Стратегия" } }, error: null });
    await expect(fetchVerifiedStrategy(ANALYSIS_ID)).resolves.toEqual({ summary: "Стратегия" });
    expect(invoke).toHaveBeenCalledWith("negotiation-strategy", {
      body: { analysis_id: ANALYSIS_ID, cached_only: true },
    });
  });

  it("неудостоверен, подправен или остарял запис остава скрит", async () => {
    invoke.mockResolvedValue({ data: { strategy: null, reason: "bad_signature" }, error: null });
    await expect(fetchVerifiedStrategy(ANALYSIS_ID)).resolves.toBeNull();
  });

  it("грешка от сървъра не показва резултат", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("net") });
    await expect(fetchVerifiedStrategy(ANALYSIS_ID)).resolves.toBeNull();
  });
});
