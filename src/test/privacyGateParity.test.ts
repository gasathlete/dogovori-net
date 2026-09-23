/**
 * Съответствие между браузърната преграда (src/lib/privacyGate.ts) и сървърната
 * (supabase/functions/_shared/text-identifier-gate.ts).
 *
 * Целта: всяка стойност, която сървърът би спрял, се спира ВЕЧЕ в браузъра —
 * преди мрежова заявка. Това е ограничаване по образци, НЕ доказателство за
 * пълнота: разпознаването може да пропусне нестандартен запис.
 */
import { describe, expect, it, vi } from "vitest";
import {
  assertNoRestrictedIdentifiers,
  findRestrictedIdentifiers,
  findRestrictedIdentifiersDeep,
  isPlausibleEgnDigits,
  RestrictedIdentifierError,
} from "@/lib/privacyGate";
import {
  findRestrictedIdentifierKinds,
  findRestrictedIdentifierKindsDeep,
  isPlausibleEgnDigits as serverPlausibleEgn,
} from "../../supabase/functions/_shared/text-identifier-gate";

// СИНТЕТИЧНИ стойности — нито един реален потребителски документ.
const EGN_BAD_CHECKSUM = "8012129999";
const IBAN = "BG80BNBG96611020345678";

/** Същите примери, които доказват сървърната преграда. */
const SERVER_FIXTURES: string[] = [
  `Продавач ${EGN_BAD_CHECKSUM}`,
  "ЕГН: 801212",
  `IBAN ${IBAN}`,
  "банкова сметка: 1020345678",
  "лична карта № 641234567",
  `ЕГН ${EGN_BAD_CHECKSUM} и IBAN ${IBAN}`,
];

const PLACEHOLDERS_AND_ORDINARY: string[] = [
  "ЕГН: [ЕГН]",
  "IBAN: ____________",
  "ЕГН: ХХХХХХХХХХ",
  "",
  "тел. 0888881234",
  "Сключен на 12.03.2026 г. за срок от 24 месеца.",
  "Цена 1 250 000 EUR без ДДС.",
  "Нормативна основа: ЗЗД от 1950 г., изм. 2024 г.",
];

describe("преградите в браузъра и на сървъра съвпадат", () => {
  it("правилото за достоверно ЕГН е едно и също", () => {
    for (const v of [EGN_BAD_CHECKSUM, "0000000000", "0888881234", "8012129998", "123456"]) {
      expect(isPlausibleEgnDigits(v)).toBe(serverPlausibleEgn(v));
    }
  });

  it("всеки сървърен пример се засича вече в браузъра", () => {
    for (const fixture of SERVER_FIXTURES) {
      const server = findRestrictedIdentifierKinds(fixture).sort();
      const client = findRestrictedIdentifiers(fixture).sort();
      expect(server.length).toBeGreaterThan(0);
      expect(client).toEqual(server);
    }
  });

  it("заместители, години, суми и телефони НЕ се засичат от никоя от двете", () => {
    for (const text of PLACEHOLDERS_AND_ORDINARY) {
      expect(findRestrictedIdentifiers(text)).toEqual([]);
      expect(findRestrictedIdentifierKinds(text)).toEqual([]);
    }
  });

  it("обхождането на вложени отговори съвпада", () => {
    const value = { answers: { parties: [{ note: `ЕГН ${EGN_BAD_CHECKSUM}` }] }, iban: IBAN };
    expect(findRestrictedIdentifiersDeep(value).sort()).toEqual(
      findRestrictedIdentifierKindsDeep(value).sort(),
    );
  });
});

describe("браузърната преграда спира ПРЕДИ мрежова заявка", () => {
  it("хвърля, без да е направено нито едно извикване на fetch", () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("мрежова заявка не бива да се случва");
    });
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      for (const fixture of SERVER_FIXTURES) {
        expect(() => assertNoRestrictedIdentifiers({ text: fixture })).toThrow(
          RestrictedIdentifierError,
        );
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("съобщението към потребителя не съдържа самата стойност", () => {
    try {
      assertNoRestrictedIdentifiers({ text: `ЕГН ${EGN_BAD_CHECKSUM}, IBAN ${IBAN}` });
      throw new Error("трябваше да хвърли");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain(EGN_BAD_CHECKSUM);
      expect(msg).not.toContain(IBAN);
      expect(msg).toContain("ЕГН");
    }
  });
});
