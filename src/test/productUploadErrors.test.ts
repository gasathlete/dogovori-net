/**
 * Качването за платен продукт никога не показва сурова грешка от базата.
 * Точната регресия от екранната снимка: липсваща колона product_extracted_chars.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { storageRemove, insertError } = vi.hoisted(() => ({
  storageRemove: vi.fn(() => Promise.resolve({ data: null, error: null })),
  insertError: { value: null as null | { code?: string; message: string } },
}));

vi.mock("@/integrations/supabase/client", () => {
  const storage = {
    from: () => ({
      upload: () => Promise.resolve({ error: null }),
      remove: storageRemove,
    }),
  };
  return {
    supabase: {
      auth: {
        refreshSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }),
        getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }),
      },
      storage,
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve(
                insertError.value
                  ? { data: null, error: insertError.value }
                  : { data: { id: "uc1" }, error: null },
              ),
          }),
        }),
      }),
    },
  };
});

vi.mock("@/lib/fileValidation", () => ({
  detectFileKind: () => "docx",
  validateUploadedFile: () => Promise.resolve({ ok: true }),
}));

vi.mock("@/lib/productExtraction", () => ({
  extractProductSource: () =>
    Promise.resolve({
      status: "full",
      text: "А".repeat(5000),
      pageCount: 3,
      sourceHash: "hash1",
    }),
}));

import {
  PRODUCT_PERSIST_FAILED_MESSAGE,
  PRODUCT_SCHEMA_UNAVAILABLE_MESSAGE,
  isSchemaUnavailableError,
  prepareProductDocument,
  productPersistErrorMessage,
} from "@/lib/productUpload";

const file = new File(["x"], "Договор за наем.docx", {
  type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});

beforeEach(() => {
  storageRemove.mockClear();
  insertError.value = null;
});

describe("класификация на грешки при запис", () => {
  it("разпознава точната schema-cache грешка от екранната снимка", () => {
    const err = {
      code: "PGRST204",
      message:
        "Could not find the 'product_extracted_chars' column of 'uploaded_contracts' in the schema cache",
    };
    expect(isSchemaUnavailableError(err)).toBe(true);
    expect(productPersistErrorMessage(err)).toBe(PRODUCT_SCHEMA_UNAVAILABLE_MESSAGE);
  });

  it("непозната грешка от базата дава общо човешко съобщение", () => {
    const err = { code: "XX000", message: "deadlock detected on relation 91234" };
    expect(isSchemaUnavailableError(err)).toBe(false);
    expect(productPersistErrorMessage(err)).toBe(PRODUCT_PERSIST_FAILED_MESSAGE);
  });
});

describe("prepareProductDocument", () => {
  it("не пренася имена на таблици/колони/кодове към съобщението", async () => {
    insertError.value = {
      code: "PGRST204",
      message:
        "Could not find the 'product_extracted_chars' column of 'uploaded_contracts' in the schema cache",
    };
    await expect(
      prepareProductDocument({ userId: "u1", title: "Наем", file }),
    ).rejects.toThrow(PRODUCT_SCHEMA_UNAVAILABLE_MESSAGE);

    try {
      await prepareProductDocument({ userId: "u1", title: "Наем", file });
    } catch (e) {
      const msg = (e as Error).message;
      for (const banned of [
        "product_extracted_chars",
        "uploaded_contracts",
        "schema cache",
        "PGRST",
        "column",
      ]) {
        expect(msg).not.toContain(banned);
      }
    }
  });

  it("чисти само току-що качения обект при неуспешен запис", async () => {
    insertError.value = { code: "PGRST204", message: "could not find the column" };
    await expect(
      prepareProductDocument({ userId: "u1", title: "Наем", file }),
    ).rejects.toThrow();
    expect(storageRemove).toHaveBeenCalledTimes(1);
    const paths = storageRemove.mock.calls[0][0] as string[];
    expect(paths).toHaveLength(1);
    expect(paths[0].startsWith("u1/")).toBe(true);
  });

  it("успешният запис връща подготвен документ", async () => {
    const res = await prepareProductDocument({ userId: "u1", title: "Наем", file });
    expect(res.uploadedContractId).toBe("uc1");
    expect(res.extractionStatus).toBe("full");
    expect(storageRemove).not.toHaveBeenCalled();
  });
});
