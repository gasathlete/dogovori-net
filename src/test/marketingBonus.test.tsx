import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), getSession: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke }, auth: { getSession: mocks.getSession } } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/queryClient", () => ({ queryClient: { invalidateQueries: mocks.invalidate } }));
import { MarketingBonusDialog } from "@/components/MarketingBonusDialog";
import { fetchWithMarketingBonus, invokeWithMarketingBonus, isInsufficientCredit } from "@/lib/marketingBonus";
const denied = { data: { error: "quota_exceeded", charge_state: "not_charged" }, error: null };
let claimed: boolean;
beforeEach(() => {
  vi.clearAllMocks(); claimed = false;
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
  mocks.invalidate.mockResolvedValue(undefined);
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "marketing_bonus_status") return { data: { eligible: !claimed, bonus_ops: 3 }, error: null };
    claimed = true;
    return { data: { ok: true, granted: true }, error: null };
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mount = () => render(<MemoryRouter><MarketingBonusDialog /></MemoryRouter>);
async function accept() {
  await screen.findByRole("checkbox");
  await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeDisabled());
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Получете бонуса и продължете" }));
}
describe("one-time consent recovery", () => {
  it("dismiss makes no claim or replay; next user attempt reoffers unchecked", async () => {
    mount(); mocks.invoke.mockResolvedValue(denied);
    const first = invokeWithMarketingBonus("analyze-contract", { body: { operation_id: "same" } });
    await screen.findByRole("checkbox");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Получете бонуса и продължете" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Не сега" }));
    await first;
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "claim_marketing_bonus")).toHaveLength(0);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const second = invokeWithMarketingBonus("analyze-contract", { body: { operation_id: "same" } });
    await screen.findByRole("checkbox"); expect(screen.getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Не сега" })); await second;
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });
  it.each(["generate-contract", "build-custom-contract", "review-contract", "refine-contract", "apply-corrections", "correct-uploaded", "analyze-contract", "download-document", "download-blank", "save-document", "saved-document-content", "generate-linked-document", "negotiation-strategy", "generate-job", "ocr-contract"])("%s replays identical inputs once only after confirmed grant and refresh", async (name) => {
    mount();
    mocks.invoke.mockResolvedValueOnce(denied).mockResolvedValueOnce({ data: { ok: true }, error: null });
    const options = { body: { action: "start", operation_id: "stable", text: "unchanged input" } };
    const pending = invokeWithMarketingBonus(name, options);
    await accept();
    expect((await pending).data).toEqual({ ok: true });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invoke.mock.calls[0][1]).toBe(options); expect(mocks.invoke.mock.calls[1][1]).toBe(options);
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["download-quota", "u1"] });
    const args = mocks.rpc.mock.calls.find(([n]) => n === "claim_marketing_bonus")?.[1];
    expect(args).toMatchObject({ _accept: true, _version: "2026-10-21" });
  });
  it("already claimed suppresses offer and replay", async () => {
    claimed = true; mount(); mocks.invoke.mockResolvedValue(denied);
    await invokeWithMarketingBonus("download-document", { body: {} });
    expect(screen.queryByRole("checkbox")).toBeNull(); expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it("reads SDK HTTP denial from a clone, leaving caller error body readable", async () => {
    mount();
    const context = new Response(JSON.stringify({ code: "quota_exceeded" }), { status: 402 });
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { context } }).mockResolvedValueOnce({ data: { ok: true }, error: null });
    const pending = invokeWithMarketingBonus("download-document", { body: { operation_id: "same" } });
    await accept(); await pending;
    expect(await context.json()).toEqual({ code: "quota_exceeded" });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });
  it("server failure keeps checkbox dialog and input request pending; retry succeeds", async () => {
    mount(); mocks.invoke.mockResolvedValueOnce(denied).mockResolvedValueOnce({ data: { ok: true }, error: null });
    const original = mocks.rpc.getMockImplementation();
    let failed = false;
    mocks.rpc.mockImplementation(async (...args) => {
      if (args[0] === "claim_marketing_bonus" && !failed) { failed = true; return { data: null, error: { message: "offline" } }; }
      return original?.(...args);
    });
    const pending = invokeWithMarketingBonus("analyze-contract", { body: { input: "preserved" } });
    await accept(); await screen.findByRole("alert"); expect(mocks.invoke).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Получете бонуса и продължете" }));
    await pending; expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });
  it("concurrent attempts queue; no repeated checked consent or second claim", async () => {
    mount(); mocks.invoke.mockResolvedValue(denied);
    const a = invokeWithMarketingBonus("analyze-contract", { body: { id: "a" } });
    const b = invokeWithMarketingBonus("download-document", { body: { id: "b" } });
    await accept(); await Promise.all([a,b]);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "claim_marketing_bonus")).toHaveLength(1);
    expect(mocks.invoke).toHaveBeenCalledTimes(3);
  });
  it("streaming assistant retains exact body and operation id across grant", async () => {
    mount(); const network = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ code: "ai_free_limit_reached" }), { status: 402 })).mockResolvedValueOnce(new Response("data: result\n\n"));
    vi.stubGlobal("fetch", network);
    const init = { method: "POST", body: JSON.stringify({ operationId: "same", message: "original" }) };
    const pending = fetchWithMarketingBonus("http://localhost/assistant", init);
    await accept(); expect((await pending).ok).toBe(true);
    expect(network.mock.calls[0][1]).toBe(init); expect(network.mock.calls[1][1]).toBe(init);
  });
  it("status polling and payment/privacy/auth denials never offer marketing", async () => {
    mount(); mocks.invoke.mockResolvedValue(denied);
    await invokeWithMarketingBonus("generate-job", { body: { action: "status" } });
    await invokeWithMarketingBonus("create-checkout", { body: {} });
    expect(mocks.rpc).not.toHaveBeenCalled();
    for (const code of ["privacy_blocked", "unauthenticated", "entrepreneur_required", "product_payment_required", "quota_unavailable"]) expect(isInsufficientCredit({ code }, 402)).toBe(false);
  });
});