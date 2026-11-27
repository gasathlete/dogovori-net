/* eslint-disable @typescript-eslint/no-explicit-any -- фалшив клиент в тест */
/**
 * Q2f — DocumentPane: закъснели зареждания/записи и оптимистично заключване по
 * версия (id + updated_at). Записът никога не се обявява за успешен, ако
 * документът е бил променен другаде.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    info: (...a: unknown[]) => toastInfo(...a),
  },
}));

// Оркестрацията при отворен запис на съдържание; затвореното състояние е в
// savedDocumentWriteGuard.test.tsx.
vi.mock("@/lib/savedDocumentWriteGuard", async (orig) => ({
  ...(await orig<typeof import("@/lib/savedDocumentWriteGuard")>()),
  canWriteSavedDocumentContent: () => true,
}));

const setDirty = vi.fn();
vi.mock("@/hooks/useConsoleStore", () => ({
  useConsoleStore: () => ({ setDirty }),
}));
vi.mock("@/components/console/AskDogovaryAIButton", () => ({
  AskDogovaryAIButton: () => <button type="button">Ask DogovaryAI</button>,
}));

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const loads: Array<{ id: string; d: Deferred<any> }> = [];
const saves: Array<{ id: string; updatedAt: string; title: string; d: Deferred<any> }> = [];

vi.mock("@/lib/savedDocumentContent", async (original) => ({
  ...(await original<typeof import("@/lib/savedDocumentContent")>()),
  writeSavedDocumentContent: async (body: Record<string, unknown>) => {
    const d = deferred<any>();
    saves.push({ id: String(body.id), updatedAt: String(body.expected_updated_at), title: String(body.title), d });
    const result = await d.promise;
    if (!result.data) {
      const { SavedContentWriteError } = await import("@/lib/savedDocumentContent");
      throw new SavedContentWriteError("revision_conflict");
    }
    return result.data;
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from() {
      const state: any = { id: "", updatedAt: "", values: null, isUpdate: false };
      const api: any = {
        select: () => api,
        update: (v: any) => { state.isUpdate = true; state.values = v; return api; },
        eq: (col: string, val: string) => {
          if (col === "id") state.id = val;
          if (col === "updated_at") state.updatedAt = val;
          return api;
        },
        maybeSingle: () => {
          if (state.isUpdate) {
            const d = deferred<any>();
            saves.push({ id: state.id, updatedAt: state.updatedAt, title: state.values?.title, d });
            return d.promise;
          }
          const d = deferred<any>();
          loads.push({ id: state.id, d });
          return d.promise;
        },
      };
      return api;
    },
  },
}));

import { DocumentPane } from "@/components/console/panes/DocumentPane";

const DOC_A = "aaaa1111-1111-4111-8111-111111111111";
const DOC_B = "bbbb2222-2222-4222-9222-222222222222";

function row(id: string, over: Partial<any> = {}) {
  return {
    id,
    title: id === DOC_A ? "Документ А" : "Документ Б",
    kind: "contract",
    payload: { sections: [{ heading: "Раздел", body: "тяло" }] },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  loads.length = 0;
  saves.length = 0;
  [toastSuccess, toastError, toastInfo, setDirty].forEach((m) => m.mockClear());
});
afterEach(() => cleanup());

async function renderLoaded(id = DOC_A) {
  const view = render(<DocumentPane documentId={id} tabId="tab-1" />);
  await waitFor(() => expect(loads.length).toBe(1));
  loads[0].d.resolve({ data: row(id), error: null });
  await screen.findByDisplayValue(id === DOC_A ? "Документ А" : "Документ Б");
  return view;
}

describe("закъснели зареждания", () => {
  it("отговор за стар документ не пренаписва новия", async () => {
    const { rerender } = render(<DocumentPane documentId={DOC_A} tabId="tab-1" />);
    await waitFor(() => expect(loads.length).toBe(1));
    rerender(<DocumentPane documentId={DOC_B} tabId="tab-1" />);
    await waitFor(() => expect(loads.length).toBe(2));

    loads[1].d.resolve({ data: row(DOC_B), error: null });
    await screen.findByDisplayValue("Документ Б");
    loads[0].d.resolve({ data: row(DOC_A), error: null });
    await Promise.resolve();
    expect(screen.getByDisplayValue("Документ Б")).toBeTruthy();
    expect(screen.queryByDisplayValue("Документ А")).toBeNull();
  });

  it("редакция след старта на зареждането не се губи — иска решение", async () => {
    await renderLoaded();
    const title = screen.getByDisplayValue("Документ А");
    await userEvent.clear(title);
    await userEvent.type(title, "Моят вариант");
    // Външна промяна (приета редакция от DogovaryAI) стартира презареждане.
    window.dispatchEvent(
      new CustomEvent("dogovori:saved-document-updated", { detail: { documentId: DOC_A } }),
    );
    await waitFor(() => expect(screen.getByTestId("document-external-update")).toBeTruthy());
    expect(screen.getByDisplayValue("Моят вариант")).toBeTruthy();
  });
});

describe("оптимистичен запис по версия", () => {
  it("записът е обвързан с id и заредения updated_at", async () => {
    await renderLoaded();
    await userEvent.click(screen.getByText("Запази"));
    await waitFor(() => expect(saves.length).toBe(1));
    expect(saves[0].id).toBe(DOC_A);
    expect(saves[0].updatedAt).toBe("2026-01-01T00:00:00Z");
    saves[0].d.resolve({ data: row(DOC_A, { updated_at: "2026-02-01T00:00:00Z" }), error: null });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(screen.queryByTestId("document-external-update")).toBeNull();

    // Следващият запис ползва новата версия, върната от сървъра.
    await userEvent.click(screen.getByText("Запази"));
    await waitFor(() => expect(saves.length).toBe(2));
    expect(saves[1].updatedAt).toBe("2026-02-01T00:00:00Z");
  });

  it("чужда промяна прави записа конфликт, не успех", async () => {
    await renderLoaded();
    await userEvent.click(screen.getByText("Запази"));
    await waitFor(() => expect(saves.length).toBe(1));
    saves[0].d.resolve({ data: null, error: null });
    await waitFor(() => expect(screen.getByTestId("document-external-update")).toBeTruthy());
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
    // В конфликт единственият изход е изрично презареждане.
    expect(screen.queryByText("Запази моите промени")).toBeNull();
    expect(screen.getByText("Презареди и отхвърли промените")).toBeTruthy();
  });

  it("презареждането отхвърля локалните промени и чисти конфликта", async () => {
    await renderLoaded();
    const title = screen.getByDisplayValue("Документ А");
    await userEvent.clear(title);
    await userEvent.type(title, "Моят вариант");
    await userEvent.click(screen.getByText("Запази"));
    await waitFor(() => expect(saves.length).toBe(1));
    saves[0].d.resolve({ data: null, error: null });
    await waitFor(() => expect(screen.getByTestId("document-external-update")).toBeTruthy());

    await userEvent.click(screen.getByText("Презареди и отхвърли промените"));
    await waitFor(() => expect(loads.length).toBe(2));
    loads[1].d.resolve({ data: row(DOC_A, { title: "Сървърно заглавие" }), error: null });
    await screen.findByDisplayValue("Сървърно заглавие");
    expect(screen.queryByTestId("document-external-update")).toBeNull();
  });

  it("закъснял запис за стар документ не пипа новото състояние", async () => {
    const { rerender } = await renderLoaded();
    await userEvent.click(screen.getByText("Запази"));
    await waitFor(() => expect(saves.length).toBe(1));

    rerender(<DocumentPane documentId={DOC_B} tabId="tab-1" />);
    await waitFor(() => expect(loads.length).toBe(2));
    loads[1].d.resolve({ data: row(DOC_B), error: null });
    await screen.findByDisplayValue("Документ Б");
    const titleB = screen.getByDisplayValue("Документ Б");
    await userEvent.type(titleB, "!");
    setDirty.mockClear();

    saves[0].d.resolve({ data: row(DOC_A), error: null });
    await Promise.resolve();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(setDirty).not.toHaveBeenCalledWith("tab-1", false);
    expect(screen.getByDisplayValue("Документ Б!")).toBeTruthy();
  });
});
