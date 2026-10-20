/**
 * Контролиран ТЕКСТОВ вход за „Анализ на документ“.
 *
 * Единственият поддържан път за запис на суров текст в uploaded_contracts
 * от браузъра (след 0044 клиентските роли не могат да пишат текст директно).
 *   - само JSON текст + метаданни; без файл, без OCR, без storage;
 *   - собственикът идва САМО от проверения JWT;
 *   - текст и заглавие минават сървърната преграда за ЕГН/IBAN/лични карти
 *     ПРЕДИ какъвто и да е запис;
 *   - папка/контакт се проверяват, че са на същия собственик;
 *   - create е идемпотентен по избран от клиента UUID, обвързан със
 *     собственик + точния текст + заглавие; същият id с друго съдържание или
 *     друг собственик е отказ;
 *   - update изисква собственик и точната ревизия (updated_at).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { isNewProcessingOpen, newProcessingClosedResponse } from "../_shared/new-processing-gate.ts";
import { restrictedIdentifierBlock } from "../_shared/text-identifier-gate.ts";
import { checkRateLimitStrict } from "../_shared/rate-limit.ts";
import {
  countProductSourceChars, normalizeProductSourceText, PRODUCT_MAX_SOURCE_CHARS, PRODUCT_MIN_SOURCE_CHARS,
} from "../_shared/product-source.ts";
import { OWNER_TEXT_ATTESTATION_VERSION, ownerTextDigest } from "../_shared/product-source-binding.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MIN_TEXT = 80;
export const MAX_TEXT = 200_000;
export const MAX_TITLE = 300;
const CREATE_KEYS = new Set(["action", "id", "title", "text", "folder_id", "contact_id", "product_source"]);
const UPDATE_KEYS = new Set(["action", "id", "title", "text", "expected_updated_at", "product_source"]);

async function sha256Hex(text: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type Validated =
  | { ok: false; code: string }
  | { ok: true; action: "create"; id: string; title: string; text: string; folder_id: string | null; contact_id: string | null; product_source: boolean }
  | { ok: true; action: "update"; id: string; title?: string; text?: string; expected_updated_at: string; product_source: boolean };

/**
 * Платен продукт: каноничен (нормализиран) текст, 80..60000 кодови точки,
 * без тихо отрязване. Връща null при несъответствие.
 */
export function productText(text: string): { text: string; chars: number } | null {
  const t = normalizeProductSourceText(text);
  const chars = countProductSourceChars(t);
  if (chars < PRODUCT_MIN_SOURCE_CHARS || chars > PRODUCT_MAX_SOURCE_CHARS) return null;
  return { text: t, chars };
}

/** Чиста валидация на тялото (без мрежа) — тествана отделно. */
export function validateBody(body: unknown): Validated {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, code: "invalid_body" };
  const b = body as Record<string, unknown>;
  const allowed = b.action === "create" ? CREATE_KEYS : b.action === "update" ? UPDATE_KEYS : null;
  if (!allowed) return { ok: false, code: "invalid_action" };
  for (const k of Object.keys(b)) if (!allowed.has(k)) return { ok: false, code: "field_not_allowed" };
  if (typeof b.id !== "string" || !UUID.test(b.id)) return { ok: false, code: "invalid_id" };
  if (b.product_source !== undefined && typeof b.product_source !== "boolean") return { ok: false, code: "invalid_product_source" };
  const product_source = b.product_source === true;
  const checkTitle = (t: unknown) => typeof t === "string" && t.trim().length > 0 && t.trim().length <= MAX_TITLE;
  const checkText = (t: unknown) => typeof t === "string" && t.trim().length >= MIN_TEXT && t.length <= MAX_TEXT;
  const optUuid = (v: unknown) => v === undefined || v === null || (typeof v === "string" && UUID.test(v));
  if (b.action === "create") {
    if (!checkTitle(b.title)) return { ok: false, code: "invalid_title" };
    if (!checkText(b.text)) return { ok: false, code: "invalid_text" };
    if (!optUuid(b.folder_id) || !optUuid(b.contact_id)) return { ok: false, code: "invalid_reference" };
    return {
      ok: true, action: "create", id: b.id.toLowerCase(),
      title: (b.title as string).trim(), text: (b.text as string).trim(),
      folder_id: (b.folder_id as string | null | undefined) ?? null,
      contact_id: (b.contact_id as string | null | undefined) ?? null,
      product_source,
    };
  }
  if (typeof b.expected_updated_at !== "string" || Number.isNaN(Date.parse(b.expected_updated_at))) {
    return { ok: false, code: "invalid_revision" };
  }
  if (b.title === undefined && b.text === undefined) return { ok: false, code: "nothing_to_update" };
  if (b.title !== undefined && !checkTitle(b.title)) return { ok: false, code: "invalid_title" };
  if (b.text !== undefined && !checkText(b.text)) return { ok: false, code: "invalid_text" };
  return {
    ok: true, action: "update", id: b.id.toLowerCase(),
    title: b.title === undefined ? undefined : (b.title as string).trim(),
    text: b.text === undefined ? undefined : (b.text as string),
    expected_updated_at: b.expected_updated_at,
    product_source,
  };
}

const ROW_COLS = "id,title,source,storage_path,original_filename,text_hash,extracted_text,contact_id,folder_id,created_at,updated_at";

