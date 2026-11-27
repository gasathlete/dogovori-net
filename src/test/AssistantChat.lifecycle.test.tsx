/* eslint-disable @typescript-eslint/no-explicit-any -- фалшиви клиент/стрийм обекти в тест */
/**
 * Q2e — реален жизнен цикъл на AssistantChat (не само стор/чисти помощници).
 *
 * Тестват се продукционните пътища: авторитетен разговор от маршрута, видим
 * контекст, смяна A→B→A, игнориране на закъснели SSE събития, unmount и
 * StrictMode, изолация по акаунт и съдържанието на заявката/хранилището.
 */
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------- mocks

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

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

let currentUser: { id: string } | null = { id: "owner-a" };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: currentUser, session: currentUser ? { access_token: "tok" } : null }),
}));
const refreshPlan = vi.fn();
vi.mock("@/hooks/useIsPro", () => ({
  useIsPro: () => ({
    isPro: true,
    isTeam: false,
    freeQuota: { aiMessagesCap: 3, aiMessagesUsed: 0 },
    refresh: refreshPlan,
  }),
}));
vi.mock("@/hooks/useRequireAuth", () => ({ useRequireAuth: () => () => true }));

// --- фалшива база (само четене на разговори и съобщения) --------------------
const DOC_A = "11111111-1111-4111-8111-111111111111";
const DOC_B = "22222222-2222-4222-9222-222222222222";

type ThreadRow = {
  id: string;
  user_id: string;
  title: string;
  updated_at: string;
  context_kind: string | null;
  context_entity_id: string | null;
  context_title: string | null;
};

const db: {
  threads: ThreadRow[];
  messages: Record<string, Array<{ id: string; role: string; content: string }>>;
  /** Задържа зареждането на съобщенията, докато тестът не го освободи. */
  messageGate: Promise<void> | null;
  releaseMessages: (() => void) | null;
  threadError: boolean;
  messagesError: boolean;
} = { threads: [], messages: {}, messageGate: null, releaseMessages: null, threadError: false, messagesError: false };

function holdMessages() {
  let release: () => void = () => {};
  db.messageGate = new Promise<void>((r) => { release = () => r(); });
  db.releaseMessages = () => { release(); db.messageGate = null; };
}

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
        maybeSingle: async () => {
          if (db.threadError) return { data: null, error: { message: "нет достъп" } };
          return { data: db.threads.find((t) => t.id === id) ?? null, error: null };
        },
        then: (res: any, rej: any) => {
          const data = table === "assistant_threads"
            ? db.threads
            : (id ? db.messages[id] ?? [] : []);
          const gate = table === "assistant_messages" && db.messageGate
            ? db.messageGate
            : Promise.resolve();
          const err = table === "assistant_messages" && db.messagesError
            ? { message: "не може да се прочете" }
            : null;
          return gate.then(() => ({ data: err ? null : data, error: err })).then(res, rej);
        },
      };
      return api;
    },
  },
}));

import { AssistantChat } from "@/components/AssistantChat";
import {
  clearAssistantDocumentContext,
  setAssistantDocumentContext,
} from "@/lib/assistantDocumentContext";

// ---------------------------------------------------------------- SSE helpers

interface Controllable {
  push: (chunk: string) => void;
  close: () => void;
}

function sseResponse(): { response: Response; ctl: Controllable } {
  const enc = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
  });
  const ctl: Controllable = {
    push: (chunk) => controller.enqueue(enc.encode(chunk)),
    close: () => { try { controller.close(); } catch { /* ignore */ } },
  };
  return { response: { ok: true, body: stream } as unknown as Response, ctl };
}

function evt(type: string, data: unknown) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

const bodies: Array<Record<string, any>> = [];
let fetchImpl: (url: string, init: RequestInit) => Promise<Response>;

