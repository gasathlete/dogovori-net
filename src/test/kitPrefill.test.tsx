import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QuestionField } from "@/components/wizard/QuestionField";
import { KitPrefillBridge } from "@/components/wizard/KitPrefillBridge";
import { adaptGraphToWizardQuestions } from "@/data/questionGraphs/adapter";
import { getQuestionGraph } from "@/data/questionGraphs/dogovor-za-naem-na-zhilishte";
import {
  clearPreparation, getPreparation, setPreparationAnswers,
} from "@/lib/taskPreparation/preparationStore";
import {
  RENTAL_KIT_ID, RENTAL_PREPARATION_GRAPH, isUnsupportedProperty, planRentalDocuments, pruneRentalAnswers,
} from "@/lib/taskPreparation/rentalPreparation";
import {
  LEASE_SLUG, RECEIPT_SLUG, RENTAL_FIELD_MAPS, buildRentalPrefill, planPrefill,
} from "@/lib/taskPreparation/rentalFieldMap";

const PREP = {
  landlord: "Физическо лице", tenant: "Юридическо лице", property_type: "apartment",
  property_address: "ул. Тестова 1", furniture_included: "full", term_type: "fixed",
  start_date: "2026-11-01", end_date: "2027-10-31", monthly_rent: 600, payment_day: 5,
  payment_method: "cash", has_deposit: true, deposit_amount: 600,
};

function Harness({ slug, initial = {} }: { slug: string; initial?: Record<string, string> }) {
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const graph = getQuestionGraph(slug)!;
  const groups = adaptGraphToWizardQuestions(graph);
  const onAns = (id: string, v: string) => setAnswers((p) => ({ ...p, [id]: v }));
  return (
    <MemoryRouter>
      <KitPrefillBridge slug={slug} answers={answers} onApply={(p) => setAnswers((a) => ({ ...a, ...p }))} />
      {groups.map((q) => (
        <QuestionField key={q.id} q={q} value={answers[q.id] ?? ""} onChange={(v) => onAns(q.id, v)} answers={answers} onAnswerChange={onAns} />
      ))}
      <output data-testid="state">{JSON.stringify(answers)}</output>
    </MemoryRouter>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent || "{}");

beforeEach(() => clearPreparation());

describe("explicit field mappings", () => {
  it("map only to questions that exist in the receiving graphs", () => {
    for (const [slug, maps] of Object.entries(RENTAL_FIELD_MAPS)) {
      const g = getQuestionGraph(slug)!;
      expect(g).toBeTruthy();
      for (const m of maps) {
        expect(g.questions.some((q) => q.id === m.to)).toBe(true);
        expect(RENTAL_PREPARATION_GRAPH.questions.some((q) => q.id === m.from)).toBe(true);
      }
    }
  });

  it("converts to the receiving questionnaire's labels and party shapes", () => {
    const lease = buildRentalPrefill(LEASE_SLUG, PREP);
    expect(lease).toMatchObject({ landlord: "Физическо лице", property_type: "Апартамент", furniture_included: "Напълно",
      term_type: "Срочен (с конкретна крайна дата)", payment_method: "В брой срещу разписка", has_deposit: "Да", monthly_rent: "600", payment_day: "5" });
    const receipt = buildRentalPrefill(RECEIPT_SLUG, PREP);
    expect(receipt).toEqual({ landlord: "Физическо лице", tenant: "Юридическо лице", property_address: "ул. Тестова 1", payment_method: "В брой" });
    expect(buildRentalPrefill("opis-na-inventar-kam-dogovor-za-naem", PREP)).toEqual({});
  });

  it("party questions in preparation use the PartyBlock type values, not names", () => {
    const q = RENTAL_PREPARATION_GRAPH.questions.find((x) => x.id === "landlord")!;
    expect(q.field_type).toBe("select");
    expect(q.options?.map((o) => o.value)).toEqual(["Юридическо лице", "Физическо лице", "ЕТ / Самоосигуряващо се"]);
  });

  it("includes canonical term type, end date and payment day; prunes end date for indefinite", () => {
    const ids = RENTAL_PREPARATION_GRAPH.questions.map((q) => q.id);
    expect(ids).toEqual(expect.arrayContaining(["term_type", "end_date", "payment_day"]));
    expect(ids).not.toContain("include_nap_declaration");
    expect(pruneRentalAnswers({ ...PREP, term_type: "indefinite" }).end_date).toBeUndefined();
    expect(buildRentalPrefill(LEASE_SLUG, pruneRentalAnswers({ ...PREP, term_type: "indefinite" })).end_date).toBeUndefined();
  });
});

describe("receiving questionnaire renders the prefilled values", () => {
  it("lease wizard shows party form selected and address filled", () => {
    setPreparationAnswers(RENTAL_KIT_ID, PREP);
    render(<Harness slug={LEASE_SLUG} />);
    expect(state().property_address).toBe("ул. Тестова 1");
    expect(screen.getByDisplayValue("ул. Тестова 1")).toBeTruthy();
    const pressed = screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent);
    expect(pressed).toEqual(expect.arrayContaining(["Физическо лице", "Юридическо лице"]));
    expect(screen.getByTestId("kit-prefill").textContent).toMatch(/Предварително попълнени данни/);
  });

  it("does not overwrite existing document edits; prompts on revision change", () => {
    setPreparationAnswers(RENTAL_KIT_ID, PREP);
    render(<Harness slug={RECEIPT_SLUG} initial={{ property_address: "моя редакция" }} />);
    expect(state().property_address).toBe("моя редакция");
    expect(state().landlord).toBe("Физическо лице");
    fireEvent.click(screen.getByText("Запази моите"));
    // Нова ревизия: непроменено поле се обновява, редактираното — само с потвърждение.
    act(() => setPreparationAnswers(RENTAL_KIT_ID, { ...PREP, landlord: "ЕТ / Самоосигуряващо се", property_address: "ул. Нова 2" }));
    expect(state().landlord).toBe("ЕТ / Самоосигуряващо се");
    expect(state().property_address).toBe("моя редакция");
    fireEvent.click(screen.getByText("Замени с данните от подготовката"));
    expect(state().property_address).toBe("ул. Нова 2");
  });

  it("clearing removes the preparation context and the notice", () => {
    setPreparationAnswers(RENTAL_KIT_ID, PREP);
    render(<Harness slug={LEASE_SLUG} />);
    fireEvent.click(screen.getByText("Изчисти данните от подготовката"));
    expect(getPreparation()).toBeNull();
    expect(screen.queryByTestId("kit-prefill")).toBeNull();
  });
});

