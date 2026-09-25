import { describe, expect, it } from "vitest";
import { FUNNEL_REASON_CODES, isKnownReasonCode, normalizeReason } from "@/lib/docFunnel";

// Синтетични стойности. Тестът не печата входовете.
const PII_INPUTS = [
  "Иван Петров Георгиев",
  "Maria Ivanova Consulting",
  "ivan.petrov@example.test",
  "Наемодателят се задължава да предаде апартамента на ул. Витоша",
  "The Lessor shall deliver the premises",
  "8001011234",
  "BG80BNBG96611020345678",
  "dogovor_naem_petrov.pdf",
  "договор_за_наем_Иванов.docx",
  "Грешка при качване: new row violates policy for user Иван",
  "x".repeat(5000),
  "Договор за услуги между Петров ЕООД и Иванова ".repeat(20).slice(0, 79),
  "abc_def_ghi",
  "ivan_petrov",
];

describe("normalizeReason — затворен списък", () => {
  it("лични данни, фрагменти, номера, имена на файлове → само затворени кодове", () => {
    for (const input of PII_INPUTS) {
      const out = normalizeReason(input);
      expect(isKnownReasonCode(out)).toBe(true);
      expect(out).toBe("unknown");
    }
  });
  it("всеки документиран код минава непроменен (и с главни букви)", () => {
    for (const c of FUNNEL_REASON_CODES) {
      expect(normalizeReason(c)).toBe(c);
      expect(normalizeReason(c.toUpperCase())).toBe(c);
    }
    expect(normalizeReason("http_503")).toBe("http_503");
  });
  it("безопасните класификации остават", () => {
    expect(normalizeReason("Failed to fetch")).toBe("network");
    expect(normalizeReason("Edge Function returned a non-2xx status code 502")).toBe("http_502");
    expect(normalizeReason("ЕГН 8001011234 status 500")).toBe("http_500");
    expect(normalizeReason("Сума 450 лв")).toBe("unknown");
  });
});
