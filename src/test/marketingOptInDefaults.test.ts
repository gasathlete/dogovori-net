/**
 * Маркетингът започва изключен във всички форми за регистрация/вход и никога
 * не блокира регистрацията. Отделното поле за „изричен отказ“ е премахнато.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = {
  auth: readFileSync("src/pages/Auth.tsx", "utf8"),
  inline: readFileSync("src/components/auth/InlineAuthDialog.tsx", "utf8"),
  google: readFileSync("src/components/auth/GoogleConsentDialog.tsx", "utf8"),
};

describe("маркетинг — изричен opt-in по подразбиране", () => {
  it("Auth.tsx стартира с изключен маркетинг и не участва в готовността", () => {
    expect(files.auth).toContain("useState(false);\n  // Задължително");
    expect(files.auth).toContain(
      "const signupReady = acceptTerms && acceptPrivacy && acceptAge && acceptNotifications;",
    );
    expect(files.auth).not.toContain("acceptMarketing &&");
  });

  it("инлайн диалогът стартира с изключен маркетинг", () => {
    expect(files.inline).toMatch(/const \[marketing, setMarketing\] = useState\(false\)/);
  });

  it("Google диалогът стартира и се нулира с изключен маркетинг", () => {
    expect(files.google).toMatch(/const \[marketing, setMarketing\] = useState\(false\)/);
    expect(files.google).toMatch(/setMarketing\(false\);/);
  });

  it("никъде няма отделно поле за изричен отказ", () => {
    for (const src of Object.values(files)) {
      expect(src).not.toContain("mkt-refuse");
      expect(src).not.toContain("marketingRefused");
      expect(src).not.toContain("refuseMarketing");
      expect(src).not.toContain("marketing_refused");
    }
  });
});