beforeEach(() => {
  // jsdom не реализира scrollTo/scrollIntoView.
  Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  if (!("ResizeObserver" in globalThis)) {
    vi.stubGlobal("ResizeObserver", class {
      observe() {} unobserve() {} disconnect() {}
    });
  }
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return fetchImpl(url, init);
  }));
  bodies.length = 0;
  navigate.mockClear();
  toastError.mockClear();
  currentUser = { id: "owner-a" };
  clearAssistantDocumentContext();
  localStorage.clear();
  db.threads = [];
  db.messages = {};
  db.messageGate = null;
  db.releaseMessages = null;
  db.threadError = false;
  db.messagesError = false;
  fetchImpl = async () => {
    const { response, ctl } = sseResponse();
    ctl.push(evt("meta", { threadId: "t-new" }));
    ctl.push(`data: ${JSON.stringify({ delta: "ок" })}\n\n`);
    ctl.close();
    return response;
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function thread(over: Partial<ThreadRow> & { id: string }): ThreadRow {
  return {
    user_id: "owner-a",
    title: "Разговор",
    updated_at: "2026-01-01T00:00:00Z",
    context_kind: null,
    context_entity_id: null,
    context_title: null,
    ...over,
  };
}

async function typeAndSend(text: string) {
  const input = screen.getByTestId("assistant-input");
  await userEvent.type(input, text);
  await userEvent.keyboard("{Enter}");
}

// ---------------------------------------------------------------- tests

describe("маршрутът е авторитетен над localStorage", () => {
  it("хидратира обвързания контекст на разговора от URL преди изпращане", async () => {
    localStorage.setItem("dogovaryai_active_thread:owner-a", "t-old");
    db.threads = [
      thread({ id: "t-old", title: "Стар общ" }),
      thread({
        id: "t-route", title: "Наем",
        context_kind: "saved_document", context_entity_id: DOC_A, context_title: "Наем на офис",
      }),
    ];
    db.messages["t-route"] = [{ id: "m1", role: "user", content: "въпрос по наема" }];

    render(<AssistantChat threadId="t-route" />);

    // Контекстът идва от сървърния ред, не от localStorage или URL.
    const bar = await screen.findByTestId("assistant-context-bar");
    expect(within(bar).getByText("Наем на офис")).toBeTruthy();
    // Историята на маршрутния разговор НЕ се изтрива от хидратацията.
    expect(await screen.findByText("въпрос по наема")).toBeTruthy();

    await typeAndSend("здрасти");
    await waitFor(() => expect(bodies.length).toBe(1));
    expect(bodies[0].threadId).toBe("t-route");
    expect(bodies[0].documentContext).toEqual({ kind: "saved_document", entityId: DOC_A });
  });

  it("избор на друг запазен разговор сменя видимия контекст от сървъра", async () => {
    db.threads = [
      thread({ id: "t-a", title: "Разговор А", context_kind: "analysis", context_entity_id: DOC_A, context_title: "Риск А" }),
      thread({ id: "t-b", title: "Разговор Б" }),
    ];
    render(<AssistantChat threadId="t-a" />);
    const bar = await screen.findByTestId("assistant-context-bar");
    expect(within(bar).getByText("Риск А")).toBeTruthy();

    await userEvent.click(screen.getAllByText("Разговор Б")[0]);
    // Общият разговор няма обвързване → лентата изчезва (без тихо пренасяне).
    await waitFor(() => expect(screen.queryByTestId("assistant-context-bar")).toBeNull());
  });
});

describe("видим контекст и изчистване", () => {
  it("показва избрания документ и го премахва по избор на потребителя", async () => {
    act(() => {
      setAssistantDocumentContext(
        { kind: "uploaded_contract", entityId: DOC_A, displayTitle: "Качен договор" },
        "owner-a",
      );
    });
    render(<AssistantChat />);
    const bar = await screen.findByTestId("assistant-context-bar");
    expect(within(bar).getByText("Качен договор")).toBeTruthy();
    await userEvent.click(within(bar).getByLabelText("Премахни избрания документ"));
    await waitFor(() => expect(screen.queryByTestId("assistant-context-bar")).toBeNull());
  });

  it("сървърното заглавие е авторитетно за етикета", async () => {
    act(() => {
      setAssistantDocumentContext(
        { kind: "saved_document", entityId: DOC_A, displayTitle: "клиентски етикет" },
        "owner-a",
      );
    });
    db.threads = [
      thread({ id: "t-1", title: "Наем", context_kind: "saved_document", context_entity_id: DOC_A, context_title: "Сървърно заглавие" }),
    ];
    fetchImpl = async () => {
      const { response, ctl } = sseResponse();
      ctl.push(evt("meta", {
        threadId: "t-1",
        documentContext: { kind: "saved_document", title: "Сървърно заглавие", truncated: true },
      }));
      ctl.close();
      return response;
    };
    render(<AssistantChat />);
    await typeAndSend("въпрос");
    const bar = await screen.findByTestId("assistant-context-bar");
    await waitFor(() => expect(within(bar).getByText("Сървърно заглавие")).toBeTruthy());
    expect(within(bar).getByText("(виждам само част от текста)")).toBeTruthy();
  });

  it("разговор, обвързан с друг документ, не се преизползва наготово", async () => {
    db.threads = [
      thread({ id: "t-other", title: "Друг документ", context_kind: "saved_document", context_entity_id: DOC_B, context_title: "Б" }),
    ];
    act(() => {
      setAssistantDocumentContext({ kind: "saved_document", entityId: DOC_A, displayTitle: "А" }, "owner-a");
    });
    render(<AssistantChat />);
    await typeAndSend("въпрос");
    await waitFor(() => expect(bodies.length).toBe(1));
    // Нов разговор за този обхват: никакво чуждо thread ID.
    expect(bodies[0].threadId).toBeNull();
    expect(bodies[0].documentContext).toEqual({ kind: "saved_document", entityId: DOC_A });
  });
});

describe("бърза смяна A→B→A", () => {
  it("закъснелите събития от изместена заявка се игнорират", async () => {
    const opened: Controllable[] = [];
    fetchImpl = async () => {
      const { response, ctl } = sseResponse();
      opened.push(ctl);
      return response;
    };
    act(() => {
      setAssistantDocumentContext({ kind: "saved_document", entityId: DOC_A, displayTitle: "А" }, "owner-a");
    });
    render(<AssistantChat />);
    await typeAndSend("по А");
    await waitFor(() => expect(opened.length).toBe(1));

    // Смяна към Б, после обратно към А — изместената заявка още „живее“.
    act(() => {
      setAssistantDocumentContext({ kind: "saved_document", entityId: DOC_B, displayTitle: "Б" }, "owner-a");
    });
    act(() => {
      setAssistantDocumentContext({ kind: "saved_document", entityId: DOC_A, displayTitle: "А" }, "owner-a");
    });

    await act(async () => {
      opened[0].push(evt("meta", { threadId: "late", documentContext: { kind: "saved_document", title: "ЗАКЪСНЯЛО" } }));
      opened[0].push(`data: ${JSON.stringify({ delta: "закъсняла делта" })}\n\n`);
      opened[0].push(evt("error", { message: "закъсняла грешка" }));
      opened[0].close();
      await Promise.resolve();
    });

    expect(screen.queryByText(/закъсняла делта/)).toBeNull();
    expect(screen.queryByText("ЗАКЪСНЯЛО")).toBeNull();
    expect(toastError).not.toHaveBeenCalledWith(expect.stringContaining("закъсняла грешка"));
    // Съобщенията от стария обхват не остават на екрана.
    expect(screen.queryByText("по А")).toBeNull();
    expect(localStorage.getItem("dogovaryai_active_thread:owner-a")).not.toBe("late");
  });
});

describe("unmount и StrictMode", () => {
  it("след unmount закъснял стрийм не обновява състояние", async () => {
    const opened: Controllable[] = [];
    fetchImpl = async () => {
      const { response, ctl } = sseResponse();
      opened.push(ctl);
      return response;
    };
    const view = render(<AssistantChat />);
    await typeAndSend("въпрос");
    await waitFor(() => expect(opened.length).toBe(1));
    view.unmount();
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a));
    await act(async () => {
      opened[0].push(`data: ${JSON.stringify({ delta: "късно" })}\n\n`);
      opened[0].close();
      await Promise.resolve();
    });
    expect(errors.filter((e) => String(e).includes("unmounted"))).toHaveLength(0);
    spy.mockRestore();
  });

  it("в StrictMode контекстът се показва точно веднъж", async () => {
    act(() => {
      setAssistantDocumentContext({ kind: "analysis", entityId: DOC_A, displayTitle: "Риск" }, "owner-a");
    });
    render(<StrictMode><AssistantChat /></StrictMode>);
    const bars = await screen.findAllByTestId("assistant-context-bar");
    expect(bars).toHaveLength(1);
  });
});

