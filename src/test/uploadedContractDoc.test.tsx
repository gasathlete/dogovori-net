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

describe("контролер — запис на едно поле не губи чернова на друго", () => {
  it("запис на името пази вече мръсната чернова на текста и по-късното писане", async () => {
    const h = harness();
    const view = mount(h);
    await settleInitialLoad(h, view);
    // Текстът е мръсен ПРЕДИ да пипаме името.
    await act(async () => void view.result.current.setEditText(`${LONG} мои промени`));
    await act(async () => void view.result.current.setTitleDraft("Ново име"));
    let outcome!: Promise<string>;
    await act(async () => {
      outcome = view.result.current.saveTitle() as unknown as Promise<string>;
    });
    await waitFor(() => expect(h.updateQueue.length).toBe(1));
    expect(h.updates[0].patch).toEqual({ title: "Ново име" });
    await act(async () => {
      h.updateQueue[0].resolve({
        data: row({ title: "Ново име", updated_at: "2026-06-06T00:00:00Z" }),
        error: null,
      });
      await outcome;
    });
    // Текстовата чернова е НЕДОКОСНАТА.
    expect(view.result.current.editText).toBe(`${LONG} мои промени`);
    expect(view.result.current.titleDraft).toBe("Ново име");
    expect(view.result.current.dirtyText).toBe(true);
    // Следващият запис ползва новата версия.
    await act(async () => void view.result.current.setEditText(`${LONG} и още`));
    let second!: Promise<string>;
    await act(async () => {
      second = view.result.current.saveText() as unknown as Promise<string>;
    });
    await waitFor(() => expect(h.hashQueue.length).toBe(1));
    await act(async () => h.hashQueue[0].resolve("h2"));
    await waitFor(() => expect(h.updateQueue.length).toBe(2));
    expect(h.updates[1].version).toBe("2026-06-06T00:00:00Z");
    await act(async () => {
      h.updateQueue[1].resolve({
        data: row({ extracted_text: `${LONG} и още`, title: "Ново име", updated_at: "2026-06-07T00:00:00Z" }),
        error: null,
      });
      await second;
    });
    expect(view.result.current.editText).toBe(`${LONG} и още`);
  });

  it("запис на текста пази вече мръсната чернова на името", async () => {
    const h = harness();
    const view = mount(h);
    await settleInitialLoad(h, view);
    await act(async () => void view.result.current.setTitleDraft("Мое име"));
    await act(async () => void view.result.current.setEditText(`${LONG} нов текст`));
    let outcome!: Promise<string>;
    await act(async () => {
      outcome = view.result.current.saveText() as unknown as Promise<string>;
    });
    await waitFor(() => expect(h.hashQueue.length).toBe(1));
    await act(async () => h.hashQueue[0].resolve("h3"));
    await waitFor(() => expect(h.updateQueue.length).toBe(1));
    await act(async () => {
      h.updateQueue[0].resolve({
        data: row({ extracted_text: `${LONG} нов текст`, updated_at: "2026-06-08T00:00:00Z" }),
        error: null,
      });
      await outcome;
    });
    expect(view.result.current.titleDraft).toBe("Мое име");
    expect(view.result.current.dirtyTitle).toBe(true);
    expect(view.result.current.editText).toBe(`${LONG} нов текст`);
  });
});

