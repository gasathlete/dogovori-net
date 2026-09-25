import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  from: vi.fn(),
  invoke: vi.fn(),
  refreshSession: vi.fn(),
  getSession: vi.fn(),
  upload: vi.fn(),
  track: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: h.from,
    functions: { invoke: h.invoke },
    auth: { refreshSession: h.refreshSession, getSession: h.getSession },
    storage: { from: () => ({ upload: h.upload }) },
    rpc: vi.fn(),
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u-synthetic" } }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }));
vi.mock("@/lib/extractContractText", () => ({
  extractTextFromFile: vi.fn(),
  sha256Hex: vi.fn(async () => "0".repeat(64)),
}));

import { UploadContractDialog } from "@/components/UploadContractDialog";
import { PRELAUNCH_WAITLIST_EVENT } from "@/lib/prelaunchWaitlist";
import { UploadStepError, uploadFailureReason } from "@/lib/uploadFailureReason";
import { RestrictedIdentifierError } from "@/lib/privacyGate";
import * as extract from "@/lib/extractContractText";

beforeEach(() => Object.values(h).forEach((f) => f.mockReset()));

describe("UploadContractDialog в предварителен режим", () => {
  it("„Качи и анализирай“ отваря заявката преди хеш, сесия, запис или AI", async () => {
    const events: string[] = [];
    const on = (e: Event) => events.push((e as CustomEvent<{ feature: string }>).detail.feature);
    window.addEventListener(PRELAUNCH_WAITLIST_EVENT, on);
    render(<MemoryRouter><UploadContractDialog folders={[]} contacts={[]} onUploaded={() => undefined} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Добави договор/ }));
    fireEvent.change(await screen.findByPlaceholderText(/Поставете пълния текст/), { target: { value: "Синтетичен текст ".repeat(10) } });
    fireEvent.change(screen.getByPlaceholderText(/напр\. Договор/), { target: { value: "Синтетично заглавие" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Качи и анализирай" })); });
    window.removeEventListener(PRELAUNCH_WAITLIST_EVENT, on);
    expect(events).toEqual(["document_review"]);
    expect(extract.sha256Hex).not.toHaveBeenCalled();
    expect(h.from).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.refreshSession).not.toHaveBeenCalled();
    expect(h.upload).not.toHaveBeenCalled();
  });
  it("не рекламира „само запис“ на нов текст (забранен от 0044)", async () => {
    render(<MemoryRouter><UploadContractDialog folders={[]} contacts={[]} onUploaded={() => undefined} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Добави договор/ }));
    await screen.findByRole("button", { name: "Качи и анализирай" });
    expect(screen.queryByRole("button", { name: /Качи без анализ/ })).toBeNull();
  });
});

describe("uploadFailureReason", () => {
  it("връща само затворени кодове, без текст от съобщението", () => {
    expect(uploadFailureReason(new UploadStepError("save_failed", "x"))).toBe("save_failed");
    expect(uploadFailureReason(new RestrictedIdentifierError(["iban"]))).toBe("restricted_identifiers");
    expect(uploadFailureReason(new Error("duplicate key for Иван Петров dogovor.pdf"))).toBe("unknown");
    expect(uploadFailureReason(new Error("Failed to fetch"))).toBe("network");
    expect(uploadFailureReason("ivan@example.test")).toBe("unknown");
  });
});
