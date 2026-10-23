import { describe, expect, it } from "vitest";
import { decideAction, classifyHttp, MAX_ATTEMPTS } from "@/lib/templateRegen/batchState";
import { classifyDocType, checklistFor } from "@/lib/templateRegen/checklists";
import { checkDraftCandidate } from "@/lib/templateRegen/candidateValidation";

const SHA = "a".repeat(64);

describe("възобновяване", () => {
  it("преизползва само валидиран кандидат за същия хеш", () => {
    expect(decideAction({ baseSourceSha256: SHA, status: "validated_generated_pending_legal_review", attempts: 1 }, SHA, false)).toBe("skip_validated");
    expect(decideAction({ baseSourceSha256: "b".repeat(64), status: "validated_generated_pending_legal_review", attempts: 1 }, SHA, false)).toBe("generate");
  });
  it("неуспешен не се смята за готов и се повтаря само изрично и ограничено", () => {
    const failed = { baseSourceSha256: SHA, status: "validation_failed", attempts: 1 };
    expect(decideAction(failed, SHA, false)).toBe("skip_failed");
    expect(decideAction(failed, SHA, true)).toBe("generate");
    expect(decideAction({ ...failed, attempts: MAX_ATTEMPTS }, SHA, true)).toBe("skip_attempts_exhausted");
    expect(decideAction("raw text", SHA, false)).toBe("generate");
  });
  it("402 спира пакета, 429/5xx се повтарят, 400 е неуспех", () => {
    expect(classifyHttp(402)).toBe("stop_all");
    expect(classifyHttp(429)).toBe("retry");
    expect(classifyHttp(503)).toBe("retry");
    expect(classifyHttp(400)).toBe("fail");
  });
});

describe("категорийни чеклисти", () => {
  it("не налага договорен скелет на пълномощно, декларация и уведомление", () => {
    expect(classifyDocType("palnomoshtno-za-prodazhba-na-avtomobil")).toBe("power_of_attorney");
    expect(classifyDocType("deklaratsiya-za-lipsa-na-publichni-zadalzheniya")).toBe("declaration");
    expect(classifyDocType("predizvestie-za-prekratyavane-na-naem")).toBe("notice");
    expect(checklistFor("deklaratsiya-x").checks.join(" ")).not.toContain("Съществени елементи");
  });
});

describe("проверка на кандидат", () => {
  const base = { unverifiedLegalBases: [], unresolvedFacts: [], changes: [] };
  it("отхвърля null, непрочетено немаркирано основание и decisive поле извън текста", () => {
    const r = checkDraftCandidate({ ...base, scenarios: [{ id: "a", label: "A", text: "Съгласно чл. 999 ЗЗД [ИМЕ] null", decisiveFields: ["ЛИПСВА"] }] }, []);
    expect(r.errors.some((e) => e.startsWith("bad_token"))).toBe(true);
    expect(r.errors.some((e) => e.startsWith("unflagged_unverified_citation"))).toBe(true);
    expect(r.errors.some((e) => e.startsWith("decisive_field_not_in_text"))).toBe(true);
  });
  it("приема основание с прочетен откъс", () => {
    const ex = [{ law: "ЗЗД", article: "238", url: "u", fetchedOn: "d", fetchedBy: "agent" as const, text: "t", sha256: "s" }];
    expect(checkDraftCandidate({ ...base, scenarios: [{ id: "a", label: "A", text: "По чл. 238 ЗЗД, [ИМЕ]", decisiveFields: ["ИМЕ"] }] }, ex).errors).toEqual([]);
  });
});