describe("plan and document list", () => {
  it("planPrefill splits untouched vs edited fields", () => {
    expect(planPrefill({ a: "1", b: "2", c: "3" }, { a: "", b: "old", c: "user" }, { b: "old" }))
      .toEqual({ apply: { a: "1", b: "2" }, conflicts: { c: "3" } });
  });

  it("unanswered conditions are pending, not 'not needed'; NAP not assessed; unsupported property flagged", () => {
    const docs = planRentalDocuments({}, new Map());
    expect(docs.find((d) => d.docName === "Опис на инвентар към договор за наем")!.pending).toBe(true);
    expect(docs.find((d) => d.docName === "Разписка за получена сума (наем/депозит)")!.pending).toBe(true);
    const nap = docs.find((d) => d.docName === "Декларация за регистрация на наем пред НАП")!;
    expect(nap.notAssessed).toBe(true);
    expect(nap.included).toBe(false);
    expect(isUnsupportedProperty({ property_type: "commercial" })).toBe(true);
    expect(isUnsupportedProperty({ property_type: "room" })).toBe(true);
    expect(isUnsupportedProperty({ property_type: "house" })).toBe(false);
  });

  it("store keeps answers across remounts and bumps revision only on change", () => {
    setPreparationAnswers(RENTAL_KIT_ID, { a: 1 });
    const r = getPreparation()!.revision;
    setPreparationAnswers(RENTAL_KIT_ID, { a: 1 });
    expect(getPreparation()!.revision).toBe(r);
    setPreparationAnswers(RENTAL_KIT_ID, { a: 2 });
    expect(getPreparation()!.revision).toBe(r + 1);
  });

  it("no browser storage, URL/history state or network in the prefill path", () => {
    const src = ["src/lib/taskPreparation/preparationStore.ts", "src/lib/taskPreparation/rentalFieldMap.ts", "src/components/wizard/KitPrefillBridge.tsx"]
      .map((f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")).join("\n");
    expect(src).not.toMatch(/localStorage|sessionStorage|history\.|pushState|searchParams|supabase|functions\.invoke|checkout|stripe|track/i);
  });
});