describe("изолация по акаунт", () => {
  it("контекстът на предишния профил не се показва след изход", async () => {
    act(() => {
      setAssistantDocumentContext({ kind: "saved_document", entityId: DOC_A, displayTitle: "Тайно заглавие" }, "owner-a");
    });
    currentUser = { id: "owner-b" };
    render(<AssistantChat />);
    await waitFor(() => expect(screen.queryByTestId("assistant-context-bar")).toBeNull());
    expect(screen.queryByText("Тайно заглавие")).toBeNull();
  });
});

describe("остарял контекст и възстановяване", () => {
  it("остарял анализ води до нов анализ, не до безкраен нов разговор", async () => {
    act(() => {
      setAssistantDocumentContext({ kind: "analysis", entityId: DOC_A, displayTitle: "Риск" }, "owner-a");
    });
    fetchImpl = async () => ({
      ok: false,
      json: async () => ({ code: "analysis_context_stale", error: "стар анализ" }),
    } as unknown as Response);
    render(<AssistantChat />);
    await typeAndSend("въпрос");
    const btn = await screen.findByTestId("assistant-context-reanalyze");
    expect(screen.queryByTestId("assistant-context-new-thread")).toBeNull();
    await userEvent.click(btn);
    expect(navigate).toHaveBeenCalledWith("/analyze");
  });

  it("остаряла версия на документ предлага нов разговор", async () => {
    act(() => {
      setAssistantDocumentContext({ kind: "saved_document", entityId: DOC_A, displayTitle: "Наем" }, "owner-a");
    });
    fetchImpl = async () => ({
      ok: false,
      json: async () => ({ code: "document_context_stale", error: "променен" }),
    } as unknown as Response);
    render(<AssistantChat />);
    await typeAndSend("въпрос");
    expect(await screen.findByTestId("assistant-context-new-thread")).toBeTruthy();
  });
});

