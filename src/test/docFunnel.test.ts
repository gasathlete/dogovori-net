import { beforeEach, describe, expect, it, vi } from "vitest";

const { trackFunnelEvent } = vi.hoisted(() => ({ trackFunnelEvent: vi.fn(() => true) }));
vi.mock("@/lib/funnel", () => ({ trackFunnelEvent }));
vi.mock("@/lib/ab", () => ({ abProps: () => ({ ab: { quick_preview: "a" } }) }));

import {
  normalizeReason,
  isGateReason,
  trackGenerate,
  trackDocStart,
  trackAuthPromptShown,
  trackPaywallShown,
  trackCheckoutCompleted,
  trackResultViewed,
  trackDocumentSaved,
  trackDownload,
} from "@/lib/docFunnel";
import { resetOnceStore } from "@/lib/funnelEvents";

type Call = [string, Record<string, unknown>, { dedupKey?: string } | undefined];
const calls = () => trackFunnelEvent.mock.calls as unknown as Call[];
const last = () => calls()[calls().length - 1];

beforeEach(() => {
  trackFunnelEvent.mockClear();
  resetOnceStore();
});

describe("normalizeReason — стабилни причини без PII", () => {
  it("прегради и кодове минават непроменени", () => {
    expect(normalizeReason("quota_exceeded")).toBe("quota_exceeded");
    expect(normalizeReason("needs_confirmation")).toBe("needs_confirmation");
    expect(normalizeReason("Requires_Login")).toBe("requires_login");
    expect(normalizeReason("ai_parse_failed")).toBe("ai_parse_failed");
  });

  it("мрежови и времеви срывове се класифицират", () => {
    expect(normalizeReason("Failed to send a request to the Edge Function")).toBe("network");
    expect(normalizeReason("TypeError: Load failed")).toBe("network");
    expect(normalizeReason("Генерирането отне твърде дълго. Опитайте отново.")).toBe("timeout");
    expect(normalizeReason("The operation was aborted")).toBe("aborted");
  });

  it("невалиден AI отговор → ai_parse_failed, HTTP статуси → http_XXX", () => {
    expect(normalizeReason("Unexpected token } in JSON at position 4231")).toBe("ai_parse_failed");
    expect(normalizeReason("Edge Function returned a non-2xx status code 502")).toBe("http_502");
  });

  it("свободен текст става кратък slug без цифри/пунктуация (без PII)", () => {
    const r = normalizeReason("Грешка при потребител ivan@example.com, ЕГН 8001011234!");
    expect(r).not.toMatch(/@|\d/);
    expect(r.length).toBeLessThanOrEqual(48);
    expect(normalizeReason("")).toBe("unknown");
    expect(normalizeReason(undefined)).toBe("unknown");
  });

  it("isGateReason разпознава продуктовите прегради", () => {
    expect(isGateReason("quota_exceeded")).toBe(true);
    expect(isGateReason("requires_login")).toBe(true);
    expect(isGateReason("network")).toBe(false);
  });
});

describe("trackGenerate — семантика на резултатите", () => {
  it("fail с gate reason се преквалифицира като blocked", () => {
    trackGenerate("fail", { doc_key: "X", source: "wizard", reason: "quota_exceeded" });
    const [name, props] = last();
    expect(name).toBe("doc_generate_blocked");
    expect(props.event).toBe("generation_blocked");
    expect(props.outcome).toBe("blocked");
    expect(props.reason).toBe("quota_exceeded");
    expect(props.dstage).toBe("generate");
  });

  it("реален провал остава fail, а суровото съобщение не се пренася", () => {
    trackGenerate("fail", {
      doc_key: "X",
      source: "wizard",
      reason: "Failed to send a request to the Edge Function",
      message: "stack trace with ivan@example.com",
      error_class: "network",
      retryable: true,
    });
    const [name, props] = last();
    expect(name).toBe("doc_generate_fail");
    expect(props.reason).toBe("network");
    expect(props.message).toBeUndefined();
    expect(props.error_class).toBe("network");
    expect(props.retryable).toBe(true);
  });

  it("всеки опит е отделно събитие — няма дедупликация", () => {
    trackGenerate("started", { doc_key: "X", source: "wizard" });
    trackGenerate("started", { doc_key: "X", source: "wizard" });
    trackGenerate("success", { doc_key: "X", source: "wizard" });
    expect(calls()).toHaveLength(3);
    for (const c of calls()) expect(c[2]).toBeUndefined();
  });
});

describe("еднократни събития — dedup ключове", () => {
  it("document_selected носи dedup ключ по (doc_key, source)", () => {
    trackDocStart({ doc_key: "Trudov", source: "wizard" });
    trackDocStart({ doc_key: "trudov", source: "wizard" });
    const [a, b] = calls();
    expect(a[0]).toBe("doc_start");
    expect(a[2]?.dedupKey).toBeTruthy();
    expect(a[2]?.dedupKey).toBe(b[2]?.dedupKey);
  });

  it("auth_prompt_shown и paywall_shown се различават по намерение/вид", () => {
    trackAuthPromptShown({ doc_key: "d", source: "wizard", action: "generate" });
    trackAuthPromptShown({ doc_key: "d", source: "wizard", action: "download_pdf" });
    trackPaywallShown("quota", { doc_key: "d", source: "wizard" });
    trackPaywallShown("strict_unlock", { doc_key: "d", source: "wizard" });
    const keys = calls().map((c) => c[2]?.dedupKey);
    expect(new Set(keys).size).toBe(4);
    expect(calls()[2][1].kind).toBe("quota");
  });

  it("checkout_completed се дедупликира по Stripe session id", () => {
    trackCheckoutCompleted("cs_test_123", { kind: "subscription" });
    trackCheckoutCompleted("cs_test_123", { kind: "subscription" });
    const [a, b] = calls();
    expect(a[0]).toBe("upgrade_completed");
    expect(a[2]?.dedupKey).toBe(b[2]?.dedupKey);
    trackCheckoutCompleted("cs_test_456");
    expect(last()[2]?.dedupKey).not.toBe(a[2]?.dedupKey);
  });

  it("document_saved се дедупликира по id на записа, result_viewed по документ", () => {
    trackDocumentSaved("11111111-1111-4111-8111-111111111111", { doc_key: "d", source: "build" });
    trackDocumentSaved("11111111-1111-4111-8111-111111111111", { doc_key: "d", source: "build" });
    trackResultViewed({ doc_key: "d", source: "build" });
    const [a, b, c] = calls();
    expect(a[0]).toBe("document_saved");
    expect(a[2]?.dedupKey).toBe(b[2]?.dedupKey);
    expect(c[0]).toBe("result_viewed");
    expect(c[2]?.dedupKey).toBeTruthy();
  });

  it("свалянията не се дедупликират и носят етап download", () => {
    trackDownload("success", { doc_key: "d", source: "wizard", format: "pdf" });
    trackDownload("fail", { doc_key: "d", source: "wizard", reason: "Load failed" });
    const [a, b] = calls();
    expect(a[0]).toBe("doc_download_success");
    expect(a[1].dstage).toBe("download");
    expect(a[2]).toBeUndefined();
    expect(b[0]).toBe("doc_download_fail");
  });
});
