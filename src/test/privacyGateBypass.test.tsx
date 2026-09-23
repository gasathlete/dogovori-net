/**
 * Затваряне на заобикалящите пътища след първата преграда:
 *  - диалогът за приложение вече не качва суров файл (и не пише в базата);
 *  - записът на текст/име на качен документ спира ПРЕДИ хеширане и заявка.
 * Нито един тест не прави мрежова заявка и не ползва реален документ.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload: () => { throw new Error("no network in test"); } }) },
    from: () => ({ insert: () => { throw new Error("no network in test"); } }),
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

import { ReferencePromptDialog } from "@/components/ReferencePromptDialog";
import {
  useUploadedContractDoc,
  type Contact,
  type Contract,
  type DbResult,
  type UploadedDocApi,
} from "@/hooks/useUploadedContractDoc";
import { RAW_FILE_BLOCKED_TITLE } from "@/lib/privacyGate";

// СИНТЕТИЧНА стойност с достоверна дата и грешна контролна сума.
const EGN = "8012129999";
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

function api(state: { hashCalls: number; updates: unknown[] }): UploadedDocApi {
  return {
    loadContract: () => Promise.resolve({ data: row(), error: null } as DbResult<Contract>),
    loadLatestAnalysis: () => Promise.resolve({ data: null, error: null }),
    loadContacts: () => Promise.resolve({ data: [] as Contact[], error: null }),
    loadSavedCopyId: () => Promise.resolve({ data: { id: "copy-1" }, error: null }),
    updateContract: (_id, patch) => {
      state.updates.push(patch);
      return Promise.resolve({ data: row(), error: null } as DbResult<Contract>);
    },
    updateContactLink: () => Promise.resolve({ data: row(), error: null } as DbResult<Contract>),
    updateSavedCopy: () => Promise.resolve({ data: null, error: null }),
    createSavedCopy: () => Promise.resolve({ data: { id: "copy-2" }, error: null }),
    hashText: () => {
      state.hashCalls++;
      return Promise.resolve("h1");
    },
  };
}

describe("преграда — затворени заобикалящи пътища", () => {
  it("диалогът за приложение не предлага качване на файл, но изготвянето остава", () => {
    render(
      <MemoryRouter>
        <ReferencePromptDialog
          reference={{
            id: "ref-1",
            type: "appendix",
            number: 1,
            displayLabel: "Приложение №1",
            documentTypeId: "appendix",
          } as never}
          parentSavedId="saved-1"
          parentUploadedId={null}
          onClose={() => {}}
          onLinked={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("appendix-upload-blocked")).toBeTruthy();
    expect(screen.getByText(RAW_FILE_BLOCKED_TITLE)).toBeTruthy();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getAllByText(/изготви го с AI/).length).toBeGreaterThan(0);
  });

  it("запис на текст с ЕГН спира ПРЕДИ хеширане и ПРЕДИ заявка", async () => {
    const state = { hashCalls: 0, updates: [] as unknown[] };
    const view = renderHook(() =>
      useUploadedContractDoc({ docId: "doc-1", userId: "user-1", api: api(state) }),
    );
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    await act(async () => void view.result.current.setEditText(`${LONG} ЕГН ${EGN}`));

    let outcome = "";
    await act(async () => {
      outcome = await view.result.current.saveText();
    });
    expect(outcome).toBe("blocked");
    expect(state.hashCalls).toBe(0);
    expect(state.updates).toEqual([]);
  });

  it("чист текст се записва нормално — функцията не е счупена", async () => {
    const state = { hashCalls: 0, updates: [] as unknown[] };
    const view = renderHook(() =>
      useUploadedContractDoc({ docId: "doc-1", userId: "user-1", api: api(state) }),
    );
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    await act(async () => void view.result.current.setEditText(`${LONG} чист текст`));
    let outcome = "";
    await act(async () => {
      outcome = await view.result.current.saveText();
    });
    expect(outcome).toBe("saved");
    expect(state.hashCalls).toBe(1);
    expect(state.updates.length).toBe(1);
  });

  it("име на документ с IBAN не се записва", async () => {
    const state = { hashCalls: 0, updates: [] as unknown[] };
    const view = renderHook(() =>
      useUploadedContractDoc({ docId: "doc-1", userId: "user-1", api: api(state) }),
    );
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    await act(async () => void view.result.current.setTitleDraft("IBAN BG80BNBG96611020345678"));
    let outcome = "";
    await act(async () => {
      outcome = await view.result.current.saveTitle();
    });
    expect(outcome).toBe("blocked");
    expect(state.updates).toEqual([]);
  });
});