describe("заявката и хранилището не носят съдържание", () => {
  it("изпраща само {kind, entityId} и не записва документа никъде", async () => {
    act(() => {
      setAssistantDocumentContext(
        { kind: "uploaded_contract", entityId: DOC_A, displayTitle: "Договор с Иван Петров" },
        "owner-a",
      );
    });
    render(<AssistantChat />);
    await typeAndSend("въпрос");
    await waitFor(() => expect(bodies.length).toBe(1));
    const body = bodies[0];
    expect(Object.keys(body.documentContext).sort()).toEqual(["entityId", "kind"]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("Иван Петров");
    expect(serialized).not.toContain("owner-a");
    const storage = JSON.stringify(localStorage);
    expect(storage).not.toContain("Иван Петров");
    expect(storage).not.toContain(DOC_A);
  });
});

describe("готовност на разговора преди изпращане", () => {
  it("не изпраща стара история, преди съобщенията на новия разговор да са заредени", async () => {
    db.threads = [thread({ id: "t-1", title: "Първи" })];
    db.messages["t-1"] = [{ id: "m1", role: "user", content: "стар въпрос" }];
    holdMessages();
    render(<AssistantChat threadId="t-1" />);

    const send = await screen.findByTestId("assistant-send");
    const input = screen.getByTestId("assistant-input");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("placeholder", "Зареждане на разговора...");
    await userEvent.type(input, "нов въпрос");
    await userEvent.keyboard("{Enter}");
    expect(fetch).not.toHaveBeenCalled();
    expect(send).toBeDisabled();

    await act(async () => { db.releaseMessages?.(); await Promise.resolve(); });
    await waitFor(() => expect(input).not.toBeDisabled());
    await userEvent.type(input, "нов въпрос");
    await waitFor(() => expect(send).not.toBeDisabled());
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(bodies[0].threadId).toBe("t-1");
  });

  it("липсващ разговор от маршрута не може да изпраща и предлага изход", async () => {
    db.threads = [];
    render(<AssistantChat threadId="t-missing" />);
    await screen.findByTestId("assistant-thread-unavailable");
    const input = screen.getByTestId("assistant-input");
    await userEvent.type(input, "въпрос");
    await userEvent.keyboard("{Enter}");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("недостъпен ред на разговора също остава без изпращане", async () => {
    db.threads = [thread({ id: "t-1" })];
    db.threadError = true;
    render(<AssistantChat threadId="t-1" />);
    await screen.findByTestId("assistant-thread-unavailable");
    const input = screen.getByTestId("assistant-input");
    await userEvent.type(input, "въпрос");
    await userEvent.keyboard("{Enter}");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("закъснели клиентски tool-ове", () => {
  it("смяна на обхвата преди таймера отменя навигацията", async () => {
    fetchImpl = async () => {
      const { response, ctl } = sseResponse();
      ctl.push(evt("meta", { threadId: "t-new" }));
      ctl.push(evt("tool_call", { name: "navigate", args: { path: "/catalog" } }));
      ctl.close();
      return response;
    };
    render(<AssistantChat />);
    await typeAndSend("въпрос");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    act(() => {
      setAssistantDocumentContext(
        { kind: "saved_document", entityId: DOC_B, displayTitle: "Друг" },
        "owner-a",
      );
    });
    await new Promise((r) => setTimeout(r, 700));
    expect(navigate).not.toHaveBeenCalledWith("/catalog");
  });
});

describe("грешка при зареждане на съобщенията", () => {
  it("неуспешно четене не се брои за готовност и предлага изход", async () => {
    db.threads = [thread({ id: "t-1", title: "Първи" })];
    db.messages["t-1"] = [{ id: "m1", role: "user", content: "стар въпрос" }];
    db.messagesError = true;
    render(<AssistantChat threadId="t-1" />);

    await screen.findByTestId("assistant-thread-unavailable");
    expect(screen.queryByText("стар въпрос")).toBeNull();
    const send = screen.getByTestId("assistant-send");
    expect(send).toBeDisabled();
    const input = screen.getByTestId("assistant-input");
    await userEvent.type(input, "нов въпрос");
    await userEvent.keyboard("{Enter}");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("смяна на разговор при ИДЕНТИЧЕН контекст", () => {
  async function switchWhileStreaming(threadsSetup: ThreadRow[], from: string, to: string) {
    const opened: Controllable[] = [];
    fetchImpl = async () => {
      const { response, ctl } = sseResponse();
      opened.push(ctl);
      return response;
    };
    db.threads = threadsSetup;
    db.messages[from] = [{ id: "m1", role: "user", content: "история А" }];
    db.messages[to] = [{ id: "m2", role: "user", content: "история Б" }];
    const view = render(<AssistantChat threadId={from} />);
    expect(await screen.findByText("история А")).toBeTruthy();
    const input = screen.getByTestId("assistant-input");
    await userEvent.type(input, "въпрос по А");
    await waitFor(() => expect(screen.getByTestId("assistant-send")).not.toBeDisabled());
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(opened.length).toBe(1));

    view.rerender(<AssistantChat threadId={to} />);
    expect(await screen.findByText("история Б")).toBeTruthy();

    await act(async () => {
      opened[0].push(evt("meta", { threadId: "late-thread" }));
      opened[0].push(`data: ${JSON.stringify({ delta: "закъсняла делта" })}\n\n`);
      opened[0].push(evt("error", { message: "закъсняла грешка" }));
      opened[0].push(evt("final_text", { content: "закъснял финал" }));
      opened[0].push(evt("tool_call", { name: "navigate", args: { path: "/catalog" } }));
      opened[0].close();
      await Promise.resolve();
    });
    await new Promise((r) => setTimeout(r, 700));

    expect(screen.queryByText(/закъсняла делта/)).toBeNull();
    expect(screen.queryByText(/закъснял финал/)).toBeNull();
    expect(screen.queryByText("въпрос по А")).toBeNull();
    expect(toastError).not.toHaveBeenCalledWith(expect.stringContaining("закъсняла грешка"));
    expect(navigate).not.toHaveBeenCalledWith("/catalog");
    expect(localStorage.getItem("dogovaryai_active_thread:owner-a")).not.toBe("late-thread");
    expect(await screen.findByText("история Б")).toBeTruthy();
  }

  it("два ОБЩИ разговора: закъснелите събития от А не влизат в Б", async () => {
    await switchWhileStreaming(
      [thread({ id: "g-a", title: "Общ А" }), thread({ id: "g-b", title: "Общ Б" })],
      "g-a",
      "g-b",
    );
  });

  it("два разговора по СЪЩИЯ документ: закъснелите събития не влизат", async () => {
    const ctx = { context_kind: "saved_document", context_entity_id: DOC_A, context_title: "Наем" };
    await switchWhileStreaming(
      [thread({ id: "d-a", title: "Док А", ...ctx }), thread({ id: "d-b", title: "Док Б", ...ctx })],
      "d-a",
      "d-b",
    );
  });
});

// Изолирано „отворено“ състояние: тестът проверява самия поток, не предварителния режим.
vi.mock("@/lib/prelaunch", async (orig) => ({
  ...(await orig<typeof import("@/lib/prelaunch")>()),
  canStartNewProcessing: () => true,
}));
