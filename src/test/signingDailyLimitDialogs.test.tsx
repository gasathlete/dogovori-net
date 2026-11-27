import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";

const invoke = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));
vi.mock("@/lib/docFunnel", () => ({ trackSign: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const rows = (table: string) => ({ select: () => ({ in: () => Promise.resolve({ data: table === "saved_documents" ? [{ id: "s1", title: "Документ 1", payload: {} }, { id: "s2", title: "Документ 2", payload: {} }] : [] }) }) });
  return { supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, from: rows } };
});

import { MultiPartySigningDialog } from "@/components/MultiPartySigningDialog";
import { KitBulkSigningDialog } from "@/components/KitBulkSigningDialog";
import { DAILY_INVITE_LIMIT_MESSAGE } from "@/lib/signingErrors";

// supabase-js surfaces a non-2xx reply as FunctionsHttpError with data=null.
const limitReply = () => ({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: "daily_invite_limit", message: "x" }), { status: 429 })) });

function fillSigners() {
  screen.getAllByPlaceholderText("Име").forEach((el, i) => fireEvent.change(el, { target: { value: `Лице ${i}` } }));
  screen.getAllByPlaceholderText("Имейл").forEach((el, i) => fireEvent.change(el, { target: { value: `l${i}@example.test` } }));
}

beforeEach(() => { invoke.mockReset(); toastError.mockReset(); });

describe("daily invitation limit (429) in signing dialogs", () => {
  it("individual dialog shows the plain limit message, not a technical error", async () => {
    invoke.mockResolvedValue(limitReply());
    render(<MemoryRouter><MultiPartySigningDialog open onOpenChange={() => {}} title="Т" documentSnapshot={{}} isPro /></MemoryRouter>);
    fillSigners();
    fireEvent.click(screen.getByRole("button", { name: /Създай заявка за подпис/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(DAILY_INVITE_LIMIT_MESSAGE));
    expect(toastError.mock.calls.flat().join(" ")).not.toMatch(/non-2xx|daily_invite_limit/);
  });

  it("kit dialog shows the limit message and stops sending further items", async () => {
    invoke.mockResolvedValue(limitReply());
    const item = (id: string) => ({ id, kit_id: "k", role: "primary" as const, ref_label: id, saved_id: id, uploaded_id: null, planned_doc_name: null, position: 0, created_at: "" });
    render(<MemoryRouter><KitBulkSigningDialog open onOpenChange={() => {}} kitTitle="Комплект" items={[item("s1"), item("s2")]} isPro /></MemoryRouter>);
    await screen.findAllByPlaceholderText("Име");
    fillSigners();
    const submit = await screen.findByRole("button", { name: /Изпрати|Създай/ });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(DAILY_INVITE_LIMIT_MESSAGE));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(DAILY_INVITE_LIMIT_MESSAGE)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/non-2xx|daily_invite_limit/);
  });
});
