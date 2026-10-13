import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { makeZip } from "./test-docx-fixture.ts";
import { attestationReceiptRow, bindTrustedProductSource, PRODUCT_SOURCE_BUCKET } from "./product-source-binding.ts";
import { countProductSourceChars, normalizeProductSourceText } from "./product-source.ts";
import { sha256HexBytes } from "./product-source-attestation.ts";
import { PRODUCT_TRUSTED_SOURCE_BRIDGE, productTrustedSourceBlockers } from "./product-trusted-source.ts";

const OWNER = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const PARAS = [
  "ДОГОВОР ЗА УСЛУГА (синтетичен тестов текст, без лични данни)",
  "1. Изпълнителят предава резултата до 30 дни от подписване на договора.",
  "2. Възложителят заплаща възнаграждение по банков път в срок от 10 дни.",
];
const text = normalizeProductSourceText(PARAS.join("\n"));
const sha = (v: string) => sha256HexBytes(new TextEncoder().encode(v));
const xml = (p: string[]) => `<w:document><w:body>${p.map((x) => `<w:p><w:r><w:t>${x}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`;
const docx = (p = PARAS) => makeZip({ "[Content_Types].xml": "<Types/>", "word/document.xml": xml(p) });

async function rowFor(over: Record<string, unknown> = {}) {
  return {
    id: "doc-1", user_id: OWNER, storage_path: `${OWNER}/a.docx`, extracted_text: text,
    text_hash: await sha(text), updated_at: "2026-10-13T09:00:00.000Z", product_extraction_status: "full",
    product_extracted_chars: countProductSourceChars(text), product_source_pages: null, product_source_kind: "docx",
    ...over,
  };
}
function deps(row: unknown, file: Uint8Array | null) {
  const downloads: string[] = [];
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row }) };
  return {
    downloads,
    d: {
      db: { from: (t: string) => { assertEquals(t, "uploaded_contracts"); return q; } },
      download: async (bucket: string, path: string) => { downloads.push(`${bucket}:${path}`); return file; },
      sha256Hex: sha,
    },
  };
}
const ENV = "sandbox" as const;

Deno.test("bridge stays OFF: paid path remains closed", () => {
  assertEquals(PRODUCT_TRUSTED_SOURCE_BRIDGE.available, false);
  assertEquals(productTrustedSourceBlockers(), ["trusted_source_unavailable"]);
});

Deno.test("binds only server-extracted text from owner storage", async () => {
  const { d, downloads } = deps(await rowFor(), await docx());
  const r = await bindTrustedProductSource(d, { userId: OWNER, documentId: "doc-1", environment: ENV });
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.source.modelText, text);
  assertEquals(downloads, [`${PRODUCT_SOURCE_BUCKET}:${OWNER}/a.docx`]);
  const receipt = attestationReceiptRow(r.source.attestation, "intake-1");
  assert(!("text" in receipt));
  assertEquals(receipt.environment, "sandbox");
});

Deno.test("cross-user document is refused without download", async () => {
  const { d, downloads } = deps(await rowFor({ user_id: OTHER }), await docx());
  const r = await bindTrustedProductSource(d, { userId: OWNER, documentId: "doc-1", environment: ENV });
  assertEquals(r.ok ? "ok" : r.code, "document_not_found");
  assertEquals(downloads.length, 0);
});

Deno.test("forged browser text (consistent hash, different file) is refused", async () => {
  const forged = normalizeProductSourceText([...PARAS, "3. Добавена от браузъра клауза, която я няма във файла."].join("\n"));
  const row = await rowFor({ extracted_text: forged, text_hash: await sha(forged), product_extracted_chars: countProductSourceChars(forged) });
  const { d } = deps(row, await docx());
  const r = await bindTrustedProductSource(d, { userId: OWNER, documentId: "doc-1", environment: ENV });
  assertEquals(r.ok ? "ok" : r.reason, "source_mismatch");
});

Deno.test("partial/truncated stored text is refused", async () => {
  const { d } = deps(await rowFor({ product_extraction_status: "partial" }), await docx());
  const r = await bindTrustedProductSource(d, { userId: OWNER, documentId: "doc-1", environment: ENV });
  assertEquals(r.ok ? "ok" : r.code, "source_changed");
});

Deno.test("missing file / PDF / foreign storage path are not attested", async () => {
  for (const [over, file] of [
    [{}, null],
    [{ product_source_kind: "pdf", storage_path: `${OWNER}/a.pdf` }, await docx()],
    [{ storage_path: `${OTHER}/a.docx` }, await docx()],
  ] as const) {
    const { d } = deps(await rowFor(over), file);
    const r = await bindTrustedProductSource(d, { userId: OWNER, documentId: "doc-1", environment: ENV });
    assertEquals(r.ok ? "ok" : r.code, "source_not_attested");
  }
});

Deno.test("fulfillment re-check: revision race, hash tamper, wrong environment", async () => {
  const base = { user_id: OWNER, source_document_id: "doc-1", source_hash: await sha(text), source_updated_at: "2026-10-13T09:00:00.000Z", environment: "sandbox" };
  for (const expected of [
    { ...base, source_updated_at: "2026-10-13T08:00:00.000Z" },
    { ...base, source_hash: "0".repeat(64) },
    { ...base, environment: "live" },
    { ...base, user_id: OTHER },
  ]) {
    const { d } = deps(await rowFor(), await docx());
    const r = await bindTrustedProductSource(d, { userId: OWNER, documentId: "doc-1", environment: ENV, expected });
    assertEquals(r.ok ? "ok" : r.code, "source_changed");
  }
  const { d } = deps(await rowFor(), await docx());
  assert((await bindTrustedProductSource(d, { userId: OWNER, documentId: "doc-1", environment: ENV, expected: base })).ok);
});
