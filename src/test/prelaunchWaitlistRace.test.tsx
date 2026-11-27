import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { PRELAUNCH_COPY, PRELAUNCH_LABELS } from "@/lib/prelaunch";
import { openPrelaunchWaitlist } from "@/lib/prelaunchWaitlist";
import { PrelaunchWaitlistDialog } from "@/components/prelaunch/PrelaunchWaitlistDialog";

type Res = { data: unknown; error: unknown };
function deferred() {
  let resolve!: (v: Res) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Res>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function mount() {
  return render(<MemoryRouter><PrelaunchWaitlistDialog /></MemoryRouter>);
}
async function fillAndSubmit(email = "a@b.bg") {
  fireEvent.change(await screen.findByLabelText(PRELAUNCH_COPY.emailLabel), { target: { value: email } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: PRELAUNCH_COPY.submit }));
}

beforeEach(() => rpc.mockReset());

describe("диалог: остарели отговори", () => {
  it("успех след затваряне и ново отваряне не се показва в новата форма", async () => {
    const d = deferred();
    rpc.mockReturnValueOnce(d.promise);
    mount();
    act(() => openPrelaunchWaitlist("assistant"));
    await fillAndSubmit();
    expect(screen.getByRole("button", { name: PRELAUNCH_LABELS.sending })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: PRELAUNCH_COPY.close }));
    act(() => openPrelaunchWaitlist("assistant"));
    await act(async () => { d.resolve({ data: true, error: null }); });
    await flush();
    expect(screen.queryByText(PRELAUNCH_COPY.success)).toBeNull();
    expect(screen.getByLabelText(PRELAUNCH_COPY.emailLabel)).toHaveValue("");
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("button", { name: PRELAUNCH_LABELS.sending })).toBeNull();
  });

  it("отказ след ново отваряне не показва грешка и не оставя „зает“", async () => {
    const d = deferred();
    rpc.mockReturnValueOnce(d.promise);
    mount();
    act(() => openPrelaunchWaitlist("assistant"));
    await fillAndSubmit();
    fireEvent.click(screen.getByRole("button", { name: PRELAUNCH_COPY.close }));
    act(() => openPrelaunchWaitlist("assistant"));
    await act(async () => { d.reject(new Error("net")); });
    await flush();
    expect(screen.queryByText(PRELAUNCH_COPY.unavailable)).toBeNull();
    expect(screen.getByRole("button", { name: PRELAUNCH_COPY.submit })).toBeInTheDocument();
  });

  it("друга функция по време на чакаща заявка: старият успех не се прилага, новата заявка е независима", async () => {
    const first = deferred();
    const second = deferred();
    rpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mount();
    act(() => openPrelaunchWaitlist("assistant"));
    await fillAndSubmit("a@b.bg");
    act(() => openPrelaunchWaitlist("document_review"));
    await fillAndSubmit("c@d.bg");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toMatchObject({ _feature: "document_review", _email: "c@d.bg" });
    await act(async () => { first.resolve({ data: true, error: null }); });
    await flush();
    expect(screen.queryByText(PRELAUNCH_COPY.success)).toBeNull();
    expect(screen.getByRole("button", { name: PRELAUNCH_LABELS.sending })).toBeDisabled();
    await act(async () => { second.resolve({ data: false, error: null }); });
    await flush();
    expect(screen.getByText(PRELAUNCH_COPY.unavailable)).toBeInTheDocument();
  });

  it("бързо двойно изпращане = една заявка; полетата са заключени докато чака", async () => {
    const d = deferred();
    rpc.mockReturnValue(d.promise);
    mount();
    act(() => openPrelaunchWaitlist("assistant"));
    await fillAndSubmit();
    const form = screen.getByLabelText(PRELAUNCH_COPY.emailLabel).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(PRELAUNCH_COPY.emailLabel)).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    await act(async () => { d.resolve({ data: true, error: null }); });
    await flush();
    expect(screen.getByText(PRELAUNCH_COPY.success)).toBeInTheDocument();
  });

  it("само data===true е приета; truthy различно от true не е", async () => {
    rpc.mockResolvedValue({ data: "true", error: null });
    mount();
    act(() => openPrelaunchWaitlist("assistant"));
    await fillAndSubmit();
    await flush();
    expect(screen.queryByText(PRELAUNCH_COPY.success)).toBeNull();
    expect(screen.getByText(PRELAUNCH_COPY.unavailable)).toBeInTheDocument();
  });

  it("демонтиране по време на заявка не хвърля и не обновява", async () => {
    const d = deferred();
    rpc.mockReturnValueOnce(d.promise);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = mount();
    act(() => openPrelaunchWaitlist("assistant"));
    await fillAndSubmit();
    view.unmount();
    await act(async () => { d.resolve({ data: true, error: null }); });
    await flush();
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("неизвестен изход не твърди, че нищо не е записано", () => {
    expect(PRELAUNCH_COPY.unavailable).not.toMatch(/Нищо не е записано/);
    expect(PRELAUNCH_COPY.unavailable).toMatch(/не успяхме да потвърдим/i);
  });
});
