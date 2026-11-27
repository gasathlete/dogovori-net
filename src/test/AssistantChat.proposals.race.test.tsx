/* eslint-disable @typescript-eslint/no-explicit-any -- фалшиви клиент/стрийм обекти в тест */
/**
 * Q2f — състезания при карти за редакция: A→B→A за зареждане и за действие,
 * потискане на закъснели съобщения/събития/грешки и защита от двоен клик.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const React = await import("react");
  return {
    useNavigate: () => navigate,
    useLocation: () => ({ pathname: "/assistant" }),
    Link: ({ children, ...p }: any) => React.createElement("a", p, children),
  };
});
vi.mock("react-markdown", () => ({
  default: ({ children }: { children?: string }) => <span>{children}</span>,
}));
vi.mock("remark-gfm", () => ({ default: () => undefined }));

const toastSuccess = vi.fn();
const toastMessage = vi.fn();
const toastInfo = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    message: (...a: unknown[]) => toastMessage(...a),
    info: (...a: unknown[]) => toastInfo(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "owner-a" }, session: { access_token: "tok" } }),
}));
vi.mock("@/hooks/useIsPro", () => ({
  useIsPro: () => ({
    isPro: true,
    isTeam: false,
    freeQuota: { aiMessagesCap: 3, aiMessagesUsed: 0 },
    refresh: vi.fn(),
  }),
}));
vi.mock("@/hooks/useRequireAuth", () => ({ useRequireAuth: () => () => true }));

const DOC_A = "11111111-1111-4111-8111-111111111111";

type ThreadRow = {
  id: string;
  user_id: string;
  title: string;
  updated_at: string;
  context_kind: string | null;
  context_entity_id: string | null;
  context_title: string | null;
};

const db: { threads: ThreadRow[]; messages: Record<string, any[]> } = { threads: [], messages: {} };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      let id: string | null = null;
      const api: any = {
        select: () => api,
        eq: (col: string, val: string) => {
          if (col === "id" || col === "thread_id") id = val;
          return api;
        },
        order: () => api,
        limit: () => api,
        delete: () => api,
        maybeSingle: async () => ({ data: db.threads.find((t) => t.id === id) ?? null, error: null }),
        then: (res: any, rej: any) => {
          const data = table === "assistant_threads" ? db.threads : (id ? db.messages[id] ?? [] : []);
          return Promise.resolve({ data, error: null }).then(res, rej);
        },
      };
      return api;
    },
  },
}));

// --- управляеми зареждания/действия на предложения --------------------------
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const loadCalls: Array<{ threadId: string; docId: string; d: Deferred<any> }> = [];
const actionCalls: Array<{ proposalId: string; action: string; d: Deferred<any> }> = [];

vi.mock("@/lib/assistantEditProposals", async () => {
  const actual = await vi.importActual<any>("@/lib/assistantEditProposals");
  return {
    ...actual,
    loadThreadProposals: (threadId: string, docId: string) => {
      const d = deferred<any>();
      loadCalls.push({ threadId, docId, d });
      return d.promise;
    },
    submitProposalAction: (_t: string, proposalId: string, action: string) => {
      const d = deferred<any>();
      actionCalls.push({ proposalId, action, d });
      return d.promise;
    },
  };
});

import { AssistantChat } from "@/components/AssistantChat";
import { clearAssistantDocumentContext } from "@/lib/assistantDocumentContext";

function proposal(over: Partial<any> & { id: string }) {
  return {
    threadId: "t-a",
    savedDocumentId: DOC_A,
    targetPath: "payload.sections.0.body",
    before: "старо",
    after: "ново",
    reason: "по-ясно",
    status: "pending",
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function thread(over: Partial<ThreadRow> & { id: string }): ThreadRow {
  return {
    user_id: "owner-a",
    title: "Разговор",
    updated_at: "2026-01-01T00:00:00Z",
    context_kind: "saved_document",
    context_entity_id: DOC_A,
    context_title: "Наем на офис",
    ...over,
  };
}

beforeEach(() => {
  Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  if (!("ResizeObserver" in globalThis)) {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  }
  loadCalls.length = 0;
  actionCalls.length = 0;
  navigate.mockClear();
  [toastSuccess, toastMessage, toastInfo, toastError].forEach((m) => m.mockClear());
  clearAssistantDocumentContext();
  localStorage.clear();
  db.threads = [
    thread({ id: "t-a", title: "Разговор А" }),
    thread({ id: "t-b", title: "Разговор Б", context_title: "Друг документ" }),
  ];
  db.messages = { "t-a": [], "t-b": [] };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function selectThread(title: string) {
  await userEvent.click(screen.getAllByText(title)[0]);
}

describe("зареждане на предложения при A→B→A", () => {
  it("закъснял отговор от първото посещение на A не се показва след връщане", async () => {
    const { rerender } = render(<AssistantChat threadId="t-a" />);
    await waitFor(() => expect(loadCalls.length).toBe(1));
    const first = loadCalls[0];

    // A → B
    rerender(<AssistantChat threadId="t-b" />);
    await waitFor(() => expect(loadCalls.length).toBe(2));
    // B → A (същата идентичност, ново поколение)
    rerender(<AssistantChat threadId="t-a" />);
    await waitFor(() => expect(loadCalls.length).toBe(3));

    // Първото зареждане се връща най-накрая — трябва да бъде изхвърлено.
    first.d.resolve({ ok: true, proposals: [proposal({ id: "p-old" })] });
    loadCalls[1].d.resolve({ ok: true, proposals: [proposal({ id: "p-b", threadId: "t-b" })] });
    await Promise.resolve();
    expect(screen.queryByTestId("edit-proposal-card")).toBeNull();

    // Само отговорът на текущото поколение се приема.
    loadCalls[2].d.resolve({ ok: true, proposals: [proposal({ id: "p-new" })] });
    const card = await screen.findByTestId("edit-proposal-card");
    expect(within(card).getByText(/ново/)).toBeTruthy();
  });

  it("картите се изчистват веднага при смяна на разговор", async () => {
    const { rerender } = render(<AssistantChat threadId="t-a" />);
    await waitFor(() => expect(loadCalls.length).toBe(1));
    loadCalls[0].d.resolve({ ok: true, proposals: [proposal({ id: "p1" })] });
    await screen.findByTestId("edit-proposal-card");

    rerender(<AssistantChat threadId="t-b" />);
    await waitFor(() => expect(screen.queryByTestId("edit-proposal-card")).toBeNull());
  });
});

describe("действия по предложение", () => {
  async function renderWithCard() {
    const view = render(<AssistantChat threadId="t-a" />);
    await waitFor(() => expect(loadCalls.length).toBe(1));
    loadCalls[0].d.resolve({ ok: true, proposals: [proposal({ id: "p1" })] });
    await screen.findByTestId("edit-proposal-card");
    return view;
  }

  it("двоен клик не създава второ действие", async () => {
    await renderWithCard();
    const accept = screen.getByText("Приеми промяната");
    await userEvent.click(accept);
    await userEvent.click(accept);
    expect(actionCalls.length).toBe(1);
  });

  it("закъсняло действие след A→B→A не показва съобщение и не пипа новото състояние", async () => {
    const { rerender } = await renderWithCard();
    await userEvent.click(screen.getByText("Приеми промяната"));
    expect(actionCalls.length).toBe(1);
    const stale = actionCalls[0];

    rerender(<AssistantChat threadId="t-b" />);
    await waitFor(() => expect(loadCalls.length).toBe(2));
    rerender(<AssistantChat threadId="t-a" />);
    await waitFor(() => expect(loadCalls.length).toBe(3));
    loadCalls[2].d.resolve({ ok: true, proposals: [proposal({ id: "p1" })] });
    await screen.findByTestId("edit-proposal-card");

    // Старото действие се връща сега: без toast, без ново презареждане.
    const loadsBefore = loadCalls.length;
    stale.d.resolve({ ok: true, changed: true, requiresNewThread: false, document: { id: DOC_A } });
    await Promise.resolve();
    await Promise.resolve();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastMessage).not.toHaveBeenCalled();
    expect(loadCalls.length).toBe(loadsBefore);

    // Ключалката на новото поколение е свободна: ново действие минава.
    await userEvent.click(screen.getByText("Приеми промяната"));
    expect(actionCalls.length).toBe(2);
  });

  it("закъсняла грешка от чуждо поколение не се показва", async () => {
    const { rerender } = await renderWithCard();
    await userEvent.click(screen.getByText("Приеми промяната"));
    const stale = actionCalls[0];
    rerender(<AssistantChat threadId="t-b" />);
    await waitFor(() => expect(loadCalls.length).toBe(2));
    stale.d.resolve({ ok: false, code: "stale_base" });
    await Promise.resolve();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("действие в текущото поколение показва резултата и презарежда", async () => {
    await renderWithCard();
    await userEvent.click(screen.getByText("Приеми промяната"));
    actionCalls[0].d.resolve({ ok: true, changed: true, requiresNewThread: false, document: { id: DOC_A } });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    await waitFor(() => expect(loadCalls.length).toBe(2));
  });
});

// Изолирано „отворено“ състояние: тестът проверява самия поток, не предварителния режим.
vi.mock("@/lib/prelaunch", async (orig) => ({
  ...(await orig<typeof import("@/lib/prelaunch")>()),
  canStartNewProcessing: () => true,
}));
