import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const h = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: h.from, functions: { invoke: h.invoke }, rpc: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u-synthetic" } }) }));

import { createResultSaveCoordinator, insertSavedDocumentOnce, type SavedDocumentsClient } from "@/lib/resultSaveCoordinator";
import { readReferenceHandoff, storeReferenceHandoff } from "@/lib/referenceHandoff";
import { ReferencePromptDialog } from "@/components/ReferencePromptDialog";
import { PRELAUNCH_WAITLIST_EVENT } from "@/lib/prelaunchWaitlist";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("resultSaveCoordinator", () => {
  const U = "u-1";
  let seq = 0;
  const ids = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  it("два резултата от една категория остават два отделни записа", async () => {
    const c = createResultSaveCoordinator<object>(ids);
    const insert = vi.fn(async (id: string) => id);
    const a = { title: "A", category: "rent" };
    const b = { title: "B", category: "rent" };
    c.setCurrent(a, U);
    const ida = await c.save(a, U, insert, () => undefined);
    c.setCurrent(b, U);
    const idb = await c.save(b, U, insert, () => undefined);
    expect(ida).not.toBe(idb);
    expect(insert).toHaveBeenCalledTimes(2);
  });
  it("повторен опит след успех е стабилен (без нов запис)", async () => {
    const c = createResultSaveCoordinator<object>(ids);
    const insert = vi.fn(async (id: string) => id);
    const a = {};
    c.setCurrent(a, U);
    const first = await c.save(a, U, insert, () => undefined);
    expect(await c.save(a, U, insert, () => undefined)).toBe(first);
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it("ръчен и автоматичен запис едновременно → една заявка", async () => {
    const c = createResultSaveCoordinator<object>(ids);
    const d = deferred<string>();
    const insert = vi.fn((_id: string) => d.promise);
    const a = {};
    c.setCurrent(a, U);
    const attached: string[] = [];
    const p1 = c.save(a, U, insert, (id) => attached.push(id));
    const p2 = c.save(a, U, insert, (id) => attached.push(id));
    d.resolve(insert.mock.calls[0][0]);
    const id = await p1;
    expect(await p2).toBe(id);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(attached).toEqual([id, id]);
  });
  it("закъснял запис за стар резултат не се прикача към новия", async () => {
    const c = createResultSaveCoordinator<object>(ids);
    const d = deferred<string>();
    const oldR = {};
    const newR = {};
    c.setCurrent(oldR, U);
    const attached: string[] = [];
    const p = c.save(oldR, U, (id) => d.promise.then(() => id), (id) => attached.push(id));
    c.setCurrent(newR, U);
    d.resolve("");
    await p;
    expect(attached).toEqual([]);
    expect(c.savedIdFor(newR, U)).toBeUndefined();
  });
  it("закъсняло завършване за стар собственик не се прикача към новия; собствениците имат различни id", async () => {
    const c = createResultSaveCoordinator<object>(ids);
    const d = deferred<void>();
    const r = {};
    c.setCurrent(r, U);
    const attached: string[] = [];
    const p = c.save(r, U, (id) => d.promise.then(() => id), (id) => attached.push(id));
    c.setCurrent(r, "u-2");
    d.resolve();
    const oldId = await p;
    expect(attached).toEqual([]);
    expect(c.idFor(r, "u-2")).not.toBe(oldId);
    expect(c.savedIdFor(r, "u-2")).toBeUndefined();
  });
  it("неуспешен запис се опитва отново със СЪЩИЯ id", async () => {
    const c = createResultSaveCoordinator<object>(ids);
    const a = {};
    c.setCurrent(a, U);
    const seen: string[] = [];
    await expect(c.save(a, U, async (id) => { seen.push(id); throw new Error("x"); }, () => undefined)).rejects.toThrow();
    const id = await c.save(a, U, async (id2) => { seen.push(id2); return id2; }, () => undefined);
    expect(seen).toEqual([id, id]);
  });
});

describe("insertSavedDocumentOnce — записан ред, изгубен отговор, повторен опит", () => {
  /** Синтетично хранилище с първичен ключ по id; пресъздава 23505. */
  function fakeDb() {
    const rows = new Map<string, Record<string, unknown>>();
    let dropNextResponse = false;
    const client = {
      from: () => ({
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              if (rows.has(row.id as string)) return { data: null, error: { code: "23505" } };
              rows.set(row.id as string, { ...row });
              if (dropNextResponse) { dropNextResponse = false; throw new TypeError("Failed to fetch"); }
              return { data: { id: row.id as string }, error: null };
            },
          }),
        }),
        select: () => ({
          eq: (_c: string, id: string) => ({
            eq: (_c2: string, uid: string) => ({
              maybeSingle: async () => {
                const r = rows.get(id);
                return { data: r && r.user_id === uid ? { id } : null, error: null };
              },
            }),
          }),
        }),
      }),
    } as unknown as SavedDocumentsClient;
    return { rows, client, dropNext: () => { dropNextResponse = true; } };
  }

  it("запис се извършва, отговорът се губи, повторният опит → точно един ред", async () => {
    const db = fakeDb();
    const c = createResultSaveCoordinator<object>();
    const r = { title: "A" };
    c.setCurrent(r, "u-1");
    const attached: string[] = [];
    const ins = (id: string) => insertSavedDocumentOnce(db.client, { id, user_id: "u-1", payload: r });
    db.dropNext();
    await expect(c.save(r, "u-1", ins, (id) => attached.push(id))).rejects.toThrow("Failed to fetch");
    expect(db.rows.size).toBe(1);
    const id = await c.save(r, "u-1", ins, (i) => attached.push(i));
    expect(db.rows.size).toBe(1);
    expect([...db.rows.keys()]).toEqual([id]);
    expect(attached).toEqual([id]);
  });

  it("различни резултати остават различни редове", async () => {
    const db = fakeDb();
    const c = createResultSaveCoordinator<object>();
    const a = { title: "A" }; const b = { title: "A" };
    for (const r of [a, b]) {
      c.setCurrent(r, "u-1");
      await c.save(r, "u-1", (id) => insertSavedDocumentOnce(db.client, { id, user_id: "u-1", payload: r }), () => undefined);
    }
    expect(db.rows.size).toBe(2);
  });

  it("конфликт с чужд ред със същия id → отказ, без обновяване", async () => {
    const db = fakeDb();
    db.rows.set("x", { id: "x", user_id: "other", payload: { keep: 1 } });
    await expect(insertSavedDocumentOnce(db.client, { id: "x", user_id: "u-1", payload: {} })).rejects.toThrow("save_identity_conflict");
    expect(db.rows.get("x")).toEqual({ id: "x", user_id: "other", payload: { keep: 1 } });
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
          <ReferencePromptDialog reference={reference} parentSavedId={null} parentUploadedId={null} onLinked={() => undefined} parentTitle="Синтетичен родител"
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