Deno.serve(async (req) => {
  const cors = buildCors(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    if (!isNewProcessingOpen("document_content_save")) return newProcessingClosedResponse("document_content_save", cors);

    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u, error: uErr } = await admin.auth.getUser(auth.slice(7));
    if (uErr || !u?.user) return json(401, { error: "Unauthorized" });
    const userId = u.user.id;

    let raw: unknown;
    try { raw = await req.json(); } catch { return json(400, { error: "invalid_body" }); }
    const v = validateBody(raw);
    if (!v.ok) return json(400, { error: v.code });
    let productChars: number | null = null;
    if (v.product_source) {
      if (v.text === undefined) return json(400, { error: "product_text_required" });
      const pt = productText(v.text);
      if (!pt) return json(422, { error: "product_text_length" });
      v.text = pt.text;
      productChars = pt.chars;
    }

    // Сървърна преграда за лични идентификатори ПРЕДИ всяка заявка към базата.
    const blocked = restrictedIdentifierBlock([v.title ?? "", v.text ?? ""], cors);
    if (blocked) return blocked;

    const rl = await checkRateLimitStrict(`uploaded-text:${userId}`, 30, 600);
    if (!rl.ok) return json(rl.unavailable ? 503 : 429, { error: rl.unavailable ? "rate_limit_unavailable" : "rate_limited" });

    // Сървърна разписка (service role) за точния текст и ревизия на реда.
    const receipt = async (row: { id: string; text_hash: string; updated_at: string }) => {
      if (productChars === null) return true;
      const digest = await ownerTextDigest(sha256Hex, {
        userId, documentId: row.id, textSha256: row.text_hash, charCount: productChars, revision: String(row.updated_at),
      });
      const { error } = await admin.from("product_text_attestations").upsert({
        user_id: userId, uploaded_contract_id: row.id, attestation_version: OWNER_TEXT_ATTESTATION_VERSION,
        text_sha256: row.text_hash, char_count: productChars, source_revision: String(row.updated_at), digest,
      }, { onConflict: "uploaded_contract_id,source_revision", ignoreDuplicates: true });
      return !error;
    };
    const productCols = productChars === null
      ? { product_extraction_status: null, product_extracted_chars: null, product_source_kind: null, product_source_pages: null }
      : { product_extraction_status: "full", product_extracted_chars: productChars, product_source_kind: "owner_text", product_source_pages: null, product_extraction_at: new Date().toISOString() };

    if (v.action === "create") {
      const text_hash = await sha256Hex(v.text);
      const { data: existing } = await admin.from("uploaded_contracts")
        .select(`${ROW_COLS},user_id`).eq("id", v.id).maybeSingle();
      if (existing) {
        const same = existing.user_id === userId && existing.text_hash === text_hash && existing.title === v.title &&
          existing.source === "paste";
        if (!same) return json(409, { error: "id_conflict" });
        const { user_id: _o, ...row } = existing;
        if (!(await receipt(row))) return json(500, { error: "attestation_failed" });
        return json(200, { contract: row, replayed: true });
      }
      if (v.folder_id) {
        const { data: f } = await admin.from("folders").select("id").eq("id", v.folder_id).eq("user_id", userId).maybeSingle();
        if (!f) return json(403, { error: "folder_not_owned" });
      }
      if (v.contact_id) {
        const { data: c } = await admin.from("contacts").select("id").eq("id", v.contact_id).eq("user_id", userId)
          .is("deleted_at", null).maybeSingle();
        if (!c) return json(403, { error: "contact_not_owned" });
      }
      const { data: row, error } = await admin.from("uploaded_contracts").insert({
        id: v.id, user_id: userId, folder_id: v.folder_id, contact_id: v.contact_id,
        title: v.title, source: "paste", extracted_text: v.text, text_hash,
        original_filename: null, storage_path: null, mime_type: null, size_bytes: null,
        ...productCols,
      }).select(ROW_COLS).single();
      if (error) {
        if ((error as { code?: string }).code === "23505") return json(409, { error: "id_conflict" });
        console.error("uploaded-text-intake insert", (error as { code?: string }).code);
        return json(500, { error: "save_failed" });
      }
      if (!(await receipt(row))) return json(500, { error: "attestation_failed" });
      return json(201, { contract: row, replayed: false });
    }

    // update: собственик + точна ревизия; чужд/липсващ id се отказва преди промяна.
    const { data: cur } = await admin.from("uploaded_contracts")
      .select("id,user_id,updated_at").eq("id", v.id).maybeSingle();
    if (!cur || cur.user_id !== userId) return json(404, { error: "not_found" });
    if (Date.parse(cur.updated_at) !== Date.parse(v.expected_updated_at)) return json(409, { error: "revision_conflict" });
    // Всяка промяна инвалидира старата разписка (нова ревизия); без product_source
    // продуктовите полета се изчистват.
    const patch: Record<string, unknown> = { ...productCols };
    if (v.title !== undefined) patch.title = v.title;
    if (v.text !== undefined) { patch.extracted_text = v.text; patch.text_hash = await sha256Hex(v.text); }
    const { data: row, error } = await admin.from("uploaded_contracts").update(patch)
      .eq("id", v.id).eq("user_id", userId).eq("updated_at", cur.updated_at)
      .select(ROW_COLS).maybeSingle();
    if (error) return json(500, { error: "save_failed" });
    if (!row) return json(409, { error: "revision_conflict" });
    if (!(await receipt(row))) return json(500, { error: "attestation_failed" });
    return json(200, { contract: row });
  } catch (e) {
    console.error("uploaded-text-intake", e instanceof Error ? e.name : "error");
    return json(500, { error: "internal_error" });
  }
});
