// Edge function: lazy generation + signed-URL delivery of blank document templates (.docx)
// - Looks up an existing blank in `document_blanks` for { sector_id, document_name }.
// - If absent, generates a professional Bulgarian legal blank via Lovable AI Gateway,
//   packages it as a .docx, uploads to the `document-blanks` bucket and indexes it.
// - Always consumes the `template` quota for the calling user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "https://esm.sh/docx@8.5.0";
import { buildCors } from "../_shared/cors.ts";
import { getDocumentTypeSpec, inferDocumentType } from "../_shared/document-types.ts";


const SYSTEM_PROMPT = `Ти си български правен архитект с 20+ години практика. Генерираш ПРАЗНИ БЛАНКИ (шаблони) на български юридически език (ЗЗД, ТЗ, ЗУТ, ГПК, КТ, ЗННД).

Бланката трябва да:
- съдържа всички задължителни клаузи и реквизити според вида на конкретния документ;
- използва [квадратни скоби] за всички места, които ползвателят трябва да попълни (имена, ЕИК/ЕГН, адреси, суми в евро, срокове, дати);
- НЕ съдържа конкретни данни — само празни полета;
- е готова за разпечатване и нотариална/правна употреба;
- спазва точната терминология и структура за СЪОТВЕТНИЯ ВИД документ — разписка ≠ договор ≠ декларация ≠ пълномощно ≠ жалба ≠ искова молба ≠ нотариална покана ≠ оферта ≠ фактура ≠ протокол ≠ анекс ≠ приложение ≠ КСС/СМР;
- използва коректна номерация: римска за раздели (за договори/споразумения), "Чл. N." за членове, "(1),(2)" за алинеи; за по-кратки документи (разписка, декларация, пълномощно) — без излишна правна структура.

Връщай СТРОГО валиден JSON (без markdown), точно тази структура:
{
  "title": "Точното заглавие на документа",
  "preamble": "Уводен текст с [плейсхолдъри] за дата, място, страни",
  "clauses": [
    { "number": "I.", "title": "ПРЕДМЕТ", "body": "Чл. 1. ...\\nЧл. 2. ..." }
  ],
  "closing": "Заключителен текст + подписи"
}`;

const BILINGUAL_ADDENDUM = `

БИЛИНГВАЛЕН РЕЖИМ (BG/EN): ЗАДЪЛЖИТЕЛНО върни паралелен професионален английски превод. Към JSON схемата добави:
- "title_en": английското заглавие
- "preamble_en": английски превод на преамбюла, със [square bracket] плейсхолдъри
- "closing_en": английски превод на заключителния текст
- във всеки елемент на "clauses" — "title_en" и "body_en" с английски превод

Преводът е професионален легален английски (US/UK неутрален). Номерацията съответства 1:1 — където на български е "Чл. 1.", на английски е "Art. 1.". Английският текст НЕ заменя българския — двата съществуват паралелно и са огледални по съдържание. Запази всички плейсхолдъри в [квадратни скоби] и в двата езика.`;


interface BlankPayload {
  title: string;
  preamble: string;
  clauses: Array<{ number: string; title: string; body: string; title_en?: string; body_en?: string }>;
  closing: string;
  title_en?: string;
  preamble_en?: string;
  closing_en?: string;
}

function extractJson(raw: string): BlankPayload {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned) as BlankPayload;
}

