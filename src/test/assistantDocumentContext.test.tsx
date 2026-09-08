/**
 * Q2e — избор на документен контекст за DogovaryAI.
 * Само метаданни; никакви мрежови, AI или DB повиквания.
 */
import { cleanup, render, renderHook, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

const setSection = vi.fn();
let tabs: Array<{ id: string; dirty?: boolean }> = [];
vi.mock("@/hooks/useConsoleStore", () => ({
  useConsoleStore: () => ({ state: { tabs }, setSection }),
}));

let currentUser: { id: string } | null = { id: "owner-a" };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: currentUser }) }));

import { AskDogovaryAIButton } from "@/components/console/AskDogovaryAIButton";
import {
  clearAssistantDocumentContext,
  contextIdentityKey,
  getAssistantDocumentContext,
  makeAssistantDocumentContext,
  sameContextTarget,
  setAssistantDocumentContext,
  toRequestContext,
  useAssistantDocumentContext,
  DISPLAY_TITLE_MAX,
} from "@/lib/assistantDocumentContext";

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-9222-222222222222";
const A = "owner-a";
const B = "owner-b";

beforeEach(() => {
  clearAssistantDocumentContext();
  navigate.mockClear();
  setSection.mockClear();
  toastError.mockClear();
  tabs = [];
  currentUser = { id: A };
});
afterEach(cleanup);

