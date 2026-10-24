/**
 * Изборът на документ за DogovaryAI е СТРОГО за текущата сесия.
 * Изход и повторен вход в същия акаунт, както и смяна A→B, не бива да
 * възкресяват заглавие или ID от предишната сесия.
 */
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children?: import("react").ReactNode }) => children,
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/" }),
}));

type Handler = (event: string, session: unknown) => void;
let handler: Handler = () => {};
let initialSession: unknown = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Handler) => {
        handler = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getSession: async () => ({ data: { session: initialSession } }),
      signOut: async () => ({ error: null }),
    },
  },
}));

import { AuthProvider } from "@/hooks/useAuth";
import {
  clearAssistantDocumentContext,
  getAssistantDocumentContext,
  setAssistantDocumentContext,
} from "@/lib/assistantDocumentContext";

const UUID = "11111111-1111-4111-8111-111111111111";
const A = "owner-a";
const B = "owner-b";
const sess = (id: string) => ({ access_token: "tok", user: { id } });

beforeEach(() => {
  clearAssistantDocumentContext();
  initialSession = sess(A);
});
afterEach(() => clearAssistantDocumentContext());

async function mount() {
  render(<AuthProvider><div /></AuthProvider>);
  await waitFor(() => expect(typeof handler).toBe("function"));
}

describe("изолация на документния контекст по сесия", () => {
  it("изход и повторен вход в СЪЩИЯ акаунт не възкресяват контекста", async () => {
    await mount();
    setAssistantDocumentContext({ kind: "saved_document", entityId: UUID, displayTitle: "Наем" }, A);
    act(() => handler("SIGNED_OUT", null));
    expect(getAssistantDocumentContext(A)).toBeNull();
    act(() => handler("SIGNED_IN", sess(A)));
    expect(getAssistantDocumentContext(A)).toBeNull();
  });

  it("смяна на акаунт A→B изчиства контекста", async () => {
    await mount();
    setAssistantDocumentContext({ kind: "analysis", entityId: UUID, displayTitle: "Риск" }, A);
    act(() => handler("SIGNED_IN", sess(B)));
    expect(getAssistantDocumentContext(A)).toBeNull();
    expect(getAssistantDocumentContext(B)).toBeNull();
  });

  it("обновяване на токена за същия акаунт запазва контекста", async () => {
    await mount();
    await waitFor(() =>
      expect(setAssistantDocumentContext(
        { kind: "saved_document", entityId: UUID, displayTitle: "Наем" }, A,
      )).not.toBeNull());
    act(() => handler("TOKEN_REFRESHED", sess(A)));
    expect(getAssistantDocumentContext(A)?.entityId).toBe(UUID);
  });
});
