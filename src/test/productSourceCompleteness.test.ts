/**
 * Пълнота на източника при платените еднократни продукти.
 *
 * Правилото: продуктът обещава подробен резултат за ЦЕЛИЯ документ, затова
 * частичен, сканиран или прекалено дълъг източник НЕ стига до плащане, и
 * продуктовият път никога не пуска OCR / не харчи операции.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  invokeSpy: vi.fn(),
  mammothSpy: vi.fn(),
  state.pdfPages: [] as string[],
}));
const { invokeSpy, mammothSpy } = state;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: state.invokeSpy },
    from: vi.fn(),
    storage: { from: vi.fn() },
    auth: {},
  },
}));

vi.mock("mammoth", () => ({ extractRawText: (...a: unknown[]) => state.mammothSpy(...a) }));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: state.pdfPages.length,
      getPage: (i: number) => Promise.resolve({
        getTextContent: () => Promise.resolve({ items: [{ str: state.pdfPages[i - 1] }] }),
      }),
    }),
  }),
}));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.mjs?url", () => ({ default: "worker" }));

import { extractProductSource } from "@/lib/productExtraction";
import {
  PRODUCT_MAX_SOURCE_CHARS,
  PRODUCT_ACCEPTED_INPUT,
  normalizeProductSourceText,
} from "@/lib/productSource";
import { ONE_TIME_PRODUCTS } from "@/lib/products";
import {
  requireProductPrice,
  ProductPurchaseError,
} from "../../supabase/functions/_shared/product-purchase";
import {
  PRODUCT_MAX_SOURCE_CHARS as SERVER_MAX,
  normalizeProductSourceText as serverNormalize,
  verifyStoredProductSource,
  ProductSourceError,
} from "../../supabase/functions/_shared/product-source";

const sha256 = async (v: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const docxFile = () =>
  new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "dogovor.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
const pdfFile = () =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "dogovor.pdf", { type: "application/pdf" });

const CYRILLIC_PAGE = "Договор за наем между страните с ясни клаузи и срокове. ".repeat(20);

beforeEach(() => {
  invokeSpy.mockReset();
  mammothSpy.mockReset();
  state.pdfPages = [];
});

describe("продуктовият източник — пълнота и цена", () => {
  it("нормализацията и лимитът са едни и същи в браузъра и на сървъра", () => {
    expect(PRODUCT_MAX_SOURCE_CHARS).toBe(60000);
    expect(SERVER_MAX).toBe(PRODUCT_MAX_SOURCE_CHARS);
    const raw = "Ред\u00a0едно  \r\n  Ред две\n\n\n\nРед три ";
    expect(normalizeProductSourceText(raw)).toBe(serverNormalize(raw));
  });

  it("PDF над лимита се отказва, вместо да се отреже тихо", async () => {
    state.pdfPages = [CYRILLIC_PAGE.repeat(60), CYRILLIC_PAGE.repeat(60)];
    const res = await extractProductSource({ file: pdfFile() });
    expect(res.status).toBe("partial");
    expect(res.blockedReason).toBe("too_long");
    expect(res.text).toBe("");
    expect(res.sourceHash).toBe("");
    expect(res.charCount).toBeGreaterThan(PRODUCT_MAX_SOURCE_CHARS);
    expect(res.message).toContain("60");
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("сканиран PDF се отказва без OCR и без операции", async () => {
    state.pdfPages = ["", "", ""];
    const res = await extractProductSource({ file: pdfFile() });
    expect(res.status).toBe("partial");
    expect(res.blockedReason).toBe("no_text_layer");
    expect(res.pageCount).toBe(3);
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("нечетлив (garbled) текстов слой се отказва без OCR", async () => {
    state.pdfPages = ["Lorem ipsum dolor sit amet consectetur adipiscing elit sed do ".repeat(20)];
    const res = await extractProductSource({ file: pdfFile() });
    expect(res.status).toBe("partial");
    expect(res.blockedReason).toBe("garbled_text");
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("четим PDF се приема с измерени страници и стабилен хеш", async () => {
    state.pdfPages = [CYRILLIC_PAGE, CYRILLIC_PAGE];
    const res = await extractProductSource({ file: pdfFile() });
    expect(res.status).toBe("full");
    expect(res.pageCount).toBe(2);
    expect(res.charCount).toBe(res.text.length);
    expect(res.sourceHash).toBe(await sha256(res.text));
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("пълен DOCX се приема със стабилен хеш върху нормализирания текст", async () => {
    mammothSpy.mockResolvedValue({ value: `  ${CYRILLIC_PAGE}\r\n\r\n\r\n край  ` });
    const res = await extractProductSource({ file: docxFile() });
    expect(res.status).toBe("full");
    expect(res.text).toBe(normalizeProductSourceText(res.text));
    expect(res.sourceHash).toBe(await sha256(res.text));
    const again = await extractProductSource({ file: docxFile() });
    expect(again.sourceHash).toBe(res.sourceHash);
  });

  it("DOCX над лимита се отказва", async () => {
    mammothSpy.mockResolvedValue({ value: "а".repeat(PRODUCT_MAX_SOURCE_CHARS + 1) });
    const res = await extractProductSource({ file: docxFile() });
    expect(res.status).toBe("partial");
    expect(res.blockedReason).toBe("too_long");
  });
});

describe("сървърна проверка на съхранения източник", () => {
  const fullRow = async (text: string) => ({
    extracted_text: text,
    text_hash: await sha256(text),
    product_extraction_status: "full",
    product_extracted_chars: text.length,
    product_source_pages: 2,
  });

  it("приема пълен, нормализиран източник с точен хеш", async () => {
    const text = normalizeProductSourceText(CYRILLIC_PAGE);
    const verified = await verifyStoredProductSource(await fullRow(text), sha256);
    expect(verified.charCount).toBe(text.length);
    expect(verified.pageCount).toBe(2);
  });

  it("отказва частичен статус, подменен хеш и текст над лимита", async () => {
    const text = normalizeProductSourceText(CYRILLIC_PAGE);
    const partial = { ...(await fullRow(text)), product_extraction_status: "partial" };
    await expect(verifyStoredProductSource(partial, sha256)).rejects.toBeInstanceOf(ProductSourceError);

    const badHash = { ...(await fullRow(text)), text_hash: "0".repeat(64) };
    await expect(verifyStoredProductSource(badHash, sha256)).rejects.toBeInstanceOf(ProductSourceError);

    const long = "а".repeat(PRODUCT_MAX_SOURCE_CHARS + 1);
    await expect(verifyStoredProductSource(await fullRow(long), sha256)).rejects.toBeInstanceOf(
      ProductSourceError,
    );
  });
});

describe("точната бруто цена и данъчното поведение", () => {
  const price = (over: Record<string, unknown> = {}) => [{
    id: "price_1",
    active: true,
    currency: "eur",
    unit_amount: 299,
    type: "one_time",
    lookup_key: "contract_check_299",
    tax_behavior: "inclusive",
    ...over,
  }];

  it("приема активна EUR one_time цена с inclusive ДДС", () => {
    expect(requireProductPrice(price(), "contract_check").unit_amount).toBe(299);
  });

  it("отказва exclusive/unspecified данъчно поведение", () => {
    for (const behavior of ["exclusive", "unspecified", null]) {
      expect(() => requireProductPrice(price({ tax_behavior: behavior }), "contract_check"))
        .toThrow(ProductPurchaseError);
    }
  });

  it("отказва различна сума от рекламираната бруто цена", () => {
    expect(() => requireProductPrice(price({ unit_amount: 359 }), "contract_check"))
      .toThrow(ProductPurchaseError);
  });
});

describe("честна реклама на приетия вход", () => {
  const copy = JSON.stringify(ONE_TIME_PRODUCTS);

  it("продуктовите текстове не обещават снимка или сканиран документ", () => {
    expect(copy).not.toMatch(/снимка на текста/);
    expect(copy).not.toMatch(/сканиран текст/);
  });

  it("казва точно какво приемаме", () => {
    expect(PRODUCT_ACCEPTED_INPUT).toContain("DOCX");
    expect(PRODUCT_ACCEPTED_INPUT).toContain("60 000");
    expect(readFileSync("src/pages/ProductCheckout.tsx", "utf8")).toContain("PRODUCT_ACCEPTED_INPUT");
  });
});

describe("продуктовият път не ползва общия OCR/квотния помощник", () => {
  const upload = readFileSync("src/lib/productUpload.ts", "utf8");
  const extraction = readFileSync("src/lib/productExtraction.ts", "utf8");

  it("не извиква ocr-contract и не ползва отрязващото извличане", () => {
    for (const src of [upload, extraction]) {
      expect(src).not.toContain("ocr-contract");
      expect(src).not.toContain("extractTextFromFile");
      expect(src).not.toContain("consume_quota");
    }
    expect(upload).toContain("extractProductSource");
  });

  it("общият път за анализ остава непроменен (OCR fallback е налице)", () => {
    const generic = readFileSync("src/lib/extractContractText.ts", "utf8");
    expect(generic).toContain("ocr-contract");
  });
});
