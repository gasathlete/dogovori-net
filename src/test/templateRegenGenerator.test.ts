import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { parseResponsesStream } from "@/lib/templateRegen/sse";
import { validateDraftOutput, validateContentOutput } from "@/lib/templateRegen/outputValidation";
import { parseCitations, selectEvidence, type ExcerptStore } from "@/lib/templateRegen/evidence";

const enc = new TextEncoder();
async function* chunks(...parts: string[]) { for (const p of parts) yield enc.encode(p); }
const ev = (o: object) => `data: ${JSON.stringify(o)}\n\n`;

describe("SSE", () => {
  it("успех само при response.completed, с flush на последния ред без \\n", async () => {
    const r = await parseResponsesStream(chunks(ev({ type: "response.output_text.delta", delta: "{\"a\"" }), `data: ${JSON.stringify({ type: "response.completed", response: { id: "r1", output: [{ type: "message", content: [{ type: "output_text", text: "{\"a\":1}" }] }] } })}`));
    expect(r).toEqual({ ok: true, text: "{\"a\":1}", responseId: "r1" });
  });
  it("прекъснат поток, failed, incomplete и error не са успех", async () => {
    expect((await parseResponsesStream(chunks(ev({ type: "response.output_text.delta", delta: "част" })))).ok).toBe(false);
    for (const type of ["response.failed", "response.incomplete", "error"]) {
      const r = await parseResponsesStream(chunks(ev({ type: "response.output_text.delta", delta: "x" }), ev({ type }), ev({ type: "response.completed", response: {} })));
      expect(r.ok).toBe(false);
    }
  });
  it("празен completed е неуспех", async () => {
    expect(await parseResponsesStream(chunks(ev({ type: "response.completed", response: { output: [] } })))).toMatchObject({ ok: false, kind: "empty" });
  });
});

describe("валидация на изхода", () => {
  const orig = "x".repeat(2000);
  it("отхвърля невалиден JSON, двойно кодиран текст, отрязан и небалансиран", () => {
    expect(validateDraftOutput("{не", orig).ok).toBe(false);
    const mk = (text: string) => JSON.stringify({ scenarios: [{ id: "a", label: "A", text, decisiveFields: [] }], unverifiedLegalBases: [], unresolvedFacts: [], changes: [] });
    expect(validateDraftOutput(mk('{"text": "' + "y".repeat(600) + '"}'), orig).ok).toBe(false);
    expect(validateDraftOutput(mk("кратко"), orig).ok).toBe(false);
    expect(validateDraftOutput(mk("[" + "y".repeat(600)), orig).ok).toBe(false);
    expect(validateDraftOutput(mk("Текст [ПОЛЕ] " + "y".repeat(600)), orig).ok).toBe(true);
  });
  it("пояснения: празни раздели са невалидни", () => {
    expect(validateContentOutput(JSON.stringify({ content: { intro: "", usageCases: [], requirements: [], mistakes: [], faq: [] }, unverifiedLegalBases: [], changes: [] })).ok).toBe(false);
  });
});

describe("доказателства", () => {
  const store: ExcerptStore = JSON.parse(fs.readFileSync("src/lib/templateRegen/data/legal-excerpts.json", "utf8"));
  it("откъсите съдържат реален текст на члена, не само номер", () => {
    expect(store.laws["ЗЗД"].articles["238"]).toContain("уговорен на ден");
    const s = selectEvidence("predizvestie-za-prekratyavane-na-naem", "по чл. 238 ЗЗД", store);
    expect(s.supported).toBe(true);
    expect(s.excerpts.find((e) => e.article === "238")?.text).toContain("един месец");
  });
  it("непокрит закон остава непроменено позоваване; непокрита област е evidence_required", () => {
    expect(parseCitations("по чл. 13, ал. 6 ЗТРРЮЛНЦ")[0]).toMatchObject({ law: "ЗТРРЮЛНЦ", article: "13" });
    const s = selectEvidence("notarialen-akt-za-imot", "чл. 18 ЗЗД", store);
    expect(s.supported).toBe(false);
    expect(s.reason).toBe("evidence_gap_domain");
  });
});
