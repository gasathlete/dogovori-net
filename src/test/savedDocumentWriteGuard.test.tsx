import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "x" } } })) }, functions: { invoke: vi.fn() } },
}));

import {
  assertSavedDocumentContentWrite,
  canWriteSavedDocumentContent,
  isStoragePointerOnlyDelta,
  metadataOnly,
  payloadChanged,
  SavedDocumentContentBlockedError,
} from "@/lib/savedDocumentWriteGuard";
import { supabase } from "@/integrations/supabase/client";
import { downloadDocument } from "@/lib/downloadDocument";

describe("клиентска преграда за ново съдържание в saved_documents", () => {
  it("затворено по подразбиране", () => {
    expect(canWriteSavedDocumentContent()).toBe(false);
  });
  it("ново/променено съдържание се отказва преди мрежата; метаданни и непроменено съдържание минават", () => {
    expect(() => assertSavedDocumentContentWrite({ payload: { text: "нов" } })).toThrow(SavedDocumentContentBlockedError);
    expect(() => assertSavedDocumentContentWrite({ payload: { text: "x" } }, { text: "y" })).toThrow();
    expect(() => assertSavedDocumentContentWrite({ payload: { a: 1, b: 2 } }, { b: 2, a: 1 })).not.toThrow();
    expect(() => assertSavedDocumentContentWrite({ title: "Ново име", folder_id: null })).not.toThrow();
    expect(metadataOnly({ title: "t", payload: { x: 1 } })).toEqual({ title: "t" });
    expect(payloadChanged({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(false);
  });
  it("само указателят storage_path може да се смени (0045), но не и текстът", () => {
    const prev = { text: "стар", storage_path: "u/a.pdf" };
    expect(isStoragePointerOnlyDelta(prev, { text: "стар", storage_path: "u/b.pdf" })).toBe(true);
    expect(isStoragePointerOnlyDelta(prev, { text: "нов", storage_path: "u/b.pdf" })).toBe(false);
    expect(() => assertSavedDocumentContentWrite({ payload: { text: "стар", storage_path: "u/b.pdf" } }, prev)).not.toThrow();
    expect(() => assertSavedDocumentContentWrite({ payload: { text: "нов", storage_path: "u/b.pdf" } }, prev)).toThrow();
  });
  it("сваляне на НЕзапазено ново съдържание не вика сървъра", async () => {
    const res = await downloadDocument({ kind: "contract", title: "Нов", payload: {}, format: "pdf" } as never);
    expect(res).toMatchObject({ ok: false, error: "content_save_prelaunch_closed" });
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
  it("kind=template с ново съдържание също не вика сървъра", async () => {
    const res = await downloadDocument({ kind: "template", title: "Преименуван", payload: { sections: [{ body: "суров" }] }, format: "pdf" } as never);
    expect(res).toMatchObject({ ok: false, error: "content_save_prelaunch_closed" });
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});
