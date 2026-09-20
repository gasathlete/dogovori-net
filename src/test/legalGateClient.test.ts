import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  classifyGenerationError,
  isLegalVerificationUnavailable,
  generationErrorMessage,
} from "@/lib/generationErrors";

const toastInfo = vi.fn();
vi.mock("sonner", () => ({ toast: { info: (...a: unknown[]) => toastInfo(...a) } }));

type ToastOpts = {
  description?: string;
  action?: { label: string; onClick: () => void };
};

function lastToast(): [string, ToastOpts] {
  return toastInfo.mock.calls.at(-1) as [string, ToastOpts];
}

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

  it("действието „Опитайте отново“ изпълнява точно подадения обратен извик", async () => {
    const { handleLegalVerificationUnavailable } = await import("@/lib/legalGateClient");
    const retry = vi.fn();
    const handled = handleLegalVerificationUnavailable(
      { data: { code: "legal_verification_unavailable" } },
      retry,
    );
    expect(handled).toBe(true);
    const [, opts] = lastToast();
    expect(opts.action?.label).toBe("Опитайте отново");
    // Няма автоматичен цикъл: изпълнява се само при действие от човек.
    expect(retry).not.toHaveBeenCalled();
    opts.action!.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(handleLegalVerificationUnavailable({ error: { message: "друго" } })).toBe(false);
  });
});

describe("retry_after_seconds се чете безопасно", () => {
  beforeEach(() => toastInfo.mockClear());

  it("валидна стойност дава човешка подсказка на български", async () => {
    const { parseRetryAfterSeconds, retryAfterHint, handleLegalVerificationUnavailable } =
      await import("@/lib/legalGateClient");
    expect(parseRetryAfterSeconds({ data: { retry_after_seconds: 900 } })).toBe(900);
    expect(retryAfterHint(900)).toBe("Опитайте след около 15 минути.");
    expect(retryAfterHint(30)).toBe("Опитайте след около 30 секунди.");

    handleLegalVerificationUnavailable(
      { data: { code: "legal_verification_unavailable", retry_after_seconds: 60 } },
      () => {},
    );
    const [, opts] = lastToast();
    expect(opts.description).toBe("Опитайте след около 60 секунди.");
    // Ръчното действие остава винаги налично.
    expect(opts.action?.label).toBe("Опитайте отново");
  });

  it("повредена или извън граници стойност се игнорира", async () => {
    const { parseRetryAfterSeconds, handleLegalVerificationUnavailable } =
      await import("@/lib/legalGateClient");
    for (
      const bad of [
        "скоро",
        Number.NaN,
        Infinity,
        -5,
        0,
        4000,
        12.5,
        null,
        undefined,
        {},
        [],
      ]
    ) {
      expect(parseRetryAfterSeconds({ data: { retry_after_seconds: bad } })).toBeNull();
    }
    handleLegalVerificationUnavailable(
      { data: { code: "legal_verification_unavailable", retry_after_seconds: "по-късно" } },
      () => {},
    );
    const [, opts] = lastToast();
    expect(opts.description).toBeUndefined();
    expect(opts.action?.label).toBe("Опитайте отново");
  });

  it("чете стойността и от грешката", async () => {
    const { parseRetryAfterSeconds } = await import("@/lib/legalGateClient");
    expect(parseRetryAfterSeconds({ error: { retry_after_seconds: 120 } })).toBe(120);
    expect(parseRetryAfterSeconds({ error: { context: { retry_after_seconds: 5 } } })).toBe(5);
  });
});

describe("всеки клиент подава действие за повторен опит и освобождава „заето“", () => {
  const callers: Array<{ file: string; expected: number }> = [
    { file: "src/components/AssistantChat.tsx", expected: 1 },
    // качване + анализ: грешка и тяло с код
    { file: "src/components/UploadContractDialog.tsx", expected: 2 },
    // генериране + прилагане на корекции
    { file: "src/pages/BuildContract.tsx", expected: 2 },
    // повторен анализ + поправка на качен документ
    { file: "src/pages/UploadedContract.tsx", expected: 2 },
  ];

  it("нито едно извикване не остава без обратен извик за повторен опит", async () => {
    const { readFileSync } = await import("node:fs");
    for (const { file, expected } of callers) {
      const src = readFileSync(file, "utf8");
      const calls = [...src.matchAll(/handleLegalVerificationUnavailable\(/g)];
      expect(calls.length, file).toBe(expected);
      for (const match of calls) {
        // Разглежда се самото извикване до затварящата скоба на аргументите.
        const tail = src.slice(match.index!, match.index! + 400);
        expect(tail, `${file}: липсва действие за повторен опит`).toMatch(/=>/);
      }
    }
  });

  it("състоянието „заето“ е освободено, преди да се покаже преградата", async () => {
    const { readFileSync } = await import("node:fs");
    const releases: Record<string, string[]> = {
      "src/pages/UploadedContract.tsx": ["setAnalyzing(false)", "setCorrecting(false)"],
      "src/components/UploadContractDialog.tsx": ["setAnalyzing(false)"],
    };
    for (const [file, needles] of Object.entries(releases)) {
      const src = readFileSync(file, "utf8");
      const firstGate = src.indexOf("handleLegalVerificationUnavailable(");
      for (const needle of needles) {
        expect(src.indexOf(needle), `${file}: ${needle}`).toBeGreaterThan(-1);
      }
      expect(src.indexOf(needles[0])).toBeLessThan(firstGate);
    }
    // BuildContract освобождава в `finally`, затова се проверява наличието му.
    const build = readFileSync("src/pages/BuildContract.tsx", "utf8");
    expect(build).toContain("setGenerating(false)");
    expect(build).toContain("setApplyingCorrections(false)");
    // Двойно изпращане при ръчен повторен опит е предотвратено.
    expect(build).toContain("busyRef");
  });

  it("съобщението казва, че няма таксуване и работата е запазена", async () => {
    const { LEGAL_GATE_MESSAGE } = await import("@/lib/legalGateClient");
    expect(LEGAL_GATE_MESSAGE).toMatch(/квота/);
    expect(LEGAL_GATE_MESSAGE).toMatch(/плащан/);
  });
});
