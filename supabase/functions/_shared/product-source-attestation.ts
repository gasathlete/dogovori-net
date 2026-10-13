/**
 * НЕЗАВИСИМА сървърна атестация на източника на платен продукт.
 *
 * Доверието идва САМО от байтовете на файла, прочетени от сървъра от
 * server-owned storage обект. Текстът, хешът и метаданните, записани от
 * браузъра, се използват единствено за СЪПОСТАВКА: при разлика — отказ.
 * Каноничният текст за продукта е текстът, който СЪРВЪРЪТ извлича.
 *
 * Обхват (честно): поддържа се само DOCX (ZIP + word/document.xml). PDF не се
 * атестира — няма доказан сървърен PDF извличач без нова зависимост; връща
 * изричен отказ `source_kind_not_attestable`. Без частично извличане.
 *
 * Модулът е чист (без DB/Storage/Stripe). Извикващият код подава байтовете.
 * Не отваря `PRODUCT_TRUSTED_SOURCE_BRIDGE` — това става само след staging E2E.
 */
import {
  countProductSourceChars,
  normalizeProductSourceText,
  PRODUCT_MAX_SOURCE_CHARS,
  PRODUCT_MIN_SOURCE_CHARS,
} from "./product-source.ts";

export const ATTESTATION_VERSION = "psa-v1" as const;
/** Съвпада с лимита на bucket-а за договори (10 MiB). */
export const ATTEST_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Защита от zip bomb: максимален разархивиран размер на document.xml. */
export const ATTEST_MAX_XML_BYTES = 8 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2000;

export type AttestationProblem =
  | "owner_mismatch"
  | "storage_path_invalid"
  | "file_missing"
  | "file_too_large"
  | "file_type_mismatch"
  | "source_kind_not_attestable"
  | "docx_malformed"
  | "docx_encrypted"
  | "docx_too_large_uncompressed"
  | "source_too_short"
  | "source_too_long"
  | "source_mismatch"
  | "revision_missing"
  | "environment_invalid";

export class AttestationError extends Error {
  constructor(readonly reason: AttestationProblem) {
    super(reason);
    this.name = "AttestationError";
  }
}

export interface AttestationInput {
  readonly ownerId: string;
  readonly environment: "sandbox" | "live";
  readonly fileBytes: Uint8Array | null;
  /** Редът е прочетен от сървъра с service role, не от тялото на заявката. */
  readonly row: {
    readonly id: string;
    readonly user_id: string;
    readonly storage_path: string | null;
    readonly product_source_kind: string | null;
    readonly text_hash: string | null;
    readonly updated_at: string | null;
  };
}

export interface ProductSourceAttestation {
  readonly version: typeof ATTESTATION_VERSION;
  readonly documentId: string;
  readonly ownerId: string;
  readonly environment: "sandbox" | "live";
  readonly storagePath: string;
  readonly sourceKind: "docx";
  readonly fileSha256: string;
  readonly textSha256: string;
  readonly charCount: number;
  readonly revision: string;
  /** Сървърно извлеченият каноничен текст — единственият вход за модела. */
  readonly text: string;
  /** SHA-256 върху каноничния запис на атестацията (без текста). */
  readonly digest: string;
}

export async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Пътят трябва да е под префикса на собственика, без обхождане. */
export function isOwnedStoragePath(path: string | null, ownerId: string): path is string {
  if (!path || !UUID.test(ownerId)) return false;
  if (path.includes("..") || path.includes("\\") || path.includes("//")) return false;
  if (!path.startsWith(`${ownerId}/`)) return false;
  return path.length > ownerId.length + 1 && path.length <= 512;
}

// ---------------- ZIP / DOCX ----------------

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}
function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;
}

interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  compSize: number;
  size: number;
  localOffset: number;
}

function readCentralDirectory(b: Uint8Array): ZipEntry[] {
  // End of central directory: търсим отзад (коментар до 64 KiB).
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new AttestationError("docx_malformed");
  const count = u16(b, eocd + 10);
  const cdOffset = u32(b, eocd + 16);
  if (count === 0 || count > MAX_ZIP_ENTRIES || cdOffset >= b.length) {
    throw new AttestationError("docx_malformed");
  }
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  const dec = new TextDecoder("utf-8", { fatal: false });
  for (let i = 0; i < count; i++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) throw new AttestationError("docx_malformed");
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    entries.push({
      flags: u16(b, p + 8),
      method: u16(b, p + 10),
      compSize: u32(b, p + 20),
      size: u32(b, p + 24),
      localOffset: u32(b, p + 42),
      name: dec.decode(b.subarray(p + 46, p + 46 + nameLen)),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let r: ReadableStreamReadResult<Uint8Array>;
    try {
      r = await reader.read();
    } catch {
      throw new AttestationError("docx_malformed");
    }
    if (r.done) break;
    total += r.value.length;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new AttestationError("docx_too_large_uncompressed");
    }
    chunks.push(r.value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function readEntry(b: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  if (e.flags & 0x1) throw new AttestationError("docx_encrypted");
  if (e.size > ATTEST_MAX_XML_BYTES) throw new AttestationError("docx_too_large_uncompressed");
  const lo = e.localOffset;
  if (lo + 30 > b.length || u32(b, lo) !== 0x04034b50) throw new AttestationError("docx_malformed");
  const start = lo + 30 + u16(b, lo + 26) + u16(b, lo + 28);
  const end = start + e.compSize;
  if (end > b.length) throw new AttestationError("docx_malformed");
  const raw = b.subarray(start, end);
  let out: Uint8Array;
  if (e.method === 0) out = raw.slice();
  else if (e.method === 8) out = await inflateRaw(raw, ATTEST_MAX_XML_BYTES);
  else throw new AttestationError("docx_malformed");
  // Пълнота: разархивираният размер трябва да е точно обявения.
  if (out.length !== e.size) throw new AttestationError("docx_malformed");
  return out;
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, g: string) => {
    const k = g.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const cp = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
  });
}

/** Извлича видимия текст от word/document.xml: абзаци, табулации, нови редове. */
export function extractDocxXmlText(xml: string): string {
  const body = xml.replace(/<w:(delText|instrText)\b[^>]*>[\s\S]*?<\/w:\1>/g, "");
  const out: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>|<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const tok = m[0];
    if (m[1] !== undefined) out.push(decodeXmlEntities(m[1]));
    else if (tok.startsWith("<w:tab")) out.push("\t");
    else if (tok === "</w:p>") out.push("\n");
    else out.push("\n");
  }
  return out.join("");
}

