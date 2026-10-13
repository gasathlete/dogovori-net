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

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function deflateRaw(b: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([b as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
}

/** Минимален синтетичен DOCX (fixture, без клиентски данни). */
async function makeZip(files: Record<string, string>, opts: { encrypt?: boolean; lieSize?: boolean } = {}): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const locals: number[] = [];
  const central: number[] = [];
  const le16 = (a: number[], v: number) => a.push(v & 0xff, (v >> 8) & 0xff);
  const le32 = (a: number[], v: number) => a.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  let count = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = enc.encode(content);
    const comp = await deflateRaw(data);
    const nameB = enc.encode(name);
    const offset = locals.length;
    const flags = opts.encrypt ? 1 : 0;
    const size = opts.lieSize ? data.length + 7 : data.length;
    le32(locals, 0x04034b50); le16(locals, 20); le16(locals, flags); le16(locals, 8);
    le16(locals, 0); le16(locals, 0); le32(locals, crc32(data)); le32(locals, comp.length);
    le32(locals, size); le16(locals, nameB.length); le16(locals, 0);
    locals.push(...nameB, ...comp);
    le32(central, 0x02014b50); le16(central, 20); le16(central, 20); le16(central, flags); le16(central, 8);
    le16(central, 0); le16(central, 0); le32(central, crc32(data)); le32(central, comp.length);
    le32(central, size); le16(central, nameB.length); le16(central, 0); le16(central, 0);
    le16(central, 0); le16(central, 0); le32(central, 0); le32(central, offset);
    central.push(...nameB);
    count++;
  }
  const eocd: number[] = [];
  le32(eocd, 0x06054b50); le16(eocd, 0); le16(eocd, 0); le16(eocd, count); le16(eocd, count);
  le32(eocd, central.length); le32(eocd, locals.length); le16(eocd, 0);
  return new Uint8Array([...locals, ...central, ...eocd]);
}

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
  sha256HexBytes(new TextEncoder().encode(normalizeProductSourceText(paras.join("\n"))));

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
  assertEquals(a.text, normalizeProductSourceText(PARAS.join("\n")));
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
  assertEquals(t, "А\tБ\n\n");
});

Deno.test("attestation module does not open the live bridge", async () => {
  assertEquals(PRODUCT_TRUSTED_SOURCE_BRIDGE.available, false);
  await assertRejects(() => Promise.reject(new AttestationError("source_mismatch")));
});
