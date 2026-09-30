import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CATALOG } from "@/data/catalog";
import { getKit, DOCUMENT_KITS } from "@/data/documentKits";
import { EVERYDAY_TASKS } from "@/data/everydayTasks";
import { dogovorZaNaemGraph } from "@/data/questionGraphs/dogovor-za-naem-na-zhilishte";
import {
  RENTAL_PREPARATION_GRAPH, RENTAL_INITIAL_ANSWERS, planRentalDocuments,
  pruneRentalAnswers, resolveRentalPreparation, FACTS_BY_DOCUMENT,
} from "@/lib/taskPreparation/rentalPreparation";

const names = new Set(CATALOG.flatMap((c) => c.documents.map((d) => d.name)));
const slugs = new Map([...names].map((n, i) => [n, `slug-${i}`]));
const plan = (a: Record<string, unknown>) => planRentalDocuments(pruneRentalAnswers(a), slugs);
const find = (a: Record<string, unknown>, n: string) => plan(a).find((d) => d.docName === n)!;

describe("task-first furnished rental", () => {
  it("reuses canonical lease-graph questions without changing labels", () => {
    for (const q of RENTAL_PREPARATION_GRAPH.questions) {
      const canon = dogovorZaNaemGraph.questions.find((x) => x.id === q.id);
      if (canon) expect(q.label).toBe(canon.label);
    }
  });

  it("covers every kit item exactly once and only canonical catalog names are linked", () => {
    const docs = plan({ ...RENTAL_INITIAL_ANSWERS });
    const kitNames = getKit("naem-zhilishte")!.items.map((i) => i.docName);
    for (const n of kitNames) expect(docs.filter((d) => d.docName === n)).toHaveLength(1);
    for (const d of docs) {
      if (d.status === "available") expect(names.has(d.docName)).toBe(true);
      else expect(d.slug).toBeUndefined();
    }
    expect(docs.some((d) => d.status === "planned" && !d.included)).toBe(true);
  });

  it("shared answers drive several documents; changing one answer propagates", () => {
    const base = { ...RENTAL_INITIAL_ANSWERS, has_deposit: true, deposit_amount: 800, payment_method: "bank_transfer" };
    expect(find(base, "Разписка за получена сума (наем/депозит)").included).toBe(true);
    expect(find({ ...base, has_deposit: false }, "Разписка за получена сума (наем/депозит)").included).toBe(false);
    expect(find({ ...base, has_deposit: false, payment_method: "cash" }, "Разписка за получена сума (наем/депозит)").included).toBe(true);
    expect(find(base, "Опис на инвентар към договор за наем").included).toBe(true);
    expect(find({ ...base, furniture_included: "none" }, "Опис на инвентар към договор за наем").included).toBe(false);
    expect(FACTS_BY_DOCUMENT["Договор за наем на жилище"]).toContain("landlord");
    expect(FACTS_BY_DOCUMENT["Приемно-предавателен протокол"]).toContain("landlord");
  });

  it("conditional path: deposit amount only asked and kept with a deposit", () => {
    const withDep = resolveRentalPreparation({ has_deposit: true });
    expect(withDep.active.some((q) => q.id === "deposit_amount")).toBe(true);
    expect(withDep.missingRequired).toContain("deposit_amount");
    const noDep = resolveRentalPreparation({ has_deposit: false, deposit_amount: 500 });
    expect(noDep.active.some((q) => q.id === "deposit_amount")).toBe(false);
    expect(pruneRentalAnswers({ has_deposit: false, deposit_amount: 500 }).deposit_amount).toBeUndefined();
  });

  it("everyday tasks point at existing kits", () => {
    const ids = new Set(DOCUMENT_KITS.map((k) => k.id));
    for (const t of EVERYDAY_TASKS) expect(ids.has(t.kitId)).toBe(true);
  });

  it("preserves gates: no checkout, AI, persistence or PII analytics in the flow", () => {
    const src = readFileSync("src/pages/RentalPreparation.tsx", "utf8") + readFileSync("src/lib/taskPreparation/rentalPreparation.ts", "utf8");
    expect(src).not.toMatch(/checkout|stripe|functions\.invoke|localStorage|sessionStorage|supabase/i);
    expect(src).toMatch(/LaunchPurchaseBanner/);
    expect(src).toMatch(/trackFunnelEvent\("task_preparation_step", \{ task: "furnished-rental", step: n \}\)/);
  });
});