describe("метаданни на контекста", () => {
  it("приема само пълен валиден вход", () => {
    expect(makeAssistantDocumentContext({ kind: "analysis", entityId: UUID, displayTitle: " А " }))
      .toEqual({ kind: "analysis", entityId: UUID, displayTitle: "А" });
    for (const bad of [null, "x", [], { kind: "x", entityId: UUID }, { kind: "analysis", entityId: "no" }]) {
      expect(makeAssistantDocumentContext(bad)).toBeNull();
    }
  });

  it("ограничава етикета и дава резервно име", () => {
    const c = makeAssistantDocumentContext({ kind: "uploaded_contract", entityId: UUID, displayTitle: "я".repeat(500) })!;
    expect(c.displayTitle.length).toBe(DISPLAY_TITLE_MAX);
    expect(makeAssistantDocumentContext({ kind: "uploaded_contract", entityId: UUID })!.displayTitle)
      .toBe("Качен документ");
  });

  it("заявката носи само вид и ID", () => {
    const c = makeAssistantDocumentContext({ kind: "saved_document", entityId: UUID, displayTitle: "Наем" })!;
    expect(toRequestContext(c)).toEqual({ kind: "saved_document", entityId: UUID });
    expect(toRequestContext(null)).toBeNull();
  });

  it("идентичността различава обхватите", () => {
    const a = makeAssistantDocumentContext({ kind: "analysis", entityId: UUID })!;
    const b = makeAssistantDocumentContext({ kind: "analysis", entityId: UUID2 })!;
    expect(sameContextTarget(a, { ...a, displayTitle: "друго" })).toBe(true);
    expect(sameContextTarget(a, b)).toBe(false);
    expect(contextIdentityKey(null)).toBe("general");
    expect(contextIdentityKey(a)).not.toBe(contextIdentityKey(b));
  });

  it("не пише в localStorage", () => {
    const spy = vi.spyOn(window.localStorage.__proto__, "setItem");
    setAssistantDocumentContext({ kind: "analysis", entityId: UUID, displayTitle: "А" }, A);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("изолация по акаунт", () => {
  it("без собственик контекстът не се записва и не се чете", () => {
    expect(setAssistantDocumentContext({ kind: "analysis", entityId: UUID }, null)).toBeNull();
    setAssistantDocumentContext({ kind: "analysis", entityId: UUID, displayTitle: "А" }, A);
    expect(getAssistantDocumentContext(null)).toBeNull();
    expect(getAssistantDocumentContext(undefined)).toBeNull();
    expect(getAssistantDocumentContext(A)?.entityId).toBe(UUID);
  });

  it("след изход контекстът на профила изчезва", () => {
    setAssistantDocumentContext({ kind: "saved_document", entityId: UUID, displayTitle: "Наем" }, A);
    clearAssistantDocumentContext();
    expect(getAssistantDocumentContext(A)).toBeNull();
  });

  it("друг профил не вижда заглавието или ID-то на предишния", () => {
    setAssistantDocumentContext({ kind: "saved_document", entityId: UUID, displayTitle: "Наем на офис" }, A);
    expect(getAssistantDocumentContext(B)).toBeNull();
    const own = setAssistantDocumentContext({ kind: "analysis", entityId: UUID2, displayTitle: "Риск" }, B);
    expect(own?.entityId).toBe(UUID2);
    expect(getAssistantDocumentContext(A)).toBeNull();
  });

  it("hook-ът показва само контекста на текущия профил", () => {
    const { result, rerender } = renderHook(({ owner }: { owner: string | null }) => useAssistantDocumentContext(owner), {
      initialProps: { owner: A as string | null },
    });
    act(() => { setAssistantDocumentContext({ kind: "analysis", entityId: UUID, displayTitle: "А" }, A); });
    expect(result.current?.entityId).toBe(UUID);
    rerender({ owner: B });
    expect(result.current).toBeNull();
    rerender({ owner: null });
    expect(result.current).toBeNull();
  });

  it("чужд собственик не може да изчисти контекста", () => {
    setAssistantDocumentContext({ kind: "analysis", entityId: UUID, displayTitle: "А" }, A);
    clearAssistantDocumentContext(B);
    expect(getAssistantDocumentContext(A)?.entityId).toBe(UUID);
  });
});

describe("абонати в React (вкл. StrictMode)", () => {
  it("получават промените и се отписват чисто", () => {
    const { result, unmount } = renderHook(() => useAssistantDocumentContext(A), { wrapper: StrictMode });
    expect(result.current).toBeNull();
    act(() => { setAssistantDocumentContext({ kind: "analysis", entityId: UUID, displayTitle: "А" }, A); });
    expect(result.current?.entityId).toBe(UUID);
    act(() => { clearAssistantDocumentContext(A); });
    expect(result.current).toBeNull();
    unmount();
    expect(() => setAssistantDocumentContext({ kind: "analysis", entityId: UUID }, A)).not.toThrow();
  });
});

describe("бутон „Попитай DogovaryAI“", () => {
  it("избира документа и отваря разговора", async () => {
    render(<AskDogovaryAIButton kind="saved_document" entityId={UUID} displayTitle="Наем" />);
    await userEvent.click(screen.getByTestId("ask-dogovaryai"));
    expect(getAssistantDocumentContext(A)).toEqual({
      kind: "saved_document", entityId: UUID, displayTitle: "Наем",
    });
    expect(setSection).toHaveBeenCalledWith("assistant");
    expect(navigate).toHaveBeenCalledWith("/console/assistant");
  });

  it("отказва при незапазени промени", async () => {
    tabs = [{ id: "tab-1", dirty: true }];
    render(<AskDogovaryAIButton kind="saved_document" entityId={UUID} displayTitle="Наем" tabId="tab-1" />);
    await userEvent.click(screen.getByTestId("ask-dogovaryai"));
    expect(getAssistantDocumentContext(A)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("работи при запазен таб", async () => {
    tabs = [{ id: "tab-1", dirty: false }];
    render(<AskDogovaryAIButton kind="analysis" entityId={UUID2} displayTitle="Риск" tabId="tab-1" />);
    await userEvent.click(screen.getByTestId("ask-dogovaryai"));
    expect(getAssistantDocumentContext(A)?.kind).toBe("analysis");
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("остарял анализ не може да бъде избран и обяснява защо", async () => {
    render(
      <AskDogovaryAIButton
        kind="analysis"
        entityId={UUID2}
        displayTitle="Риск"
        disabled
        disabledReason="Направете нов анализ."
      />,
    );
    await userEvent.click(screen.getByTestId("ask-dogovaryai"));
    expect(getAssistantDocumentContext(A)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("без влязъл профил не избира документ", async () => {
    currentUser = null;
    render(<AskDogovaryAIButton kind="saved_document" entityId={UUID} displayTitle="Наем" />);
    await userEvent.click(screen.getByTestId("ask-dogovaryai"));
    expect(getAssistantDocumentContext(A)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
