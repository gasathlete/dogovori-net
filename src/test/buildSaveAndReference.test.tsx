import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const h = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: h.from, functions: { invoke: h.invoke }, rpc: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u-synthetic" } }) }));

import { createResultSaveCoordinator } from "@/lib/resultSaveCoordinator";
import { readReferenceHandoff, storeReferenceHandoff } from "@/lib/referenceHandoff";
import { ReferencePromptDialog } from "@/components/ReferencePromptDialog";
import { PRELAUNCH_WAITLIST_EVENT } from "@/lib/prelaunchWaitlist";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("resultSaveCoordinator", () => {
  it("два резултата от една категория остават два отделни записа", async () => {
    const c = createResultSaveCoordinator<object>();
    let n = 0;
    const insert = vi.fn(async () => `id-${++n}`);
    const a = { title: "A", category: "rent" };
    const b = { title: "B", category: "rent" };
    c.setCurrent(a);
    const ida = await c.save(a, insert, () => undefined);
    c.setCurrent(b);
    const idb = await c.save(b, insert, () => undefined);
    expect(ida).not.toBe(idb);
    expect(insert).toHaveBeenCalledTimes(2);
  });
  it("повторен опит за същия резултат е стабилен (без нов запис)", async () => {
    const c = createResultSaveCoordinator<object>();
    const insert = vi.fn(async () => "id-1");
    const a = {};
    c.setCurrent(a);
    expect(await c.save(a, insert, () => undefined)).toBe("id-1");
    expect(await c.save(a, insert, () => undefined)).toBe("id-1");
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it("ръчен и автоматичен запис едновременно → една заявка", async () => {
    const c = createResultSaveCoordinator<object>();
    const d = deferred<string>();
    const insert = vi.fn(() => d.promise);
    const a = {};
    c.setCurrent(a);
    const attached: string[] = [];
    const p1 = c.save(a, insert, (id) => attached.push(id));
    const p2 = c.save(a, insert, (id) => attached.push(id));
    d.resolve("id-1");
    expect(await p1).toBe("id-1");
    expect(await p2).toBe("id-1");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(attached).toEqual(["id-1", "id-1"]);
  });
  it("закъснял запис за стар резултат не се прикача към новия", async () => {
    const c = createResultSaveCoordinator<object>();
    const d = deferred<string>();
    const oldR = {};
    const newR = {};
    c.setCurrent(oldR);
    const attached: string[] = [];
    const p = c.save(oldR, () => d.promise, (id) => attached.push(id));
    c.setCurrent(newR);
    d.resolve("old-id");
    await p;
    expect(attached).toEqual([]);
    expect(c.savedIdFor(newR)).toBeUndefined();
  });
  it("неуспешен запис може да се опита отново", async () => {
    const c = createResultSaveCoordinator<object>();
    const a = {};
    c.setCurrent(a);
    await expect(c.save(a, async () => { throw new Error("x"); }, () => undefined)).rejects.toThrow();
    expect(await c.save(a, async () => "id-2", () => undefined)).toBe("id-2");
  });
});

describe("BuildContract не преизползва запис по категория", () => {
  it("кодът не търси последен saved_documents по source_id за презапис", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/pages/BuildContract.tsx", "utf8");
    expect(src).not.toMatch(/\.eq\("source_id"/);
  });
});

describe("referenceHandoff", () => {
  beforeEach(() => sessionStorage.clear());
  it("записва и чете локално; невалиден ключ → null", () => {
    const t = storeReferenceHandoff({ parentTitle: "Синтетичен родител", partiesA: ["Страна А"], subject: "Предмет" })!;
    expect(readReferenceHandoff(t)).toMatchObject({ parentTitle: "Синтетичен родител", partiesA: ["Страна А"], subject: "Предмет" });
    expect(readReferenceHandoff("../x")).toBeNull();
    expect(readReferenceHandoff(null)).toBeNull();
  });
});

describe("ReferencePromptDialog в предварителен режим", () => {
  it("„изготви“ отваря заявката, не навигира и не слага контекст в URL", async () => {
    const events: string[] = [];
    const on = (e: Event) => events.push((e as CustomEvent<{ feature: string }>).detail.feature);
    window.addEventListener(PRELAUNCH_WAITLIST_EVENT, on);
    let path = "";
    function Loc() { path = useLocation().pathname + useLocation().search; return null; }
    const reference = { type: "appendix", number: 1, documentTypeId: "annex", displayLabel: "Приложение № 1" } as never;
    render(
      <MemoryRouter initialEntries={["/doc"]}>
        <Routes><Route path="*" element={<><Loc />
          <ReferencePromptDialog reference={reference} parentTitle="Синтетичен родител"
            parentContext={{ partiesA: ["Страна А"], subject: "Предмет" }} onClose={() => undefined} />
        </>} /></Routes>
      </MemoryRouter>,
    );
    const btns = screen.getAllByRole("button").filter((b) => /изготв|генерир|създа/i.test(b.textContent ?? ""));
    expect(btns.length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(btns[0]); });
    window.removeEventListener(PRELAUNCH_WAITLIST_EVENT, on);
    expect(events).toEqual(["document_generation"]);
    expect(path).toBe("/doc");
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.from).not.toHaveBeenCalled();
  });
});
