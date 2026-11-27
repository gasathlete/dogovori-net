import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { allTemplates } from "@/lib/templateIndex";
import { DOCUMENT_KITS } from "@/data/documentKits";
import { EVERYDAY_TASKS } from "@/data/everydayTasks";
import { SECTOR_PACKAGES } from "@/data/sectorPackages";
import {
  ACCEPTED_STATIC_ASSETS, KIT_GUIDES, buildCatalogMatrix, isSaleReady, legalReviewFor, type MatrixEntry,
} from "@/lib/catalogMatrix";
import { CHECKLIST_PREPARATIONS, planChecklist } from "@/lib/taskPreparation/checklistPreparation";
import KitChecklistPreparation from "@/pages/KitChecklistPreparation";

vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/SeoFooter", () => ({ SeoFooter: () => null }));
vi.mock("@/lib/metrics", () => ({ trackMetric: vi.fn() }));

const slugByName = new Map(allTemplates().map((t) => [t.doc.name, t.slug]));
const slugs = new Set(slugByName.values());
const matrix = buildCatalogMatrix(slugByName);
const sha = "a".repeat(64);
const entry: MatrixEntry = { collectionType: "kit", collectionId: "x", stageIndex: 0, stageLabel: "s", title: "t", docName: "d", slug: "dogovor-za-naem-na-zhilishte", availability: "available", optional: false };

describe("канонична матрица пакети/комплекти", () => {
  it("всеки наличен запис сочи реален slug, а липсващите нямат връзка", () => {
    expect(matrix.length).toBeGreaterThan(40);
    for (const e of matrix) {
      if (e.availability === "available") expect(slugs.has(e.slug!), e.title).toBe(true);
      else expect(e.slug).toBeNull();
    }
  });

  it("покрива 4-те пакета и 7-те водещи комплекта без дублирани документи в колекция", () => {
    expect(new Set(matrix.filter((e) => e.collectionType === "package").map((e) => e.collectionId)).size).toBe(SECTOR_PACKAGES.length);
    const kits = new Set(matrix.filter((e) => e.collectionType === "kit").map((e) => e.collectionId));
    expect(kits.size).toBe(7);
    for (const id of kits) {
      const names = matrix.filter((e) => e.collectionId === id && e.docName).map((e) => e.docName);
      expect(new Set(names).size).toBe(names.length);
      const kit = DOCUMENT_KITS.find((k) => k.id === id)!;
      expect(new Set(names)).toEqual(new Set(kit.items.map((i) => i.docName)));
      expect(KIT_GUIDES[id]).toBeDefined();
    }
  });

  it("юридическото одобрение е fail-closed и вързано за точна версия", () => {
    expect(ACCEPTED_STATIC_ASSETS).toHaveLength(0);
    expect(matrix.some((e) => isSaleReady(e))).toBe(false);
    const ok = { slug: entry.slug!, version: "v2", contentSha256: sha, legalAcceptanceRef: "LR-1", legalAcceptedVersion: "v2" };
    expect(legalReviewFor(entry, ok)).toBe("version_accepted");
    expect(isSaleReady(entry, ok)).toBe(false); // без проверена сървърна доставка
    expect(isSaleReady(entry, ok, true)).toBe(true);
    expect(legalReviewFor(entry, { ...ok, legalAcceptedVersion: "v1" })).toBe("not_confirmed_for_version");
    expect(legalReviewFor(entry, { ...ok, contentSha256: "x" })).toBe("not_confirmed_for_version");
    expect(legalReviewFor(entry, { ...ok, revokedAt: "2026-10-13" })).toBe("not_confirmed_for_version");
    expect(legalReviewFor(entry, { ...ok, legalAcceptanceRef: " " })).toBe("not_confirmed_for_version");
    expect(legalReviewFor({ ...entry, availability: "in_preparation", slug: null }, ok)).toBe("not_confirmed_for_version");
  });
});

describe("подготовка „Какво ми трябва?“", () => {
  it("всяко правило сочи документ от комплекта с реален шаблон и задачите водят до съществуващи подготовки", () => {
    for (const def of Object.values(CHECKLIST_PREPARATIONS)) {
      const kit = DOCUMENT_KITS.find((k) => k.id === def.kitId)!;
      for (const r of def.rules) {
        expect(kit.items.some((i) => i.docName === r.docName), r.docName).toBe(true);
        expect(slugByName.has(r.docName), r.docName).toBe(true);
        if (r.when) expect(def.questions.some((q) => q.id === r.when!.question)).toBe(true);
      }
    }
    for (const t of EVERYDAY_TASKS.filter((t) => t.preparationPath && t.kitId !== "naem-zhilishte")) {
      expect(CHECKLIST_PREPARATIONS[t.kitId]).toBeDefined();
    }
  });

  it("„Не е преценено“ не става „не е нужен“, а декларациите искат проверка", () => {
    const def = CHECKLIST_PREPARATIONS["pokupko-prodajba-imot"];
    const blank = planChecklist(def, {});
    expect(blank.find((i) => i.docName.startsWith("Договор за капаро"))!.decision).toBe("not_assessed");
    expect(blank.filter((i) => i.decision === "not_needed")).toHaveLength(0);
    expect(blank.find((i) => i.docName === "Декларация по чл. 264 ДОПК")!.decision).toBe("check_applicability");
    const changed = planChecklist(def, { earnest: "no", representative: "yes" });
    expect(changed.find((i) => i.docName.startsWith("Договор за капаро"))!.decision).toBe("not_needed");
    expect(changed.find((i) => i.docName.startsWith("Подробно пълномощно"))!.decision).toBe("needed");
  });

  it("страницата обновява списъка, не пише в localStorage и без кутия за покупка на детайла", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem");
    render(<HelmetProvider><MemoryRouter initialEntries={["/komplekti/nasledstvo-paket/podgotovka"]}><Routes><Route path="/komplekti/:slug/podgotovka" element={<KitChecklistPreparation />} /></Routes></MemoryRouter></HelmetProvider>);
    const item = () => screen.getByText("Декларация за отказ от наследство").closest("li")!;
    expect(item().getAttribute("data-decision")).toBe("not_assessed");
    const group = screen.getByText("Решили ли сте да се откажете от наследството?").closest("fieldset")!;
    fireEvent.click(group.querySelector("button")!);
    expect(item().getAttribute("data-decision")).toBe("needed");
    expect(screen.getByRole("link", { name: /Декларация за отказ от наследство/ }).getAttribute("href")).toMatch(/^\/shablon\//);
    expect(screen.queryByTestId("launch-purchase-banner")).toBeNull();
    expect(spy.mock.calls.filter(([k]) => !String(k).startsWith("sb-") && !/consent|theme|locale/i.test(String(k)))).toHaveLength(0);
    spy.mockRestore();
  });

  it("непознат комплект се връща към страницата на комплекта", () => {
    render(<HelmetProvider><MemoryRouter initialEntries={["/komplekti/nepoznat/podgotovka"]}><Routes><Route path="/komplekti/:slug/podgotovka" element={<KitChecklistPreparation />} /><Route path="/komplekti/:slug" element={<p>Комплект</p>} /></Routes></MemoryRouter></HelmetProvider>);
    expect(screen.getByText("Комплект")).toBeInTheDocument();
  });
});
