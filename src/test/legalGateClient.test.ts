import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  classifyGenerationError,
  isLegalVerificationUnavailable,
  generationErrorMessage,
} from "@/lib/generationErrors";

const toastInfo = vi.fn();
vi.mock("sonner", () => ({ toast: { info: (...a: unknown[]) => toastInfo(...a) } }));

describe("правната преграда е възстановимо състояние", () => {
  beforeEach(() => toastInfo.mockClear());

  it("разпознава кода от тялото и от грешката", () => {
    expect(isLegalVerificationUnavailable({ data: { code: "legal_verification_unavailable" } }))
      .toBe(true);
    expect(isLegalVerificationUnavailable({ error: { code: "legal_verification_unavailable" } }))
      .toBe(true);
    expect(isLegalVerificationUnavailable({ data: { code: "quota_exceeded" } })).toBe(false);
  });

  it("класифицира се като безопасен повторен опит, не като преграда", () => {
    const gen = classifyGenerationError({ data: { code: "legal_verification_unavailable" } });
    expect(gen.code).toBe("legal_verification_unavailable");
    expect(gen.retryable).toBe(true);
    expect(gen.gate).toBe(false);
  });

  it("съобщението казва, че данните са запазени и няма таксуване", () => {
    const msg = generationErrorMessage("legal_verification_unavailable");
    expect(msg).toContain("запазени");
    expect(msg).toMatch(/не е използвана квота и няма плащане/);
    expect(msg).not.toMatch(/загуб/i);
  });

  it("показва информативно съобщение с действие и връща true", async () => {
    const { handleLegalVerificationUnavailable } = await import("@/lib/legalGateClient");
    const retry = vi.fn();
    const handled = handleLegalVerificationUnavailable(
      { data: { code: "legal_verification_unavailable" } },
      retry,
    );
    expect(handled).toBe(true);
    expect(toastInfo).toHaveBeenCalledTimes(1);
    const [, opts] = toastInfo.mock.calls[0] as [string, { action?: { label: string } }];
    expect(opts.action?.label).toBe("Опитайте отново");
    expect(handleLegalVerificationUnavailable({ error: { message: "друго" } })).toBe(false);
  });
});

describe("всички клиенти на правните функции разпознават преградата", () => {
  const files = [
    "src/components/AssistantChat.tsx",
    "src/components/UploadContractDialog.tsx",
    "src/pages/BuildContract.tsx",
    "src/pages/UploadedContract.tsx",
  ];
  it("използват общия обработчик", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("handleLegalVerificationUnavailable");
    }
  });

  it("съобщението казва, че няма таксуване и работата е запазена", async () => {
    const { LEGAL_GATE_MESSAGE } = await import("@/lib/legalGateClient");
    expect(LEGAL_GATE_MESSAGE).toMatch(/квота/);
    expect(LEGAL_GATE_MESSAGE).toMatch(/плащан/);
  });
});
