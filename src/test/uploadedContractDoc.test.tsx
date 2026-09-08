/**
 * РЕАЛНО отложено поведение на контролера на екрана „качен договор".
 * Всички обещания се разрешават ръчно, за да се провери какво се случва, когато
 * потребителят пише или сменя документа, докато заявка е още във въздуха.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  useUploadedContractDoc,
  type Contact,
  type Contract,
  type DbResult,
  type UploadedDocApi,
} from "@/hooks/useUploadedContractDoc";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const LONG = "К".repeat(200);

const row = (over: Partial<Contract> = {}): Contract => ({
  id: "doc-1",
  title: "Договор",
  source: "text",
  storage_path: null,
  original_filename: null,
  text_hash: "h0",
  extracted_text: LONG,
  contact_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

interface Harness {
  api: UploadedDocApi;
  contractQueue: Array<ReturnType<typeof deferred<DbResult<Contract>>>>;
  updates: Array<{ patch: unknown; version: string | null }>;
  updateQueue: Array<ReturnType<typeof deferred<DbResult<Contract>>>>;
  hashQueue: Array<ReturnType<typeof deferred<string>>>;
  savedCopyWrites: number;
  contactQueue: Array<ReturnType<typeof deferred<DbResult<Contract>>>>;
}

function harness(overrides: Partial<UploadedDocApi> = {}): Harness {
  const h: Harness = {
    contractQueue: [],
    updates: [],
    updateQueue: [],
    hashQueue: [],
    savedCopyWrites: 0,
    contactQueue: [],
    api: {} as UploadedDocApi,
  };
  h.api = {
    loadContract: () => {
      const d = deferred<DbResult<Contract>>();
      h.contractQueue.push(d);
      return d.promise;
    },
    loadLatestAnalysis: () => Promise.resolve({ data: null, error: null }),
    loadContacts: () => Promise.resolve({ data: [] as Contact[], error: null }),
    loadSavedCopyId: () => Promise.resolve({ data: { id: "copy-1" }, error: null }),
    updateContract: (_id, patch, version) => {
      h.updates.push({ patch, version });
      const d = deferred<DbResult<Contract>>();
      h.updateQueue.push(d);
      return d.promise;
    },
    updateContactLink: () => {
      const d = deferred<DbResult<Contract>>();
      h.contactQueue.push(d);
      return d.promise;
    },
    updateSavedCopy: () => {
      h.savedCopyWrites++;
      return Promise.resolve({ data: null, error: null });
    },
    createSavedCopy: () => Promise.resolve({ data: { id: "copy-2" }, error: null }),
    hashText: () => {
      const d = deferred<string>();
      h.hashQueue.push(d);
      return d.promise;
    },
    ...overrides,
  };
  return h;
}

function mount(h: Harness, docId = "doc-1") {
  return renderHook(
    (props: { docId: string }) =>
      useUploadedContractDoc({ docId: props.docId, userId: "user-1", api: h.api }),
    { initialProps: { docId } },
  );
}

async function settleInitialLoad(h: Harness, view: ReturnType<typeof mount>, r = row()) {
  await waitFor(() => expect(h.contractQueue.length).toBe(1));
  await act(async () => {
    h.contractQueue[0].resolve({ data: r, error: null });
  });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
}

describe("контролер на качения договор — отложено поведение", () => {
  beforeEach(() => vi.clearAllMocks());

  it("писане по време на презареждане не се презаписва, а конфликтът е видим", async () => {
    const h = harness();
    const view = mount(h);
    await settleInitialLoad(h, view);

    await act(async () => void view.result.current.load({ silent: true }));
    await waitFor(() => expect(h.contractQueue.length).toBe(2));
    // Потребителят пише СЛЕД началото на заявката.
    await act(async () => void view.result.current.setEditText(`${LONG} мои промени`));
    await act(async () => {
      h.contractQueue[1].resolve({
        data: row({ extracted_text: `${LONG} чужди промени`, updated_at: "2026-02-02T00:00:00Z" }),
        error: null,
      });
    });

    expect(view.result.current.editText).toBe(`${LONG} мои промени`);
    // Базата за запис НЕ се мести — отдалеченото се пази отделно.
    expect(view.result.current.contract?.updated_at).toBe("2026-01-01T00:00:00Z");
    expect(view.result.current.remoteConflict?.extracted_text).toBe(`${LONG} чужди промени`);

    // Изричен избор: приемаме отдалеченото.
    await act(async () => void view.result.current.useRemoteVersion());
    expect(view.result.current.remoteConflict).toBeNull();
    expect(view.result.current.editText).toBe(`${LONG} чужди промени`);
    expect(view.result.current.contract?.updated_at).toBe("2026-02-02T00:00:00Z");
  });

  it("изричното запазване на локалния текст не приема отдалечената версия", async () => {
    const h = harness();
    const view = mount(h);
    await settleInitialLoad(h, view);
    await act(async () => void view.result.current.setEditText(`${LONG} локално`));
    await act(async () => void view.result.current.load({ silent: true }));
    await waitFor(() => expect(h.contractQueue.length).toBe(2));
    await act(async () => {
      h.contractQueue[1].resolve({ data: row({ extracted_text: `${LONG} отдалечено` }), error: null });
    });
    await act(async () => void view.result.current.keepLocalVersion());
    expect(view.result.current.editText).toBe(`${LONG} локално`);
    expect(view.result.current.remoteConflict).toBeNull();
    expect(view.result.current.contract?.extracted_text).toBe(LONG);
  });

  it("успешен запис пази текста, написан след натискането на „Запази\"", async () => {
    const h = harness();
    const view = mount(h);
    await settleInitialLoad(h, view);
    await act(async () => void view.result.current.setEditText(`${LONG} първо`));
    let outcome: Promise<string>;
    await act(async () => {
      outcome = view.result.current.saveText() as unknown as Promise<string>;
    });
    await waitFor(() => expect(h.hashQueue.length).toBe(1));
    // Потребителят продължава да пише, докато записът върви.
    await act(async () => void view.result.current.setEditText(`${LONG} първо и второ`));
    await act(async () => {
      h.hashQueue[0].resolve("h1");
    });
    await waitFor(() => expect(h.updateQueue.length).toBe(1));
    await act(async () => {
      h.updateQueue[0].resolve({
        data: row({ extracted_text: `${LONG} първо`, updated_at: "2026-03-03T00:00:00Z", text_hash: "h1" }),
        error: null,
      });
      await outcome;
    });
    expect(view.result.current.editText).toBe(`${LONG} първо и второ`);
    expect(view.result.current.contract?.updated_at).toBe("2026-03-03T00:00:00Z");
    expect(view.result.current.hasUnsavedChanges).toBe(true);
  });

  it("конфликт при запис пази черновата и не пипа свързаното копие", async () => {
    const h = harness();
    const view = mount(h);
    await settleInitialLoad(h, view);
    await act(async () => void view.result.current.setEditText(`${LONG} нова версия`));
    let outcome!: Promise<string>;
    await act(async () => {
      outcome = view.result.current.saveText() as unknown as Promise<string>;
    });
    await waitFor(() => expect(h.hashQueue.length).toBe(1));
    await act(async () => h.hashQueue[0].resolve("h1"));
    await waitFor(() => expect(h.updateQueue.length).toBe(1));
    let result = "";
    await act(async () => {
      h.updateQueue[0].resolve({ data: null, error: null });
      result = (await outcome) as unknown as string;
    });
    expect(result).toBe("conflict");
    expect(view.result.current.editText).toBe(`${LONG} нова версия`);
    expect(h.savedCopyWrites).toBe(0);
    expect(view.result.current.contract?.updated_at).toBe("2026-01-01T00:00:00Z");
  });

  it("непроходимо хеширане не стига до запис", async () => {
    const h = harness({
      hashText: () => Promise.reject(new Error("no crypto")),
    });
    const view = mount(h);
    await settleInitialLoad(h, view);
    await act(async () => void view.result.current.setEditText(`${LONG} промяна`));
    let result = "";
    await act(async () => {
      result = (await view.result.current.saveText()) as unknown as string;
    });
    expect(result).toBe("error");
    expect(h.updates.length).toBe(0);
    expect(view.result.current.savingText).toBe(false);
  });

  it("смяна на документа отхвърля закъснелия резултат за предишния", async () => {
    const h = harness();
    const view = mount(h);
    await waitFor(() => expect(h.contractQueue.length).toBe(1));
    view.rerender({ docId: "doc-2" });
    await waitFor(() => expect(h.contractQueue.length).toBe(2));
    await act(async () => {
      h.contractQueue[0].resolve({ data: row({ title: "Стар документ" }), error: null });
    });
    expect(view.result.current.contract).toBeNull();
    expect(view.result.current.loading).toBe(true);
    await act(async () => {
      h.contractQueue[1].resolve({ data: row({ id: "doc-2", title: "Нов документ" }), error: null });
    });
    expect(view.result.current.contract?.title).toBe("Нов документ");
  });

  it("размонтирането спира прилагането на резултати", async () => {
    const h = harness();
    const view = mount(h);
    await waitFor(() => expect(h.contractQueue.length).toBe(1));
    view.unmount();
    await act(async () => {
      h.contractQueue[0].resolve({ data: row(), error: null });
    });
    // Няма изключение и няма приложено състояние — тестът минава без warning.
    expect(h.updates.length).toBe(0);
  });

  it("запис на контрагент взима новата версия от върнатия ред", async () => {
    const h = harness();
    const view = mount(h);
    await settleInitialLoad(h, view);
    let outcome!: Promise<string>;
    await act(async () => {
      outcome = view.result.current.saveContact("c-1") as unknown as Promise<string>;
    });
    await waitFor(() => expect(h.contactQueue.length).toBe(1));
    await act(async () => {
      h.contactQueue[0].resolve({
        data: row({ contact_id: "c-1", updated_at: "2026-04-04T00:00:00Z" }),
        error: null,
      });
      await outcome;
    });
    expect(view.result.current.contract?.updated_at).toBe("2026-04-04T00:00:00Z");
    expect(view.result.current.contactId).toBe("c-1");
  });

  it("закъсняло презареждане не връща по-стара база след успешен запис", async () => {
    const h = harness();
    const view = mount(h);
    await settleInitialLoad(h, view);
    // Презареждане стартира ПРЕДИ записа.
    await act(async () => void view.result.current.load({ silent: true }));
    await waitFor(() => expect(h.contractQueue.length).toBe(2));
    await act(async () => void view.result.current.setEditText(`${LONG} ново`));
    let outcome!: Promise<string>;
    await act(async () => {
      outcome = view.result.current.saveText() as unknown as Promise<string>;
    });
    await waitFor(() => expect(h.hashQueue.length).toBe(1));
    await act(async () => h.hashQueue[0].resolve("h9"));
    await waitFor(() => expect(h.updateQueue.length).toBe(1));
    await act(async () => {
      h.updateQueue[0].resolve({
        data: row({ extracted_text: `${LONG} ново`, updated_at: "2026-05-05T00:00:00Z" }),
        error: null,
      });
      await outcome;
    });
    // Старото четене се връща последно — не бива да върне старата версия.
    await act(async () => {
      h.contractQueue[1].resolve({ data: row({ updated_at: "2026-01-01T00:00:00Z" }), error: null });
    });
    expect(view.result.current.contract?.updated_at).toBe("2026-05-05T00:00:00Z");
  });
});
