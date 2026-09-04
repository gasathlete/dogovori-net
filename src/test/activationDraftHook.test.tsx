/**
 * Тестове за съгласуваността на автоматичното запазване и присвояването.
 *
 * Покриват точно рисковете от паралелни заявки:
 *  - най-много една заявка към draft-sync в движение;
 *  - междинните редакции се обединяват в един изпратен снапшот;
 *  - закъснял отговор се записва с НАЙ-НОВОТО състояние (не връща назад);
 *  - преходна грешка при присвояване се повтаря с backoff, без дубликати;
 *  - размонтиране спира таймерите и не оставя заявки/записи.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let authUser: { id: string } | null = null;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: authUser, session: null, loading: false, signOut: vi.fn() }) }));
vi.mock("@/lib/docFunnel", () => ({ trackDraftEvent: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}));

const syncMock = vi.fn();
const claimMock = vi.fn();
vi.mock("@/lib/activationDraft", async () => {
  const actual = await vi.importActual<typeof import("@/lib/activationDraft")>("@/lib/activationDraft");
  return {
    ...actual,
    isActivationContinuityEnabled: () => true,
    syncDraft: (...args: unknown[]) => syncMock(...args),
    claimDraft: (...args: unknown[]) => claimMock(...args),
    loadSavedDraftPayload: vi.fn(async () => null),
  };
});

import { useActivationDraft } from "@/hooks/useActivationDraft";
import {
  ANON_DRAFT_TTL_MS,
  writePayload,
  writePointer,
  type DraftPointer,
} from "@/lib/activationDraft";

function pointer(overrides: Partial<DraftPointer> = {}): DraftPointer {
  return {
    draftId: "11111111-1111-4111-8111-111111111111",
    claimToken: "abcdefghijklmnopqrstuvwx",
    flow: "wizard",
    docKey: "sector::doc",
    route: "/wizard/it?doc=nda",
    stepIdx: 1,
    hasResult: false,
    tabId: "tab-1",
    ts: Date.now(),
    expiresAt: Date.now() + ANON_DRAFT_TTL_MS,
    claimed: false,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function okSync(p: DraftPointer, created = true) {
  const commit = vi.fn((overrides?: { stepIdx?: number; hasResult?: boolean }) => ({
    ...p,
    stepIdx: overrides?.stepIdx ?? p.stepIdx,
    hasResult: overrides?.hasResult ?? p.hasResult,
  }));
  return { result: { ok: true as const, pointer: p, created, commit }, commit };
}

function render() {
  return renderHook(() => useActivationDraft({ flow: "wizard", docKey: "sector::doc", route: "/wizard/it?doc=nda" }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  syncMock.mockReset();
  claimMock.mockReset();
  authUser = null;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("автоматично запазване: единствена заявка и обединяване", () => {
  it("не пуска втора заявка, докато първата е в движение, и изпраща само последния снапшот", async () => {
    const first = deferred<ReturnType<typeof okSync>["result"]>();
    const second = okSync(pointer({ stepIdx: 3 }), false);
    syncMock.mockImplementationOnce(() => first.promise).mockImplementationOnce(async () => second.result);

    const { result } = render();
    act(() => result.current.persist({ answers: { a: "1" } }, { stepIdx: 1 }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(syncMock).toHaveBeenCalledTimes(1);

    // Две редакции по време на заявката → нито една допълнителна заявка сега.
    act(() => {
      result.current.persist({ answers: { a: "2" } }, { stepIdx: 2 });
      result.current.persist({ answers: { a: "3" } }, { stepIdx: 3 });
    });
    expect(syncMock).toHaveBeenCalledTimes(1);
    // Съдържанието обаче е в таба веднага, още докато заявката пътува.
    expect(JSON.parse(sessionStorage.getItem("activation_draft_payload_v1:local") ?? "{}")).toEqual({
      answers: { a: "3" },
    });

    const created = okSync(pointer({ stepIdx: 1 }));
    await act(async () => {
      first.resolve(created.result);
      await Promise.resolve();
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    // Закъснелият отговор се записва с НАЙ-НОВОТО състояние.
    expect(created.commit).toHaveBeenCalledTimes(1);
    expect(created.commit.mock.calls[0][0]).toMatchObject({ stepIdx: 3, payload: { answers: { a: "3" } } });

    // След това точно една обединена заявка за натрупаните редакции.
    expect(syncMock).toHaveBeenCalledTimes(2);
    expect(syncMock.mock.calls[1][0]).toMatchObject({ stepIdx: 3, payload: { answers: { a: "3" } } });
  });

  it("след размонтиране не се записва нищо и таймерът е спрян", async () => {
    const first = deferred<ReturnType<typeof okSync>["result"]>();
    syncMock.mockImplementationOnce(() => first.promise);
    const { result, unmount } = render();
    act(() => result.current.persist({ answers: { a: "1" } }, { stepIdx: 1 }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    const created = okSync(pointer());
    unmount();
    await act(async () => {
      first.resolve(created.result);
      await Promise.resolve();
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(created.commit).not.toHaveBeenCalled();
    expect(syncMock).toHaveBeenCalledTimes(1);
  });
});

describe("присвояване: повторен опит при преходна грешка", () => {
  beforeEach(() => {
    writePointer(pointer());
    writePayload("11111111-1111-4111-8111-111111111111", { answers: { a: "1" } });
    authUser = { id: "user-1" };
  });

  it("повтаря с backoff, без дублирани заявки, и спира след успех", async () => {
    claimMock
      .mockImplementationOnce(async () => ({ ok: false, reason: "network" }))
      .mockImplementationOnce(async () => ({ ok: true, hasResult: false }));

    render();
    await act(async () => {
      await Promise.resolve();
    });
    expect(claimMock).toHaveBeenCalledTimes(1);

    // Преди изтичане на backoff-а няма нов опит.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(claimMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    expect(claimMock).toHaveBeenCalledTimes(2);

    // Успех → никакви следващи опити.
    await act(async () => {
      vi.advanceTimersByTime(120_000);
      await Promise.resolve();
    });
    expect(claimMock).toHaveBeenCalledTimes(2);
  });

  it("размонтирането отменя чакащия повторен опит", async () => {
    claimMock.mockImplementation(async () => ({ ok: false, reason: "rate_limited" }));
    const { unmount } = render();
    await act(async () => {
      await Promise.resolve();
    });
    expect(claimMock).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(120_000);
      await Promise.resolve();
    });
    expect(claimMock).toHaveBeenCalledTimes(1);
  });

  it("окончателна грешка не се повтаря и отвързва указателя", async () => {
    claimMock.mockImplementation(async () => ({ ok: false, reason: "different_owner" }));
    render();
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(120_000);
      await Promise.resolve();
    });
    expect(claimMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("activation_draft_v1")).toBeNull();
  });
});

describe("указателят е защитен от закъснели отговори", () => {
  it("отказване по време на заявка: отговорът не възстановява указателя", async () => {
    const first = deferred<ReturnType<typeof okSync>["result"]>();
    syncMock.mockImplementationOnce(() => first.promise);
    const { result } = render();
    act(() => result.current.persist({ answers: { a: "1" } }, { stepIdx: 1 }));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    act(() => result.current.discard());
    const created = okSync(pointer());
    await act(async () => {
      first.resolve(created.result);
      await Promise.resolve();
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(created.commit).not.toHaveBeenCalled();
    expect(localStorage.getItem("activation_draft_v1")).toBeNull();
  });

  it("успешното присвояване запазва най-новата стъпка от таба", async () => {
    writePointer(pointer({ stepIdx: 1 }));
    authUser = { id: "user-1" };
    const claim = deferred<{ ok: true; hasResult: boolean }>();
    claimMock.mockImplementationOnce(() => claim.promise);

    const { result } = render();
    await act(async () => {
      await Promise.resolve();
    });
    // Потребителят продължава да пише, докато присвояването пътува.
    act(() => result.current.persist({ answers: { a: "9" } }, { stepIdx: 4 }));

    await act(async () => {
      claim.resolve({ ok: true, hasResult: false });
      await Promise.resolve();
      await Promise.resolve();
    });

    const stored = JSON.parse(localStorage.getItem("activation_draft_v1") ?? "{}");
    expect(stored).toMatchObject({ stepIdx: 4, claimed: true, claimToken: "" });
  });

  it("изходът отменя чакащия повторен опит за присвояване", async () => {
    writePointer(pointer());
    authUser = { id: "user-1" };
    claimMock.mockImplementation(async () => ({ ok: false, reason: "network" }));
    const { rerender } = render();
    await act(async () => {
      await Promise.resolve();
    });
    expect(claimMock).toHaveBeenCalledTimes(1);

    authUser = null;
    rerender();
    await act(async () => {
      vi.advanceTimersByTime(120_000);
      await Promise.resolve();
    });
    expect(claimMock).toHaveBeenCalledTimes(1);
  });
});
