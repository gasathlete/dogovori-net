/**
 * Lead magnet диалог — поведение: директно сваляне без имейл/запис, отделен
 * незадължителен opt-in, събития без лични данни, времеви правила, достъпност.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { trackFunnelEvent, rpc } = vi.hoisted(() => ({
  trackFunnelEvent: vi.fn<(name: string, props?: Record<string, unknown>) => boolean>(() => true),
  rpc: vi.fn<(fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>(),
}));
vi.mock("@/lib/funnel", () => ({ trackFunnelEvent }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args) },
}));

import { ExitIntentLeadMagnet } from "@/components/funnel/ExitIntentLeadMagnet";
import { COOKIE_POLICY_VERSION } from "@/lib/analytics";
import {
  LEAD_MAGNET_DESKTOP_DWELL_MS,
  LEAD_MAGNET_DISMISS_KEY,
  LEAD_MAGNET_MOBILE_DWELL_MS,
  LEAD_MAGNET_SHOWN_KEY,
} from "@/lib/leadMagnetTrigger";

const ALLOWED_PROP_KEYS = new Set(["reason", "magnet", "source_group"]);

// jsdom няма ResizeObserver; Radix Checkbox го ползва за размера на скрития input.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function decideCookies() {
  localStorage.setItem(
    "cookie-prefs-v2",
    JSON.stringify({
      necessary: true,
      analytics: true,
      marketing: false,
      version: COOKIE_POLICY_VERSION,
      decided_at: "2026-09-01T00:00:00Z",
    }),
  );
}

function setMobile(mobile: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: mobile && /max-width:\s*768px/.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom не реализира навигация: спираме подразбиращото се действие на връзката за
// сваляне на capture фаза; React onClick на компонента се изпълнява нормално.
function stopAnchorNavigation(e: Event) {
  const target = e.target as Element | null;
  if (target?.closest?.("a[download]")) e.preventDefault();
}

function mount(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ExitIntentLeadMagnet />
    </MemoryRouter>,
  );
}

function exitIntent() {
  act(() => {
    fireEvent.mouseLeave(document, { clientY: 0 });
  });
}

function eventsNamed(name: string) {
  return trackFunnelEvent.mock.calls.filter(([n]) => n === name);
}

async function openViaExitIntent(path = "/") {
  mount(path);
  act(() => {
    vi.advanceTimersByTime(LEAD_MAGNET_DESKTOP_DWELL_MS);
  });
  exitIntent();
  return screen.findByRole("dialog");
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  sessionStorage.clear();
  trackFunnelEvent.mockClear();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: true, error: null });
  decideCookies();
  setMobile(false);
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  }
  document.addEventListener("click", stopAnchorNavigation, true);
});

afterEach(() => {
  document.removeEventListener("click", stopAnchorNavigation, true);
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("показване — desktop exit-intent", () => {
  it("не се показва преди 12 s престой; показва се след това с чисти props", async () => {
    mount("/");
    act(() => {
      vi.advanceTimersByTime(LEAD_MAGNET_DESKTOP_DWELL_MS - 1);
    });
    exitIntent();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(eventsNamed("lead_magnet_shown")).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    exitIntent();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    const shown = eventsNamed("lead_magnet_shown");
    expect(shown).toHaveLength(1);
    const props = shown[0][1] ?? {};
    expect(props).toEqual({ reason: "exit_intent", magnet: "rent-red-flags", source_group: "home" });
    for (const k of Object.keys(props)) expect(ALLOWED_PROP_KEYS.has(k), k).toBe(true);
    expect(sessionStorage.getItem(LEAD_MAGNET_SHOWN_KEY)).toBe("1");
  });

  it("показва се най-много веднъж на сесия", async () => {
    await openViaExitIntent("/");
    exitIntent();
    exitIntent();
    expect(eventsNamed("lead_magnet_shown")).toHaveLength(1);
  });

  it("не се показва, ако вече е показван в сесията или е отказан завинаги", () => {
    sessionStorage.setItem(LEAD_MAGNET_SHOWN_KEY, "1");
    mount("/");
    act(() => {
      vi.advanceTimersByTime(LEAD_MAGNET_DESKTOP_DWELL_MS);
    });
    exitIntent();
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();

    sessionStorage.clear();
    localStorage.setItem(LEAD_MAGNET_DISMISS_KEY, "1");
    mount("/");
    act(() => {
      vi.advanceTimersByTime(LEAD_MAGNET_DESKTOP_DWELL_MS);
    });
    exitIntent();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(eventsNamed("lead_magnet_shown")).toHaveLength(0);
  });

  it("групата на източника е груба — шаблон → template, без суров път", async () => {
    mount("/shablon/trudov-dogovor");
    act(() => {
      vi.advanceTimersByTime(LEAD_MAGNET_DESKTOP_DWELL_MS);
    });
    exitIntent();
    await screen.findByRole("dialog");
    const [, props] = eventsNamed("lead_magnet_shown")[0];
    expect(props).toEqual({ reason: "exit_intent", magnet: "labor-checklist-2026", source_group: "template" });
    expect(JSON.stringify(props)).not.toContain("/shablon");
  });
});

describe("показване — отказани маршрути и „зает потребител“", () => {
  it.each(["/start", "/auth", "/build", "/wizard/it", "/analiz", "/checkout/success", "/account", "/admin", "/privacy", "/plans"])(
    "%s → никога",
    (path) => {
      mount(path);
      act(() => {
        vi.advanceTimersByTime(LEAD_MAGNET_MOBILE_DWELL_MS + 1000);
      });
      exitIntent();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(trackFunnelEvent).not.toHaveBeenCalled();
    },
  );

  it("не прекъсва потребител, който пише във форма", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    mount("/");
    act(() => {
      vi.advanceTimersByTime(LEAD_MAGNET_DESKTOP_DWELL_MS);
    });
    input.focus();
    exitIntent();
    expect(screen.queryByRole("dialog")).toBeNull();
    input.blur();
    exitIntent();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("не прекъсва отворен диалог", () => {
    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    other.setAttribute("data-state", "open");
    document.body.appendChild(other);
    mount("/");
    act(() => {
      vi.advanceTimersByTime(LEAD_MAGNET_DESKTOP_DWELL_MS);
    });
    exitIntent();
    expect(screen.queryByRole("dialog", { name: /червени флага/ })).toBeNull();
    expect(eventsNamed("lead_magnet_shown")).toHaveLength(0);
  });

  it("не се струпва върху нерешен банер за бисквитки", () => {
    localStorage.removeItem("cookie-prefs-v2");
    mount("/");
    act(() => {
      vi.advanceTimersByTime(LEAD_MAGNET_DESKTOP_DWELL_MS);
    });
    exitIntent();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("показване — мобилно (35 s + >50 % скрол)", () => {
  function setScroll(scrollY: number, innerHeight: number, scrollHeight: number) {
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: scrollY });
    Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: innerHeight });
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: scrollHeight });
  }

  it("показва се след 35 s, когато е скролнато над половината", async () => {
    setMobile(true);
    setScroll(600, 500, 2000);
    mount("/catalog");
    act(() => {
      vi.advanceTimersByTime(LEAD_MAGNET_MOBILE_DWELL_MS - 1);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    await screen.findByRole("dialog");
    const [, props] = eventsNamed("lead_magnet_shown")[0];
    expect(props).toEqual({ reason: "mobile_engaged", magnet: "rent-red-flags", source_group: "catalog" });
  });

  it("без достатъчен скрол чака следващото скролване", async () => {
    setMobile(true);
    setScroll(0, 500, 2000);
    mount("/blog");
    act(() => {
      vi.advanceTimersByTime(LEAD_MAGNET_MOBILE_DWELL_MS + 5000);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    setScroll(900, 500, 2000);
    act(() => {
      fireEvent.scroll(window);
    });
    await screen.findByRole("dialog");
    expect(eventsNamed("lead_magnet_shown")[0][1]).toMatchObject({ reason: "mobile_engaged", source_group: "blog" });
  });

  it("на мобилно exit-intent не се брои", () => {
    setMobile(true);
    setScroll(900, 500, 2000);
    mount("/");
    act(() => {
      vi.advanceTimersByTime(LEAD_MAGNET_DESKTOP_DWELL_MS);
    });
    exitIntent();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("стъпка 1 — директно сваляне без имейл и без запис", () => {
  it("свалянето е нативна връзка, не изисква имейл, не вика базата и праща lead_magnet_downloaded веднъж", async () => {
    await openViaExitIntent("/");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/GDPR/i)).toBeNull();

    const link = screen.getByTestId("lead-magnet-download") as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/lead-magnets/10-cherveni-flaga-dogovor-za-naem.pdf");
    expect(link.hasAttribute("download")).toBe(true);

    fireEvent.click(link);
    expect(rpc).not.toHaveBeenCalled();
    const downloaded = eventsNamed("lead_magnet_downloaded");
    expect(downloaded).toHaveLength(1);
    expect(downloaded[0][1]).toEqual({ magnet: "rent-red-flags", source_group: "home" });
    // Свалянето е крайна цел — не питаме отново в следващи сесии.
    expect(localStorage.getItem(LEAD_MAGNET_DISMISS_KEY)).toBe("1");

    // Стъпка 2 е видима и незадължителна.
    expect(await screen.findByRole("heading", { name: /практични съвети по имейл/ })).toBeInTheDocument();
    expect(screen.getByText(/Свалянето не зависи от това/)).toBeInTheDocument();
  });

  it("„Не сега“ затваря с lead_magnet_dismissed(not_now), без запис", async () => {
    await openViaExitIntent("/");
    fireEvent.click(screen.getByRole("button", { name: "Не сега" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const dismissed = eventsNamed("lead_magnet_dismissed");
    expect(dismissed).toHaveLength(1);
    expect(dismissed[0][1]).toEqual({ reason: "not_now", magnet: "rent-red-flags", source_group: "home" });
    expect(localStorage.getItem(LEAD_MAGNET_DISMISS_KEY)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("„Не показвай повече“ записва отказа завинаги", async () => {
    await openViaExitIntent("/");
    fireEvent.click(screen.getByRole("button", { name: "Не показвай повече" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(localStorage.getItem(LEAD_MAGNET_DISMISS_KEY)).toBe("1");
    expect(eventsNamed("lead_magnet_dismissed")[0][1]).toMatchObject({ reason: "dont_show_again" });
  });

  it("Escape затваря диалога и брои един dismiss", async () => {
    await openViaExitIntent("/");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(eventsNamed("lead_magnet_dismissed")).toHaveLength(1);
    expect(eventsNamed("lead_magnet_dismissed")[0][1]).toMatchObject({ reason: "close" });
  });

  it("диалогът е достъпен: име, описание, фокус вътре, бутони ≥ 44 px", async () => {
    const dialog = await openViaExitIntent("/");
    expect(dialog).toHaveAccessibleName(/червени флага/);
    expect(dialog).toHaveAccessibleDescription(/PDF наръчник/);
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (const el of [
      screen.getByTestId("lead-magnet-download"),
      screen.getByRole("button", { name: "Не сега" }),
      screen.getByRole("button", { name: "Не показвай повече" }),
    ]) {
      expect(el.className).toContain("min-h-[44px]");
    }
    expect(dialog.querySelector(".dialog-close")?.className).toBeDefined();
    expect(dialog.className).toContain("motion-reduce:!animate-none");
  });
});

describe("стъпка 2 — незадължителен opt-in за бюлетина", () => {
  async function goToNewsletter() {
    await openViaExitIntent("/");
    fireEvent.click(screen.getByTestId("lead-magnet-download"));
    await screen.findByRole("heading", { name: /практични съвети по имейл/ });
    const email = screen.getByLabelText("Имейл") as HTMLInputElement;
    const consent = screen.getByRole("checkbox");
    const submit = screen.getByRole("button", { name: "Абонирай ме" }) as HTMLButtonElement;
    return { email, consent, submit };
  }

  it("чекбоксът е неизбран по подразбиране, с цел/честота/отказ и връзка към поверителността", async () => {
    const { consent } = await goToNewsletter();
    expect(consent).toHaveAttribute("aria-checked", "false");
    const label = document.querySelector('label[for="lm-consent"]');
    expect(label?.textContent).toMatch(/Съгласявам се/);
    expect(label?.textContent).toMatch(/бюлетин/);
    expect(label?.textContent).toMatch(/два пъти месечно/);
    expect(label?.textContent).toMatch(/отпиша по всяко време/);
    const privacy = screen.getByRole("link", { name: "Политика за поверителност" });
    expect(privacy).toHaveAttribute("href", "/privacy");
    expect(screen.queryByPlaceholderText(/Име/)).toBeNull();
  });

  it("абонаментът е блокиран до валиден имейл + изрично съгласие", async () => {
    const { email, consent, submit } = await goToNewsletter();
    expect(submit).toBeDisabled();

    fireEvent.change(email, { target: { value: "ivan@example.bg" } });
    expect(submit).toBeDisabled();

    fireEvent.click(consent);
    expect(consent).toHaveAttribute("aria-checked", "true");
    expect(submit).toBeEnabled();

    fireEvent.change(email, { target: { value: "not-an-email" } });
    expect(submit).toBeDisabled();

    fireEvent.click(consent);
    fireEvent.change(email, { target: { value: "ivan@example.bg" } });
    expect(consent).toHaveAttribute("aria-checked", "false");
    expect(submit).toBeDisabled();

    // Submit чрез формата с невалидно състояние не праща нищо.
    fireEvent.submit(submit.closest("form") as HTMLFormElement);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("успех: точно един RPC с минимален payload и точно един lead_magnet_converted", async () => {
    const { email, consent, submit } = await goToNewsletter();
    fireEvent.change(email, { target: { value: "  Ivan.Petrov@Example.BG " } });
    fireEvent.click(consent);
    fireEvent.click(submit);

    await screen.findByText(/Записахме те/);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("subscribe_lead_magnet");
    expect(args).toEqual({
      _email: "ivan.petrov@example.bg",
      _magnet_slug: "rent-red-flags",
      _source_group: "home",
      _marketing_consent: true,
    });
    const serialized = JSON.stringify(args);
    expect(serialized).not.toMatch(/name|user_agent|userAgent|pathname|"path"/);

    const converted = eventsNamed("lead_magnet_converted");
    expect(converted).toHaveLength(1);
    expect(converted[0][1]).toEqual({ magnet: "rent-red-flags", source_group: "home" });
    expect(JSON.stringify(trackFunnelEvent.mock.calls)).not.toContain("example.bg");

    // Затварянето след абонамент не е „dismiss“.
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(eventsNamed("lead_magnet_dismissed")).toHaveLength(0);
  });

  it("грешка от базата → общо съобщение, без сурова грешка и без converted", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'duplicate key value violates unique constraint "lead_magnet_subscribers_email_magnet_slug_key"' } });
    const { email, consent, submit } = await goToNewsletter();
    fireEvent.change(email, { target: { value: "ivan@example.bg" } });
    fireEvent.click(consent);
    fireEvent.click(submit);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Не успяхме да запишем абонамента/);
    expect(document.body.textContent).not.toMatch(/duplicate key|unique constraint|lead_magnet_subscribers/);
    expect(eventsNamed("lead_magnet_converted")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: /практични съвети по имейл/ })).toBeInTheDocument();
  });

  it("сървърно отхвърляне (false) също показва общото съобщение", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const { email, consent, submit } = await goToNewsletter();
    fireEvent.change(email, { target: { value: "ivan@example.bg" } });
    fireEvent.click(consent);
    fireEvent.click(submit);
    await screen.findByRole("alert");
    expect(eventsNamed("lead_magnet_converted")).toHaveLength(0);
  });

  it("мрежова грешка (throw) не пробива към потребителя", async () => {
    rpc.mockRejectedValueOnce(new Error("Failed to fetch https://internal.example/rest/v1/rpc/subscribe_lead_magnet"));
    const { email, consent, submit } = await goToNewsletter();
    fireEvent.change(email, { target: { value: "ivan@example.bg" } });
    fireEvent.click(consent);
    fireEvent.click(submit);
    await screen.findByRole("alert");
    expect(document.body.textContent).not.toMatch(/Failed to fetch|internal\.example/);
  });

  it("„Не, благодаря“ затваря без запис и без dismiss (свалянето е било успешно)", async () => {
    await goToNewsletter();
    fireEvent.click(screen.getByRole("button", { name: "Не, благодаря" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rpc).not.toHaveBeenCalled();
    expect(eventsNamed("lead_magnet_dismissed")).toHaveLength(0);
    expect(eventsNamed("lead_magnet_downloaded")).toHaveLength(1);
  });
});
