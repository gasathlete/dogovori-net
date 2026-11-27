import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AttestationError,
  attestationMatchesEntitlement,
  attestProductSource,
  extractDocxXmlText,
  isOwnedStoragePath,
  sha256HexBytes,
} from "./product-source-attestation.ts";
import { normalizeProductSourceText } from "./product-source.ts";
import { PRODUCT_TRUSTED_SOURCE_BRIDGE } from "./product-trusted-source.ts";

const OWNER = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";

import { makeZip } from "./test-docx-fixture.ts";

const PARAS = [
  "ДОГОВОР ЗА НАЕМ НА ЖИЛИЩЕ (синтетичен тестов текст)",
  "1. Наемателят заплаща месечен наем от 900 евро до 5-то число на месеца.",
  "2. Депозитът е в размер на два месечни наема & се връща при напускане.",
  "3. Договорът се прекратява с едномесечно писмено предизвестие.",
];
const xml = (paras: string[]) =>
  `<?xml version="1.0"?><w:document><w:body>${
    paras.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p.replace(/&/g, "&amp;")}</w:t></w:r></w:p>`).join("")
  }</w:body></w:document>`;
const docx = (paras = PARAS, opts = {}) =>
  makeZip({ "[Content_Types].xml": "<Types/>", "word/document.xml": xml(paras) }, opts);
const textHash = async (paras = PARAS) =>
  sha256HexBytes(new TextEncoder().encode(normalizeProductSourceText(paras.join("\n\n"))));

async function row(over: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    user_id: OWNER,
    storage_path: `${OWNER}/a.docx`,
    product_source_kind: "docx",
    text_hash: await textHash(),
    updated_at: "2026-10-13T09:00:00.000Z",
    ...over,
  };
}
const reason = async (p: Promise<unknown>) => {
  try { await p; return "ok"; } catch (e) { return e instanceof AttestationError ? e.reason : String(e); }
};

Deno.test("attests server-extracted DOCX text and binds owner/file/revision/env", async () => {
  const bytes = await docx();
  const a = await attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: bytes, row: await row() });
  assertEquals(a.text, normalizeProductSourceText(PARAS.join("\n\n")));
  assertEquals(a.textSha256, await textHash());
  assertEquals(a.fileSha256, await sha256HexBytes(bytes));
  assert(a.text.includes("два месечни наема & се връща"));
  assert(/^[0-9a-f]{64}$/.test(a.digest));
  const ent = { user_id: OWNER, source_document_id: "doc-1", source_hash: a.textSha256, source_updated_at: a.revision, environment: "sandbox" };
  assert(attestationMatchesEntitlement(a, ent));
  assert(!attestationMatchesEntitlement(a, { ...ent, environment: "live" }));
  assert(!attestationMatchesEntitlement(a, { ...ent, source_updated_at: "2026-10-13T10:00:00.000Z" }));
  assert(!attestationMatchesEntitlement(a, { ...ent, user_id: OTHER }));
});

Deno.test("browser-forged text hash (spoofing) is rejected", async () => {
  const forged = await textHash(["Изцяло различен текст, записан от браузъра. ".repeat(4)]);
  assertEquals(await reason(attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: await docx(), row: await row({ text_hash: forged }) })), "source_mismatch");
});

Deno.test("replaced file (same row, other bytes) is rejected", async () => {
  const other = await docx([...PARAS, "4. Добавена клауза след плащането."]);
  assertEquals(await reason(attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: other, row: await row() })), "source_mismatch");
});

Deno.test("other user / foreign storage path / traversal rejected", async () => {
  const bytes = await docx();
  assertEquals(await reason(attestProductSource({ ownerId: OTHER, environment: "sandbox", fileBytes: bytes, row: await row() })), "owner_mismatch");
  assertEquals(await reason(attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: bytes, row: await row({ storage_path: `${OTHER}/a.docx` }) })), "storage_path_invalid");
  assert(!isOwnedStoragePath(`${OWNER}/../${OTHER}/a.docx`, OWNER));
  assert(!isOwnedStoragePath(`${OWNER}/`, OWNER));
});

Deno.test("partial / malformed / encrypted / truncated files fail closed", async () => {
  const r = await row();
  const full = await docx();
  assertEquals(await reason(attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: full.slice(0, full.length - 30), row: r })), "docx_malformed");
  assertEquals(await reason(attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: await docx(PARAS, { encrypt: true }), row: r })), "docx_encrypted");
  assertEquals(await reason(attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: await docx(PARAS, { lieSize: true }), row: r })), "docx_malformed");
  assertEquals(await reason(attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: new TextEncoder().encode("%PDF-1.7 fake"), row: r })), "file_type_mismatch");
  assertEquals(await reason(attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: null, row: r })), "file_missing");
});

Deno.test("PDF is explicitly not attestable; oversize, short and missing revision rejected", async () => {
  assertEquals(await reason(attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: await docx(), row: await row({ product_source_kind: "pdf", storage_path: `${OWNER}/a.pdf` }) })), "source_kind_not_attestable");
  assertEquals(await reason(attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: new Uint8Array(10 * 1024 * 1024 + 1), row: await row() })), "file_too_large");
  assertEquals(await reason(attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: await docx(["Кратко."]), row: await row({ text_hash: await textHash(["Кратко."]) }) })), "source_too_short");
  assertEquals(await reason(attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: await docx(), row: await row({ updated_at: null }) })), "revision_missing");
  const long = Array.from({ length: 700 }, (_, i) => `Клауза ${i}: ${"текст ".repeat(15)}`);
  assertEquals(await reason(attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: await docx(long), row: await row({ text_hash: await textHash(long) }) })), "source_too_long");
});

Deno.test("deterministic: concurrent attestations of same file give identical digest", async () => {
  const bytes = await docx();
  const r = await row();
  const [a, b] = await Promise.all([1, 2].map(() => attestProductSource({ ownerId: OWNER, environment: "sandbox", fileBytes: bytes, row: r })));
  assertEquals(a.digest, b.digest);
  const live = await attestProductSource({ ownerId: OWNER, environment: "live", fileBytes: bytes, row: r });
  assert(live.digest !== a.digest);
});

Deno.test("deleted/instruction text is not extracted; tabs/breaks kept", () => {
  const t = extractDocxXmlText(`<w:p><w:r><w:t>А</w:t><w:tab/><w:t>Б</w:t><w:br/><w:delText>скрито</w:delText><w:instrText>HYPERLINK</w:instrText></w:r></w:p>`);
  assertEquals(t, "А\tБ\n\n\n");
});

Deno.test("attestation module does not open the live bridge", async () => {
  assertEquals(PRODUCT_TRUSTED_SOURCE_BRIDGE.available, false);
  await assertRejects(() => Promise.reject(new AttestationError("source_mismatch")));
});

Deno.test("DOCX paragraph boundaries match browser Mammoth raw text before hashing", async () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>Трудов договор</w:t></w:r></w:p><w:p><w:r><w:t>Чл. 1. Възнаграждение 1500 евро.</w:t></w:r></w:p></w:body></w:document>';
  const browserText = "Трудов договор\n\nЧл. 1. Възнаграждение 1500 евро.";
  const serverText = normalizeProductSourceText(extractDocxXmlText(xml));
  assertEquals(serverText, browserText);
  assertEquals(await sha256HexBytes(new TextEncoder().encode(serverText)), await sha256HexBytes(new TextEncoder().encode(browserText)));
});
