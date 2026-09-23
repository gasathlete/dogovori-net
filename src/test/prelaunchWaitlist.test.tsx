import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { buildWaitlistArgs, isFeatureAvailable, PRELAUNCH_COPY, PRELAUNCH_FEATURES } from "@/lib/prelaunch";
import { openPrelaunchWaitlist, submitPrelaunchWaitlist } from "@/lib/prelaunchWaitlist";
import { PrelaunchWaitlistDialog } from "@/components/prelaunch/PrelaunchWaitlistDialog";

beforeEach(() => rpc.mockReset());

describe("prelaunch флагове", () => {
  it("всички функции са затворени, непознато име също", () => {
    for (const f of PRELAUNCH_FEATURES) expect(isFeatureAvailable(f)).toBe(false);
    expect(isFeatureAvailable("x")).toBe(false);
  });
  it("текстът е дословен и не обещава отстъпка или дата", () => {
    expect(PRELAUNCH_COPY.body).toContain("Ще Ви информираме, когато изпълним необходимите законови изисквания");
    const all = Object.values(PRELAUNCH_COPY).join(" ");
    expect(all).not.toMatch(/%|\d{1,2}\.\d{1,2}\.\d{4}|отстъпк/);
  });
});

describe("заявка", () => {
  it("без съгласие или с лош имейл не вика сървъра", async () => {
    expect(buildWaitlistArgs({ email: "a@b.bg", feature: "assistant", consent: false })).toBeNull();
    expect(await submitPrelaunchWaitlist({ email: "лош", feature: "assistant", consent: true })).toBe("invalid");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("липсваща функция на сървъра = unavailable, не „приета“", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await submitPrelaunchWaitlist({ email: "A@B.bg ", feature: "blank_download", consent: true })).toBe("unavailable");
    expect(rpc).toHaveBeenCalledWith("request_prelaunch_waitlist", expect.objectContaining({ _email: "a@b.bg", _consent: true }));
  });
  it("само data===true е приета", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await submitPrelaunchWaitlist({ email: "a@b.bg", feature: "assistant", consent: true })).toBe("accepted");
  });
});

describe("диалог", () => {
  it("отметката не е предварително отметната; грешка на сървъра показва честно съобщение", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "x" } });
    render(<MemoryRouter><PrelaunchWaitlistDialog /></MemoryRouter>);
    act(() => openPrelaunchWaitlist("blank_download"));
    const box = await screen.findByRole("checkbox");
    expect(box).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: PRELAUNCH_COPY.submit })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(PRELAUNCH_COPY.emailLabel), { target: { value: "a@b.bg" } });
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: PRELAUNCH_COPY.submit }));
    await waitFor(() => expect(screen.getByText(PRELAUNCH_COPY.unavailable)).toBeInTheDocument());
    expect(screen.queryByText(PRELAUNCH_COPY.success)).toBeNull();
  });
});

describe("свързване", () => {
  const wizard = readFileSync("src/pages/Wizard.tsx", "utf8");
  const chip = readFileSync("src/components/CompanionChip.tsx", "utf8");
  it("бланка и генериране отварят заявката преди invoke/auth", () => {
    const blank = wizard.slice(wizard.indexOf("const runBlankDownload"));
    expect(blank.indexOf('openPrelaunchWaitlist("blank_download")')).toBeLessThan(blank.indexOf('"download-blank"'));
    const gen = wizard.slice(wizard.indexOf("const handleGenerate = async"));
    expect(gen.indexOf('openPrelaunchWaitlist("document_generation")')).toBeLessThan(gen.indexOf("generateContractJob"));
    const h = chip.slice(chip.indexOf("const handle = async"));
    expect(h.indexOf("openPrelaunchWaitlist")).toBeLessThan(h.indexOf("downloadDocument("));
  });
  it("миграцията дава на anon само заявка, не четене/изтриване", () => {
    const sql = readFileSync("docs/migrations/stage_prelaunch_waitlist.sql", "utf8");
    expect(sql).toContain("REVOKE ALL ON TABLE public.prelaunch_waitlist FROM PUBLIC, anon, authenticated");
    expect(sql).toMatch(/withdraw_prelaunch_waitlist\(text\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toContain("retention_until timestamptz NULL");
  });
});