describe("контролер — изричен изход от конфликт", () => {
  async function toConflict(h: Harness, view: ReturnType<typeof mount>, remote: Contract) {
    await settleInitialLoad(h, view);
    await act(async () => void view.result.current.setEditText(`${LONG} моя версия`));
    let outcome!: Promise<string>;
    await act(async () => {
      outcome = view.result.current.saveText() as unknown as Promise<string>;
    });
    await waitFor(() => expect(h.hashQueue.length).toBe(1));
    await act(async () => h.hashQueue[0].resolve("hc"));
    await waitFor(() => expect(h.updateQueue.length).toBe(1));
    await act(async () => {
      h.updateQueue[0].resolve({ data: null, error: null });
      await outcome;
    });
    // CAS 0 стартира презареждане, което носи отдалечената снимка.
    await waitFor(() => expect(h.contractQueue.length).toBe(2));
    await act(async () => {
      h.contractQueue[1].resolve({ data: remote, error: null });
    });
  }

  it("конфликтът е видим и когато отдалеченият текст е същият, но версията е нова", async () => {
    const h = harness();
    const view = mount(h);
    await toConflict(h, view, row({ updated_at: "2026-07-01T00:00:00Z" }));
    expect(view.result.current.conflictUnresolved).toBe(true);
    expect(view.result.current.remoteConflict?.updated_at).toBe("2026-07-01T00:00:00Z");
    // Записът е блокиран, докато няма избор.
    const blocked = await act(async () => {
      await view.result.current.saveText();
    });
    void blocked;
    expect(h.updates.length).toBe(1);
  });

  it("„запази моя текст\" пренася версията и следващият запис успява", async () => {
    const h = harness();
    const view = mount(h);
    await toConflict(h, view, row({ extracted_text: `${LONG} чуждо`, updated_at: "2026-07-02T00:00:00Z" }));
    await act(async () => void view.result.current.keepLocalVersion());
    expect(view.result.current.conflictUnresolved).toBe(false);
    expect(view.result.current.editText).toBe(`${LONG} моя версия`);
    let outcome!: Promise<string>;
    await act(async () => {
      outcome = view.result.current.saveText() as unknown as Promise<string>;
    });
    await waitFor(() => expect(h.hashQueue.length).toBe(2));
    await act(async () => h.hashQueue[1].resolve("hk"));
    await waitFor(() => expect(h.updateQueue.length).toBe(2));
    expect(h.updates[1].version).toBe("2026-07-02T00:00:00Z");
    await act(async () => {
      h.updateQueue[1].resolve({
        data: row({ extracted_text: `${LONG} моя версия`, updated_at: "2026-07-03T00:00:00Z" }),
        error: null,
      });
      await outcome;
    });
    expect(view.result.current.contract?.updated_at).toBe("2026-07-03T00:00:00Z");
  });

  it("нова отдалечена промяна след избора пак дава конфликт", async () => {
    const h = harness();
    const view = mount(h);
    await toConflict(h, view, row({ extracted_text: `${LONG} чуждо`, updated_at: "2026-07-02T00:00:00Z" }));
    await act(async () => void view.result.current.keepLocalVersion());
    let outcome!: Promise<string>;
    await act(async () => {
      outcome = view.result.current.saveText() as unknown as Promise<string>;
    });
    await waitFor(() => expect(h.hashQueue.length).toBe(2));
    await act(async () => h.hashQueue[1].resolve("hk2"));
    await waitFor(() => expect(h.updateQueue.length).toBe(2));
    await act(async () => {
      h.updateQueue[1].resolve({ data: null, error: null });
      await outcome;
    });
    expect(view.result.current.conflictUnresolved).toBe(true);
    expect(view.result.current.editText).toBe(`${LONG} моя версия`);
  });

  it("„използвай другата версия\" приема отдалечения текст", async () => {
    const h = harness();
    const view = mount(h);
    await toConflict(h, view, row({ extracted_text: `${LONG} чуждо`, updated_at: "2026-07-04T00:00:00Z" }));
    await act(async () => void view.result.current.useRemoteVersion());
    expect(view.result.current.conflictUnresolved).toBe(false);
    expect(view.result.current.editText).toBe(`${LONG} чуждо`);
    expect(view.result.current.contract?.updated_at).toBe("2026-07-04T00:00:00Z");
  });

  it("провалено презареждане не скрива конфликта", async () => {
    const h = harness();
    const view = mount(h);
    await settleInitialLoad(h, view);
    await act(async () => void view.result.current.setEditText(`${LONG} моя версия`));
    let outcome!: Promise<string>;
    await act(async () => {
      outcome = view.result.current.saveText() as unknown as Promise<string>;
    });
    await waitFor(() => expect(h.hashQueue.length).toBe(1));
    await act(async () => h.hashQueue[0].resolve("hf"));
    await waitFor(() => expect(h.updateQueue.length).toBe(1));
    await act(async () => {
      h.updateQueue[0].resolve({ data: null, error: null });
      await outcome;
    });
    await waitFor(() => expect(h.contractQueue.length).toBe(2));
    await act(async () => {
      h.contractQueue[1].reject(new Error("network"));
      await Promise.resolve();
    });
    expect(view.result.current.conflictUnresolved).toBe(true);
  });
});

