import { describe, expect, it } from "vitest";
import {
  RAW_FILE_BLOCKED_MESSAGE,
  RAW_FILE_INGRESS_ALLOWED,
  SCANNED_PDF_BLOCKED_MESSAGE,
  assertNoRestrictedIdentifiers,
  findRestrictedIdentifiers,
  findRestrictedIdentifiersDeep,
  hasRestrictedIdentifiers,
} from "@/lib/privacyGate";
import {
  MIN_PRODUCT_TEXT_LENGTH,
  ProductUploadError,
  prepareProductDocument,
} from "@/lib/productUpload";

describe("privacy gate — разпознаване", () => {
  it("засича валидно ЕГН без обозначение", () => {
    // Валидна контролна сума (примерна стойност, не е на реален човек).
    expect(findRestrictedIdentifiers("Страна с ЕГН 7523169263")).toContain("egn");
  });

  it("засича обозначено ЕГН поле, дори при непълни цифри", () => {
    expect(findRestrictedIdentifiers("ЕГН: 123456789")).toContain("egn");
  });

  it("засича IBAN и обозначен IBAN", () => {
    expect(findRestrictedIdentifiers("BG18RZBB91550123456789")).toContain("iban");
    expect(findRestrictedIdentifiers("IBAN: 9155 0123 4567")).toContain("iban");
  });

  it("засича банкова сметка и номер на лична карта", () => {
    expect(findRestrictedIdentifiers("банкова сметка № 1234567890")).toContain("bank_account");
    expect(findRestrictedIdentifiers("лична карта № 641233456")).toContain("id_document");
  });

  it("НЕ засича заместители и празни полета — бланките остават достъпни", () => {
    for (const safe of [
      "ЕГН: [ЕГН]",
      "ЕГН: __________",
      "IBAN: ХХХХХХХХ",
      "лична карта № ________",
      "Договор за наем на жилище между Наемодател и Наемател",
      "Срок: 12 месеца, наем 850 EUR",
      "",
    ]) {
      expect(hasRestrictedIdentifiers(safe), safe).toBe(false);
    }
  });

  it("обхожда вложени отговори от въпросника", () => {
    const answers = {
      parties: [{ name: "Иван Иванов", egn: "ЕГН 123456789" }],
      payment: { iban: "BG18RZBB91550123456789" },
      note: "без лични данни",
    };
    const kinds = findRestrictedIdentifiersDeep(answers);
    expect(kinds).toContain("egn");
    expect(kinds).toContain("iban");
  });

  it("assert хвърля преди всяка заявка", () => {
    expect(() => assertNoRestrictedIdentifiers({ t: "IBAN: 9155 0123 4567" })).toThrow();
    expect(() => assertNoRestrictedIdentifiers({ t: "IBAN: [IBAN]" })).not.toThrow();
  });
});

describe("privacy gate — входни точки", () => {
  it("суровите файлове са спрени с ясно съобщение", () => {
    expect(RAW_FILE_INGRESS_ALLOWED).toBe(false);
    expect(RAW_FILE_BLOCKED_MESSAGE.length).toBeGreaterThan(40);
    expect(SCANNED_PDF_BLOCKED_MESSAGE.length).toBeGreaterThan(40);
    expect(MIN_PRODUCT_TEXT_LENGTH).toBeGreaterThan(0);
  });

  it("платената подготовка отказва файл, без да го чете и без мрежа", async () => {
    const file = new File(["%PDF-1.7 fake"], "dogovor.pdf", { type: "application/pdf" });
    await expect(
      prepareProductDocument({ userId: "u1", title: "Договор", file }),
    ).rejects.toBeInstanceOf(ProductUploadError);
  });
});
