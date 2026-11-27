import { describe, expect, it } from "vitest";
import { opaqueOpScope } from "@/lib/opSession";

const payload = {
  contract: { title: "Договор", party: "Иван Петров" },
  feedback: "Иван Петров да отпадне",
  answers: { name: "Мария Георгиева" },
  userConfirmed: false,
};

describe("opaqueOpScope", () => {
  it("не съдържа суров потребителски текст в ключа", async () => {
    const scope = await opaqueOpScope("refine_contract", payload);
    expect(scope.startsWith("refine_contract:")).toBe(true);
    expect(scope).not.toContain("Иван");
    expect(scope).not.toContain("Мария");
    expect(scope).not.toContain("отпадне");
  });

  it("същият товар дава същия обхват (запазва се при повторение)", async () => {
    const a = await opaqueOpScope("refine_contract", payload);
    const b = await opaqueOpScope("refine_contract", { ...payload });
    expect(a).toBe(b);
  });

  it("всяка промяна в товара дава различен обхват", async () => {
    const base = await opaqueOpScope("refine_contract", payload);
    const variants = await Promise.all([
      opaqueOpScope("refine_contract", { ...payload, feedback: "друго" }),
      opaqueOpScope("refine_contract", { ...payload, answers: { name: "Друг" } }),
      opaqueOpScope("refine_contract", { ...payload, userConfirmed: true }),
      opaqueOpScope("refine_contract", {
        ...payload,
        contract: { ...payload.contract, title: "Анекс" },
      }),
    ]);
    for (const v of variants) expect(v).not.toBe(base);
  });
});