export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  if (bytes.length < 4 || u32(bytes, 0) !== 0x04034b50) throw new AttestationError("file_type_mismatch");
  const entries = readCentralDirectory(bytes);
  const names = new Set(entries.map((e) => e.name));
  if (names.has("EncryptedPackage")) throw new AttestationError("docx_encrypted");
  const doc = entries.find((e) => e.name === "word/document.xml");
  if (!doc || !names.has("[Content_Types].xml")) throw new AttestationError("file_type_mismatch");
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(await readEntry(bytes, doc));
  // Вградени чужди формати не се четат → отказ вместо тихо непълен текст.
  if (/<w:altChunk\b/.test(xml)) throw new AttestationError("docx_malformed");
  return extractDocxXmlText(xml);
}

function canonicalRecord(a: Omit<ProductSourceAttestation, "digest" | "text">): string {
  const keys = Object.keys(a).sort() as (keyof typeof a)[];
  return JSON.stringify(keys.map((k) => [k, a[k]]));
}

/**
 * Атестира източника от байтовете на файла. Всяко несъответствие → изключение.
 * Записаният от браузъра `text_hash` трябва да е РАВЕН на сървърно извлечения
 * хеш; иначе браузърът е записал друг текст (подмяна) → `source_mismatch`.
 */
export async function attestProductSource(input: AttestationInput): Promise<ProductSourceAttestation> {
  const { row, ownerId } = input;
  if (input.environment !== "sandbox" && input.environment !== "live") {
    throw new AttestationError("environment_invalid");
  }
  if (row.user_id !== ownerId) throw new AttestationError("owner_mismatch");
  if (!isOwnedStoragePath(row.storage_path, ownerId)) throw new AttestationError("storage_path_invalid");
  if (!row.updated_at) throw new AttestationError("revision_missing");
  if (row.product_source_kind === "pdf") throw new AttestationError("source_kind_not_attestable");
  if (row.product_source_kind !== "docx" || !/\.docx$/i.test(row.storage_path)) {
    throw new AttestationError("file_type_mismatch");
  }
  const bytes = input.fileBytes;
  if (!bytes || bytes.length === 0) throw new AttestationError("file_missing");
  if (bytes.length > ATTEST_MAX_FILE_BYTES) throw new AttestationError("file_too_large");

  const text = normalizeProductSourceText(await extractDocxText(bytes));
  const charCount = countProductSourceChars(text);
  if (charCount < PRODUCT_MIN_SOURCE_CHARS) throw new AttestationError("source_too_short");
  if (charCount > PRODUCT_MAX_SOURCE_CHARS) throw new AttestationError("source_too_long");

  const textSha256 = await sha256HexBytes(new TextEncoder().encode(text));
  if (String(row.text_hash ?? "").toLowerCase() !== textSha256) {
    throw new AttestationError("source_mismatch");
  }
  const base = {
    version: ATTESTATION_VERSION,
    documentId: row.id,
    ownerId,
    environment: input.environment,
    storagePath: row.storage_path,
    sourceKind: "docx" as const,
    fileSha256: await sha256HexBytes(bytes),
    textSha256,
    charCount,
    revision: row.updated_at,
  };
  const digest = await sha256HexBytes(new TextEncoder().encode(canonicalRecord(base)));
  return { ...base, text, digest };
}

/**
 * Повторна проверка преди обработка/уточнение: същият файл, същият текст,
 * същата ревизия, същият собственик и среда. Иначе — остаряло, спира.
 */
export function attestationMatchesEntitlement(
  a: ProductSourceAttestation,
  ent: {
    readonly user_id: string;
    readonly source_document_id: string;
    readonly source_hash: string;
    readonly source_updated_at: string;
    readonly environment: string;
  },
): boolean {
  return (
    a.ownerId === ent.user_id &&
    a.documentId === ent.source_document_id &&
    a.textSha256 === String(ent.source_hash).toLowerCase() &&
    a.revision === String(ent.source_updated_at) &&
    a.environment === ent.environment
  );
}
