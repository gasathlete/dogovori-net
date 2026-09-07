/**
 * Lead magnet — чиста логика за показване: allow-list на маршрутите, времеви
 * правила, сигнали „зает потребител“, имейл проверка и съхранение.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { COOKIE_POLICY_VERSION } from "@/lib/analytics";
import {
  classifyLeadMagnetRoute,
  hasScrolledPast,
  isCookieDecisionPending,
  isEditableElement,
  isLeadMagnetDismissed,
  isLeadMagnetSourceGroup,
  isMobileViewport,
  isUserBusy,
  isValidLeadEmail,
  LEAD_MAGNET_DESKTOP_DWELL_MS,
  LEAD_MAGNET_DISMISS_KEY,
  LEAD_MAGNET_EMAIL_MAX_LEN,
  LEAD_MAGNET_MOBILE_DWELL_MS,
  LEAD_MAGNET_MOBILE_SCROLL_DEPTH,
  LEAD_MAGNET_SHOWN_KEY,
  LEAD_MAGNET_SOURCE_GROUPS,
  markLeadMagnetDismissed,
  markLeadMagnetShown,
  normalizeLeadEmail,
  wasLeadMagnetShownThisSession,
} from "@/lib/leadMagnetTrigger";

describe("classifyLeadMagnetRoute — разрешени маршрути", () => {
  const allowed: Array<[string, string]> = [
    ["/", "home"],
    ["/?utm_source=x", "home"],
    ["/bg", "home"],
    ["/en/", "home"],
    ["/catalog", "catalog"],
    ["/catalog/", "catalog"],
    ["/catalog?q=naem", "catalog"],
    ["/kategoria/naem-i-imoti", "catalog"],
    ["/sektor/it", "catalog"],
    ["/en/kategoria/trud", "catalog"],
    ["/shablon/dogovor-za-naem-na-zhilishte", "template"],
    ["/SHABLON/NDA-Dogovor", "template"],
    ["/en/shablon/nda", "template"],
    ["/shablon/nda#klauzi", "template"],
    ["/blog", "blog"],
    ["/blog/", "blog"],
    ["/blog/deklaracia-patuvane-dete-chuzhbina", "blog"],
    ["/blog/u/potrebitelska-statia", "blog"],
    ["/en/blog/some-post", "blog"],
  ];
  it.each(allowed)("%s → %s", (path, group) => {
    expect(classifyLeadMagnetRoute(path)).toBe(group);
  });

  it("групите са точно четирите груби стойности", () => {
    expect([...LEAD_MAGNET_SOURCE_GROUPS]).toEqual(["home", "catalog", "template", "blog"]);
    for (const g of LEAD_MAGNET_SOURCE_GROUPS) expect(isLeadMagnetSourceGroup(g)).toBe(true);
    expect(isLeadMagnetSourceGroup("/shablon/nda")).toBe(false);
    expect(isLeadMagnetSourceGroup("other")).toBe(false);
  });
});

describe("classifyLeadMagnetRoute — отказани маршрути (deny by default)", () => {
  const denied: unknown[] = [
    // конверсионни / документни потоци
    "/start",
    "/start?intent=nda",
    "/auth",
    "/auth/callback",
    "/build",
    "/wizard/it",
    "/wizard-bilingual/it",
    "/wizard-graph/nda",
    "/wizard-graph/nda/review",
    "/workspace/nda/contract",
    "/analiz",
    "/analyze",
    "/analyze/123",
    "/document/8f1c",
    "/documents",
    "/uploaded/8f1c",
    "/share/tok",
    "/sign/tok",
    "/signing/8f1c",
    "/verify",
    "/verify/abc",
    // плащане / профил / администрация
    "/checkout/success",
    "/checkout/cancel",
    "/checkout/return",
    "/account",
    "/account?tab=subscription",
    "/profile",
    "/dashboard",
    "/admin",
    "/admin/metrics",
    "/console",
    "/console/signing",
    "/reset-password",
    "/plans",
    "/team/accept",
    "/team/sso",
    "/unsubscribe",
    "/feedback",
    // правни / съгласие
    "/legal",
    "/legal/terms",
    "/privacy",
    "/cookies",
    "/dpa",
    // други публични, но не в allow-list
    "/tools",
    "/tools/dds-kalkulator",
    "/komplekti",
    "/komplekti/startirane-na-firma",
    "/karta",
    "/ai",
    "/assistant",
    "/rechnik",
    "/sravni/a/b",
    "/demo/e-signature",
    "/proces/x",
    // форма в блога, непълни/дълбоки пътища
    "/blog/submit",
    "/blog/u",
    "/blog/u/x/y",
    "/blog/a/b",
    "/shablon",
    "/shablon/",
    "/shablon/nda/preview",
    "/kategoria",
    "/kategoria/naem/sub",
    "/sektor",
    "/catalog/naem",
    "/nonexistent-page",
    // повредени / опасни входове
    "//evil.com",
    "/\\evil.com",
    "/\tstart",
    "/shablon/%E0%A4%A",
    "/shablon/дoгoвop",
    "/shablon/../account",
    "catalog",
    "",
    "/" + "a".repeat(2100),
    null,
    undefined,
    42,
    {},
    [],
  ];
  it.each(denied.map((d) => [String(d), d] as const))("%s → null", (_label, path) => {
    expect(classifyLeadMagnetRoute(path)).toBeNull();
  });

  it("локалният префикс не отваря отказан маршрут", () => {
    expect(classifyLeadMagnetRoute("/en/start")).toBeNull();
    expect(classifyLeadMagnetRoute("/bg/account")).toBeNull();
    expect(classifyLeadMagnetRoute("/en/checkout/success")).toBeNull();
  });
});

describe("времеви правила", () => {
  it("desktop = 12 s престой; мобилно = 35 s + 50 % скрол", () => {
    expect(LEAD_MAGNET_DESKTOP_DWELL_MS).toBe(12_000);
    expect(LEAD_MAGNET_MOBILE_DWELL_MS).toBe(35_000);
    expect(LEAD_MAGNET_MOBILE_SCROLL_DEPTH).toBe(0.5);
  });

  it("hasScrolledPast е точно на границата 50 %", () => {
    const doc = { documentElement: { scrollHeight: 2000 } } as unknown as Document;
    expect(hasScrolledPast({ scrollY: 0, innerHeight: 999 } as Window, doc)).toBe(false);
    expect(hasScrolledPast({ scrollY: 0, innerHeight: 1000 } as Window, doc)).toBe(true);
    expect(hasScrolledPast({ scrollY: 600, innerHeight: 400 } as Window, doc)).toBe(true);
    expect(hasScrolledPast({ scrollY: 0, innerHeight: 1000 } as Window, { documentElement: { scrollHeight: 0 } } as unknown as Document)).toBe(false);
    expect(hasScrolledPast(null, doc)).toBe(false);
  });

  it("isMobileViewport ползва matchMedia и е fail-safe", () => {
    expect(isMobileViewport({ matchMedia: () => ({ matches: true }) } as unknown as Window)).toBe(true);
    expect(isMobileViewport({ matchMedia: () => ({ matches: false }) } as unknown as Window)).toBe(false);
    expect(isMobileViewport({} as Window)).toBe(false);
    expect(isMobileViewport(null)).toBe(false);
  });
});

describe("isUserBusy — стандартни сигнали, без крехки селектори", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  it("фокусирано поле за писане = активна форма", () => {
    document.body.innerHTML = `<input id="q" type="search" /><button id="b">x</button><div id="c" contenteditable="true"></div>`;
    const q = document.getElementById("q") as HTMLInputElement;
    q.focus();
    expect(isUserBusy(document)).toBe(true);
    const b = document.getElementById("b") as HTMLButtonElement;
    b.focus();
    expect(isUserBusy(document)).toBe(false);
    expect(isEditableElement(document.createElement("textarea"))).toBe(true);
    expect(isEditableElement(document.createElement("select"))).toBe(true);
    const chk = document.createElement("input");
    chk.type = "checkbox";
    expect(isEditableElement(chk)).toBe(false);
    expect(isEditableElement(null)).toBe(false);
  });

  it("отворен Radix диалог (role=dialog + data-state=open) = зает", () => {
    document.body.innerHTML = `<div role="dialog" data-state="open"><p>Влез</p></div>`;
    expect(isUserBusy(document)).toBe(true);
  });

  it("alertdialog и собствените модални overlay-и (aria-modal) = зает", () => {
    document.body.innerHTML = `<div role="alertdialog" data-state="open"></div>`;
    expect(isUserBusy(document)).toBe(true);
    document.body.innerHTML = `<div role="dialog" aria-modal="true"></div>`;
    expect(isUserBusy(document)).toBe(true);
  });

  it("постоянно монтиран, но скрит панел с role=dialog НЕ блокира (DogovAI)", () => {
    document.body.innerHTML = `<div role="dialog" aria-label="DogovaryAI чат" class="pointer-events-none opacity-0"></div>`;
    expect(isUserBusy(document)).toBe(false);
  });

  it("фокус вътре в диалог/меню = зает", () => {
    document.body.innerHTML = `<div role="dialog"><button id="in">ok</button></div>`;
    (document.getElementById("in") as HTMLButtonElement).focus();
    expect(isUserBusy(document)).toBe(true);
  });

  it("празен документ / липсващ документ = свободен", () => {
    expect(isUserBusy(document)).toBe(false);
    expect(isUserBusy(null)).toBe(false);
  });
});

describe("isCookieDecisionPending — съществуващият сигнал за банера", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("без решение → чакаме; след решение → не", () => {
    expect(isCookieDecisionPending()).toBe(true);
    localStorage.setItem(
      "cookie-prefs-v2",
      JSON.stringify({ necessary: true, analytics: false, marketing: false, version: COOKIE_POLICY_VERSION, decided_at: "2026-09-01T00:00:00Z" }),
    );
    expect(isCookieDecisionPending()).toBe(false);
  });
});

describe("имейл — клиентска проверка, огледална на RPC-то", () => {
  it("нормализира (trim + lowercase) и приема валидни адреси", () => {
    expect(normalizeLeadEmail("  Ivan.Petrov+news@Example.BG ")).toBe("ivan.petrov+news@example.bg");
    expect(normalizeLeadEmail("a_b%c-d@sub.domain.co.uk")).toBe("a_b%c-d@sub.domain.co.uk");
    expect(isValidLeadEmail("x@y.bg")).toBe(true);
  });

  it("отхвърля невалидни / опасни стойности", () => {
    const bad = [
      "",
      "   ",
      "plain",
      "@example.bg",
      "a@",
      "a@b",
      "a@b.c",
      "a..b@example.bg",
      ".a@example.bg",
      "a.@example.bg",
      "a@-example.bg",
      "a@example-.bg",
      "a@exa mple.bg",
      "a b@example.bg",
      "a@exam\nple.bg",
      "a@example.bg\u0000",
      "a@example.bg;drop",
      "иван@пример.бг",
      "a@example.123",
      "a@b.toolongtldxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "a".repeat(250) + "@x.bg",
      null,
      undefined,
      42,
    ];
    for (const b of bad) expect(isValidLeadEmail(b), String(b)).toBe(false);
  });

  it("границата е 254 знака включително", () => {
    expect(LEAD_MAGNET_EMAIL_MAX_LEN).toBe(254);
    const local = "a".repeat(254 - "@example.bg".length);
    expect(isValidLeadEmail(local + "@example.bg")).toBe(true);
    expect(isValidLeadEmail(local + "a@example.bg")).toBe(false);
  });
});

describe("съхранение — един път на сесия и „Не показвай повече“", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("ключовете са стабилни (SocialProofToast чете същия session ключ)", () => {
    expect(LEAD_MAGNET_SHOWN_KEY).toBe("lead_magnet_shown_v1");
    expect(LEAD_MAGNET_DISMISS_KEY).toBe("lead_magnet_dismissed_v1");
  });

  it("маркерите се записват и четат", () => {
    expect(wasLeadMagnetShownThisSession()).toBe(false);
    markLeadMagnetShown();
    expect(wasLeadMagnetShownThisSession()).toBe(true);
    expect(sessionStorage.getItem(LEAD_MAGNET_SHOWN_KEY)).toBe("1");

    expect(isLeadMagnetDismissed()).toBe(false);
    markLeadMagnetDismissed();
    expect(isLeadMagnetDismissed()).toBe(true);
    expect(localStorage.getItem(LEAD_MAGNET_DISMISS_KEY)).toBe("1");
  });
});
