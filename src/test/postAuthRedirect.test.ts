/**
 * Пренасочване след вход: изричната цел се изразходва веднъж, недовършеният
 * документ е резервната цел, а небезопасните адреси не извеждат от приложението.
 */
import { describe, expect, it } from "vitest";
import { resolvePostAuthRedirect } from "@/lib/postAuthRedirect";

describe("resolvePostAuthRedirect", () => {
  it("използва изричната цел и я изразходва", () => {
    expect(resolvePostAuthRedirect({ destination: "/catalog?tab=all", here: "/" })).toEqual({
      target: "/catalog?tab=all",
      consumeDestination: true,
    });
  });

  it("изразходва целта и когато съвпада с текущия маршрут (не залепва)", () => {
    expect(resolvePostAuthRedirect({ destination: "/account", here: "/account" })).toEqual({
      target: null,
      consumeDestination: true,
    });
  });

  it("изразходва и отхвърля небезопасна цел", () => {
    for (const bad of ["https://evil.com/x", "//evil.com", "/\\evil.com"]) {
      expect(resolvePostAuthRedirect({ destination: bad, here: "/" })).toEqual({
        target: null,
        consumeDestination: true,
      });
    }
  });

  it("без цел връща потребителя при недовършения документ", () => {
    expect(resolvePostAuthRedirect({ destination: null, here: "/", draftRoute: "/wizard/it?doc=nda" })).toEqual({
      target: "/wizard/it?doc=nda",
      consumeDestination: false,
    });
  });

  it("не пренасочва към същия маршрут (без цикъл) и без чернова", () => {
    expect(resolvePostAuthRedirect({ destination: null, here: "/wizard/it", draftRoute: "/wizard/it" })).toEqual({
      target: null,
      consumeDestination: false,
    });
    expect(resolvePostAuthRedirect({ destination: null, here: "/" })).toEqual({
      target: null,
      consumeDestination: false,
    });
  });
});