function paragraphsFromText(text: string, opts: { bold?: boolean; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {}): Paragraph[] {
  const lines = (text ?? "").split(/\n+/).filter(Boolean);
  if (lines.length === 0) return [new Paragraph({ text: "" })];
  return lines.map((line) =>
    new Paragraph({
      alignment: opts.align ?? AlignmentType.JUSTIFIED,
      spacing: { after: 160 },
      children: [new TextRun({ text: line, size: opts.size ?? 22, bold: opts.bold })],
    }),
  );
}

function buildDocx(blank: BlankPayload, isBilingual: boolean): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [];

  if (isBilingual) {
    // ----- Two-column BG/EN layout (mirrors src/lib/exporters.ts twoColRow) -----
    const TABLE_W = 9026;
    const COL_W = Math.floor(TABLE_W / 2);
    const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const cellBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

    const twoColRow = (bg: Paragraph[], en: Paragraph[]) =>
      new Table({
        width: { size: TABLE_W, type: WidthType.DXA },
        columnWidths: [COL_W, COL_W],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: COL_W, type: WidthType.DXA },
                borders: cellBorders,
                margins: { top: 60, bottom: 60, left: 80, right: 160 },
                children: bg.length ? bg : [new Paragraph({ text: "" })],
              }),
              new TableCell({
                width: { size: COL_W, type: WidthType.DXA },
                borders: cellBorders,
                margins: { top: 60, bottom: 60, left: 160, right: 80 },
                children: en.length ? en : [new Paragraph({ text: "" })],
              }),
            ],
          }),
        ],
      });

    // Title
    children.push(
      twoColRow(
        [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: blank.title.toUpperCase(), bold: true, size: 28 })],
        })],
        [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: (blank.title_en || blank.title).toUpperCase(), bold: true, size: 28 })],
        })],
      ),
    );
    children.push(new Paragraph({ text: "" }));

    // Preamble
    children.push(twoColRow(paragraphsFromText(blank.preamble), paragraphsFromText(blank.preamble_en || "")));
    children.push(new Paragraph({ text: "" }));

    // Clauses
    for (const c of blank.clauses) {
      const bgHead = new Paragraph({
        children: [new TextRun({ text: `${c.number} ${c.title.toUpperCase()}`, bold: true, size: 24 })],
      });
      const enHead = new Paragraph({
        children: [new TextRun({ text: `${c.number} ${(c.title_en || c.title).toUpperCase()}`, bold: true, size: 24 })],
      });
      children.push(
        twoColRow(
          [bgHead, ...paragraphsFromText(c.body)],
          [enHead, ...paragraphsFromText(c.body_en || "")],
        ),
      );
      children.push(new Paragraph({ text: "" }));
    }

    if (blank.closing) {
      children.push(twoColRow(paragraphsFromText(blank.closing), paragraphsFromText(blank.closing_en || "")));
    }
  } else {
    // ----- Original single-column layout -----
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
        children: [new TextRun({ text: blank.title, bold: true, size: 36 })],
      }),
    );

    for (const line of blank.preamble.split(/\n+/).filter(Boolean)) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 200 },
          children: [new TextRun({ text: line, size: 24 })],
        }),
      );
    }

    for (const c of blank.clauses) {
      children.push(
        new Paragraph({
          spacing: { before: 320, after: 160 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `${c.number} ${c.title}`, bold: true, size: 26 }),
          ],
        }),
      );
      for (const line of c.body.split(/\n+/).filter(Boolean)) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 160 },
            children: [new TextRun({ text: line, size: 24 })],
          }),
        );
      }
    }

    if (blank.closing) {
      for (const line of blank.closing.split(/\n+/).filter(Boolean)) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 320, after: 160 },
            children: [new TextRun({ text: line, size: 24 })],
          }),
        );
      }
    }
  }

  // Discrete brand watermark on every page (header + footer).
  const watermarkHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "dogovori.net", bold: true, color: "C9A84C", size: 18 }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: isBilingual
              ? "Bilingual template · BG / EN"
              : "Архитект на Вашите сделки",
            color: "A0A0A0",
            size: 14,
            italics: true,
          }),
        ],
      }),
    ],
  });
  const watermarkFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "dogovori.net",
            color: "B0B0B0",
            size: 14,
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: "Dogovori.net",
    title: blank.title,
    styles: {
      default: { document: { run: { font: "Times New Roman", size: 24 } } },
    },
    sections: [{
      headers: { default: watermarkHeader },
      footers: { default: watermarkFooter },
      children,
    }],
  });

  return Packer.toBuffer(doc).then((b) => new Uint8Array(b));
}

function safeKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Влезте в профила си.", requires_login: true }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    let userId: string | undefined;
    // ES256 (signing-keys) tokens — getClaims validates them.
    const { data: claimsData, error: claimsErr } = await admin.auth.getClaims(token);
    userId = claimsData?.claims?.sub as string | undefined;
    if (!userId) {
      // Legacy HS256 fallback.
      const { data: u, error: uErr } = await admin.auth.getUser(token);
      userId = u?.user?.id;
      if (!userId) {
        console.warn("[download-blank] 401 invalid token:", { claimsErr: claimsErr?.message, uErr: uErr?.message });
        return new Response(JSON.stringify({ error: "Невалиден токен.", requires_login: true, code: "auth_required" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const rawSectorId = String(body?.sector_id ?? "").trim();
    const rawDocumentName = String(body?.document_name ?? "").trim();
    const rawSectorTitle = String(body?.sector_title ?? "").trim();
    const isBilingual = Boolean(body?.bilingual);
    const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
    const docKey = typeof body?.doc_key === "string" ? body.doc_key : "";

    // Strict input validation to prevent prompt-cache poisoning. The generated
    // blank is shared globally by (sector_id, document_name), so untrusted
    // free-form text must never reach the AI prompt or the cache key.
    // - sector_id: lowercase slug, alphanumerics + dash, ≤ 64 chars.
    // - document_name / sector_title: printable text, no control chars / line
    //   breaks, ≤ 200 chars.
    const SECTOR_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
    const SAFE_TEXT_RE = /^[^\u0000-\u001F\u007F<>{}`]{1,200}$/;
    const sectorId = rawSectorId;
    const documentName = rawDocumentName;
    const sectorTitle = rawSectorTitle.slice(0, 200);

    if (
      !sectorId ||
      !documentName ||
      !SECTOR_RE.test(sectorId) ||
      !SAFE_TEXT_RE.test(documentName) ||
      (sectorTitle && !SAFE_TEXT_RE.test(sectorTitle))
    ) {
      return new Response(JSON.stringify({ error: "Невалидни параметри" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Consume template quota first — fail fast if user has no allowance.
    // Must be called with a user-scoped client so auth.uid() resolves inside the RPC.
    // If client provided session_id + doc_key, route through the session-aware
    // RPC so a blank download is free when the user has already paid for the
    // contract (or another blank) for the same document in the same tab.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const useSession = !!sessionId && !!docKey;
    const { data: quotaRes, error: quotaErr } = useSession
      ? await userClient.rpc("consume_quota_session", {
          _kind: "template",
          _doc_key: docKey,
          _session_id: sessionId,
        })
      : await userClient.rpc("consume_quota", { _kind: "template" });
    if (quotaErr) throw new Error(quotaErr.message);
    const quota = quotaRes as {
      ok: boolean;
      reason?: string;
      next_reset?: string;
      is_pro?: boolean;
      charged?: boolean;
      reused_session_charge?: boolean;
    };
    if (!quota?.ok) {
      return new Response(
        JSON.stringify({ error: "quota_exceeded", reason: quota?.reason, next_reset: quota?.next_reset }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Look for an existing blank.
    const { data: existing } = await admin
      .from("document_blanks")
      .select("id, storage_path")
      .eq("sector_id", sectorId)
      .eq("document_name", documentName)
      .maybeSingle();

    // Cache version prefix. Bumped to v3 — initial blanks now use a
    // higher-quality model (gemini-2.5-pro) and document-type-aware structure
    // (разписка ≠ договор ≠ декларация ≠ пълномощно etc).
    // Bilingual blanks live under a separate `v3-bilingual` namespace so they
    // never collide with the monolingual cache for the same (sector, document).
    const CACHE_VERSION = isBilingual ? "v5-bilingual" : "v5";
    const existingPath = existing?.storage_path as string | undefined;
    let storagePath: string | undefined =
      existingPath && existingPath.startsWith(`${CACHE_VERSION}/`) ? existingPath : undefined;

    // 3) If missing, generate via AI Gateway, upload, index.
    if (!storagePath) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

      // Match the document type so the AI doesn't render every blank as a contract.
      const docTypeSpec = getDocumentTypeSpec(inferDocumentType(documentName));
      const systemPrompt = `${SYSTEM_PROMPT}\n\n--- Специфика за този вид документ (${docTypeSpec.label}) ---\n${docTypeSpec.systemAddendum}${isBilingual ? BILINGUAL_ADDENDUM : ""}`;

      const userPrompt = `Сектор: ${sectorTitle || sectorId}\nВид документ: ${docTypeSpec.label}\nКонкретен документ: ${documentName}\n\nГенерирай професионална българска правна БЛАНКА (празен шаблон) за този КОНКРЕТЕН ВИД документ. Спазвай структурата за „${docTypeSpec.label}" — не я смесвай с друг вид документ.${isBilingual ? "\n\nЗАДЪЛЖИТЕЛНО: добави паралелен английски превод в полетата title_en, preamble_en, closing_en и в clauses[].title_en/body_en (виж системния промпт за билингвален режим)." : ""}`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // First-time blank generation is cached forever per (sector, document) —
          // worth investing in higher quality. gemini-2.5-pro produces more
          // legally precise wording and respects per-document-type structure.
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (aiRes.status === 429) {

        return new Response(JSON.stringify({ error: "AI лимитът е достигнат. Опитайте след малко." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Изчерпан AI кредит. Опитайте по-късно." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!aiRes.ok) {
        const errText = await aiRes.text();
        throw new Error(`AI Gateway: ${aiRes.status} ${errText}`);
      }

      const aiJson = await aiRes.json();
      const raw = aiJson?.choices?.[0]?.message?.content ?? "";
      const blank = extractJson(raw);

      const docxBytes = await buildDocx(blank, isBilingual);
      storagePath = `${CACHE_VERSION}/${safeKey(sectorId)}/${safeKey(documentName)}.docx`;

      const { error: upErr } = await admin.storage
        .from("document-blanks")
        .upload(storagePath, docxBytes, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: true,
        });
      if (upErr) throw new Error(`upload: ${upErr.message}`);

      const { error: insErr } = await admin
        .from("document_blanks")
        .upsert(
          { sector_id: sectorId, document_name: documentName, storage_path: storagePath },
          { onConflict: "sector_id,document_name" },
        );
      if (insErr) throw new Error(`index: ${insErr.message}`);
    }

    // 4) Sign and return.
    const { data: signed, error: signErr } = await admin.storage
      .from("document-blanks")
      .createSignedUrl(storagePath!, 60 * 10);
    if (signErr || !signed?.signedUrl) throw new Error(signErr?.message ?? "sign failed");

    return new Response(
      JSON.stringify({
        ok: true,
        url: signed.signedUrl,
        filename: isBilingual
          ? `${documentName} - бланка (BG-EN).docx`
          : `${documentName} - бланка.docx`,
        cached: !!existing,
        is_pro: !!quota.is_pro,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
