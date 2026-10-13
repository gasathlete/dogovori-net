/**
 * Единственият сървърен вход за ИЗТОЧНИКА на платен продукт (checkout,
 * обработка, уточнение).
 *
 * 1. Редът се чете със service role по id; собственикът трябва да е заявителят.
 * 2. Вътрешната съгласуваност на записа се проверява (`verifyStoredProductSource`).
 * 3. Файлът се сваля от собственото хранилище и текстът се извлича ОТ СЪРВЪРА
 *    (`attestProductSource`). Записаният от браузъра хеш трябва да е равен на
 *    сървърно извлечения; иначе → отказ.
 * 4. Към модела се подава САМО сървърно извлеченият текст. Резервен вариант с
 *    текст от браузъра НЯМА — при липса на атестация пътят е затворен.
 *
 * Мостът `PRODUCT_TRUSTED_SOURCE_BRIDGE` остава изключен: функциите спират по-рано
 * на `trusted_source_unavailable`. Този модул е готовата и тествана граница,
 * която ще бъде включена само след staging доказателство.
 */
import {
  AttestationError,
  attestationMatchesEntitlement,
  attestProductSource,
  type ProductSourceAttestation,
} from "./product-source-attestation.ts";
import {
  ProductSourceError,
  verifyStoredProductSource,
  type VerifiedProductSource,
} from "./product-source.ts";

export const PRODUCT_SOURCE_BUCKET = "user-contracts" as const;

export const SOURCE_ROW_SELECT =
  "id, user_id, storage_path, extracted_text, text_hash, updated_at, product_extraction_status, product_extracted_chars, product_source_pages, product_source_kind";

export type SourceBindingFailure =
  | "document_not_found"
  | "source_changed"
  | "source_not_attested";

export interface BoundProductSource {
  readonly verified: VerifiedProductSource;
  readonly attestation: ProductSourceAttestation;
  /** Текстът за модела = сървърно извлечения; никога не е текст от браузъра. */
  readonly modelText: string;
}

export type BindResult =
  | { ok: true; source: BoundProductSource }
  | { ok: false; code: SourceBindingFailure; reason: string };

/** Минимален служебен клиент (service role) — подава се от функцията. */
export interface SourceBindingDeps {
  // deno-lint-ignore no-explicit-any
  readonly db: { from(table: string): any };
  readonly download: (bucket: string, path: string) => Promise<Uint8Array | null>;
  readonly sha256Hex: (value: string) => Promise<string>;
}

export interface ExpectedBinding {
  readonly user_id: string;
  readonly source_document_id: string;
  readonly source_hash: string;
  readonly source_updated_at: string;
  readonly environment: string;
}

export async function bindTrustedProductSource(
  deps: SourceBindingDeps,
  input: {
    readonly userId: string;
    readonly documentId: string;
    readonly environment: "sandbox" | "live";
    /** При обработка/уточнение: точното платено обвързване. */
    readonly expected?: ExpectedBinding;
  },
): Promise<BindResult> {
  const { data: row } = await deps.db
    .from("uploaded_contracts")
    .select(SOURCE_ROW_SELECT)
    .eq("id", input.documentId)
    .maybeSingle();
  if (!row || row.user_id !== input.userId) {
    return { ok: false, code: input.expected ? "source_changed" : "document_not_found", reason: "owner" };
  }

  let verified: VerifiedProductSource;
  try {
    verified = await verifyStoredProductSource(row, deps.sha256Hex);
  } catch (error) {
    if (error instanceof ProductSourceError) {
      return { ok: false, code: "source_changed", reason: error.reason };
    }
    throw error;
  }

  let bytes: Uint8Array | null = null;
  if (typeof row.storage_path === "string" && row.storage_path.startsWith(`${input.userId}/`)) {
    bytes = await deps.download(PRODUCT_SOURCE_BUCKET, row.storage_path).catch(() => null);
  }

  let attestation: ProductSourceAttestation;
  try {
    attestation = await attestProductSource({
      ownerId: input.userId,
      environment: input.environment,
      fileBytes: bytes,
      row,
    });
  } catch (error) {
    if (error instanceof AttestationError) {
      return { ok: false, code: "source_not_attested", reason: error.reason };
    }
    throw error;
  }

  // Двете независими измервания трябва да съвпаднат напълно.
  if (
    attestation.text !== verified.text ||
    attestation.textSha256 !== verified.sourceHash ||
    attestation.charCount !== verified.charCount ||
    attestation.revision !== String(verified.sourceUpdatedAt)
  ) {
    return { ok: false, code: "source_not_attested", reason: "source_mismatch" };
  }
  if (input.expected && !attestationMatchesEntitlement(attestation, input.expected)) {
    return { ok: false, code: "source_changed", reason: "binding_mismatch" };
  }
  return { ok: true, source: { verified, attestation, modelText: attestation.text } };
}

/**
 * Сървърна разписка за staging таблицата `product_source_attestations`
 * (service-role only). Без текста на документа.
 */
export function attestationReceiptRow(a: ProductSourceAttestation, intakeId: string | null) {
  return {
    user_id: a.ownerId,
    uploaded_contract_id: a.documentId,
    intake_id: intakeId,
    environment: a.environment,
    attestation_version: a.version,
    source_kind: a.sourceKind,
    file_sha256: a.fileSha256,
    text_sha256: a.textSha256,
    char_count: a.charCount,
    source_revision: a.revision,
    digest: a.digest,
  };
}

/** Адаптер за Supabase Storage с service role. */
export function storageDownloader(
  // deno-lint-ignore no-explicit-any
  admin: { storage: { from(bucket: string): { download(path: string): Promise<{ data: any; error: unknown }> } } },
): SourceBindingDeps["download"] {
  return async (bucket, path) => {
    const { data, error } = await admin.storage.from(bucket).download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  };
}
