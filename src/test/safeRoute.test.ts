/**
 * Тестове за единното правило „само относителен път в същия origin“.
 *
 * Покриват адресите за връщане след вход/регистрация (`?redirect=`,
 * `post_login_redirect`), абсолютните `emailRedirectTo` и маршрута в указателя
 * на черновата. Всеки отхвърлен случай тук е потенциален open redirect.
 */
import { describe, expect, it } from "vitest";

import {
  buildAuthRedirectUrl,
  currentReturnPath,
  isSafeRoute,
  safeReturnPath,
  sanitizeReturnPath,
} from "@/lib/safeRoute";

const ORIGIN = "http://localhost:3000";

describe("sanitizeReturnPath", () => {
  it("приема относителни пътища и пази параметрите на документа", () => {
    expect(sanitizeReturnPath("/wizard/it?doc=nda", { origin: ORIGIN })).toBe("/wizard/it?doc=nda");
    expect(sanitizeReturnPath("/", { origin: ORIGIN })).toBe("/");
    expect(sanitizeReturnPath("  /account?tab=subscription ", { origin: ORIGIN })).toBe(
      "/account?tab=subscription",
    );
  });

  it("отхвърля всичко, което би извело извън приложението", () => {
    const bad = [
      "https://evil.com",
      "http://evil.com/",
      "//evil.com",
      "//evil.com/path",
      "/\\evil.com",
      "\\\\evil.com",
      "/\tevil.com",
      "/\nevil.com",
      "///evil.com",
      "javascript:alert(1)",
      "data:text/html,hi",
      "evil.com",
      "wizard/it",
      "",
      null,
      undefined,
      42,
      {},
    ];
    for (const b of bad) {
      expect(sanitizeReturnPath(b, { origin: ORIGIN }), String(b)).toBeNull();
    }
  });

  it("отхвърля прекалено дълги адреси", () => {
    expect(sanitizeReturnPath("/" + "a".repeat(2100), { origin: ORIGIN })).toBeNull();
  });

  it("изпуска hash и премахва техническите параметри", () => {
    expect(sanitizeReturnPath("/build?type=nda&utm_source=x&ab_q=variant#frag", { origin: ORIGIN })).toBe(
      "/build?type=nda",
    );
    expect(sanitizeReturnPath("/build?gclid=1&fbclid=2&debug=1", { origin: ORIGIN })).toBe("/build");
  });

  it("не приема вградени идентификационни данни", () => {
    // Относителен път не може да носи user:pass, но парсерът е последна дума.
    expect(sanitizeReturnPath("/@evil.com", { origin: ORIGIN })).toBe("/@evil.com");
    expect(sanitizeReturnPath("//user:pass@evil.com", { origin: ORIGIN })).toBeNull();
  });
});

describe("safeReturnPath / buildAuthRedirectUrl", () => {
  it("връща резервния маршрут при отхвърлен вход", () => {
    expect(safeReturnPath("https://evil.com", "/account", { origin: ORIGIN })).toBe("/account");
    expect(safeReturnPath(undefined, "/catalog", { origin: ORIGIN })).toBe("/catalog");
    // Небезопасен fallback също не минава.
    expect(safeReturnPath("//x", "//y", { origin: ORIGIN })).toBe("/");
  });

  it("строи абсолютния адрес само от доверения origin", () => {
    const origin = window.location.origin;
    expect(buildAuthRedirectUrl("/wizard/it?doc=nda")).toBe(origin + "/wizard/it?doc=nda");
    expect(buildAuthRedirectUrl("https://evil.com/steal", "/account")).toBe(origin + "/account");
    expect(buildAuthRedirectUrl("//evil.com")).toBe(origin + "/");
  });

  it("currentReturnPath е винаги относителен и без технически параметри", () => {
    window.history.pushState({}, "", "/wizard/it?doc=nda&utm_source=x&ab_activation_continuity=variant#h");
    try {
      expect(currentReturnPath()).toBe("/wizard/it?doc=nda");
    } finally {
      window.history.pushState({}, "", "/");
    }
  });
});

describe("isSafeRoute", () => {
  it("е строг спрямо формата", () => {
    expect(isSafeRoute("/a")).toBe(true);
    expect(isSafeRoute("/")).toBe(true);
    expect(isSafeRoute("//a")).toBe(false);
    expect(isSafeRoute("/\\a")).toBe(false);
    expect(isSafeRoute("/\u0000a")).toBe(false);
    expect(isSafeRoute("a")).toBe(false);
  });
});