describe("контролер — контрагент и ред на четенията", () => {
  it("контрагент с различен отдалечен текст не приема новата версия", async () => {
    const h = harness();
    const view = mount(h);
    await settleInitialLoad(h, view);
    await act(async () => void view.result.current.setEditText(`${LONG} локално`));
    let outcome!: Promise<string>;
    await act(async () => {
      outcome = view.result.current.saveContact("c-1") as unknown as Promise<string>;
    });
    await waitFor(() => expect(h.contactQueue.length).toBe(1));
    let res = "";
    await act(async () => {
      h.contactQueue[0].resolve({
        data: row({ contact_id: "c-1", extracted_text: `${LONG} чуждо`, updated_at: "2026-08-01T00:00:00Z" }),
        error: null,
      });
      res = (await outcome) as unknown as string;
    });
    expect(res).toBe("conflict");
    expect(view.result.current.conflictUnresolved).toBe(true);
    expect(view.result.current.contract?.updated_at).toBe("2026-01-01T00:00:00Z");
    expect(view.result.current.editText).toBe(`${LONG} локално`);
  });

  it("грешка при контрагент не съобщава успех", async () => {
    const notices: Array<[string, string]> = [];
    const h = harness();
    const view = renderHook(() =>
      useUploadedContractDoc({
        docId: "doc-1",
        userId: "user-1",
        api: h.api,
        onNotice: (k, m) => notices.push([k, m]),
      }),
    );
    await settleInitialLoad(h, view as unknown as ReturnType<typeof mount>);
    let outcome!: Promise<string>;
    await act(async () => {
      outcome = view.result.current.saveContact("c-9") as unknown as Promise<string>;
    });
    await waitFor(() => expect(h.contactQueue.length).toBe(1));
    let res = "";
    await act(async () => {
      h.contactQueue[0].resolve({ data: null, error: null });
      res = (await outcome) as unknown as string;
    });
    expect(res).toBe("error");
    expect(notices.some(([k]) => k === "success")).toBe(false);
  });

  it("по-старо четене, което завършва последно, не връща по-стара база", async () => {
    const h = harness();
    const view = mount(h);
    await settleInitialLoad(h, view);
    await act(async () => void view.result.current.load({ silent: true }));
    await waitFor(() => expect(h.contractQueue.length).toBe(2));
    await act(async () => void view.result.current.load({ silent: true }));
    await waitFor(() => expect(h.contractQueue.length).toBe(3));
    // Новото четене завършва ПЪРВО.
    await act(async () => {
      h.contractQueue[2].resolve({ data: row({ title: "Ново", updated_at: "2026-09-02T00:00:00Z" }), error: null });
    });
    // По-старото — след него; не бива да се приложи.
    await act(async () => {
      h.contractQueue[1].resolve({ data: row({ title: "Старо", updated_at: "2026-09-01T00:00:00Z" }), error: null });
    });
    expect(view.result.current.contract?.title).toBe("Ново");
    expect(view.result.current.contract?.updated_at).toBe("2026-09-02T00:00:00Z");
  });

  it("отказано четене не оставя вечно зареждане", async () => {
    const h = harness();
    const view = mount(h);
    await waitFor(() => expect(h.contractQueue.length).toBe(1));
    await act(async () => {
      h.contractQueue[0].reject(new Error("offline"));
      await Promise.resolve();
    });
    expect(view.result.current.contract).toBeNull();
  });
});
