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
} from "https://esm.sh/docx@8.5.0";
import { buildCors } from "../_shared/cors.ts";

const SYSTEM_PROMPT = `Ти си български правен архитект. Генерираш ПРАЗНИ БЛАНКИ (шаблони) на документи на български юридически език (ЗЗД, ТЗ, ЗУТ).

Бланката трябва да:
- съдържа всички задължителни клаузи и реквизити;
- използва [квадратни скоби] за всички места, които ползвателят трябва да попълни (имена, ЕИК/ЕГН, адреси, суми, срокове, дати);
- не съдържа конкретни данни — само празни полета;
- е готова за разпечатване и нотариална/правна употреба;
- спазва точната терминология за съответния документ (Възложител/Изпълнител, Наемодател/Наемател, Декларатор и т.н.).

Връщай СТРОГО валиден JSON (без markdown), точно тази структура:
{
  "title": "Точното заглавие на документа",
  "preamble": "Уводен текст с [плейсхолдъри] за дата, място, страни",
  "clauses": [
    { "number": "I.", "title": "ПРЕДМЕТ", "body": "Чл. 1. ...\\nЧл. 2. ..." }
  ],
  "closing": "Заключителен текст + подписи"
}

За декларации: само 1 декларатор, без втора страна, без неустойки/подсъдност.
За договори: пълен комплект от клаузи (Предмет, Цена, Срокове, Права/задължения, Неустойки, Прекратяване, Форсмажор, Подсъдност, Заключителни).`;

interface BlankPayload {
  title: string;
  preamble: string;
  clauses: Array<{ number: string; title: string; body: string }>;
  closing: string;
}

function extractJson(raw: string): BlankPayload {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned) as BlankPayload;
}

function buildDocx(blank: BlankPayload): Promise<Uint8Array> {
  const children: Paragraph[] = [];

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
          spacing: { after: 160 },
          children: [new TextRun({ text: line, size: 24 })],
        }),
      );
    }
  }

  if (blank.closing) {
    children.push(
      new Paragraph({
        spacing: { before: 320 },
        children: [new TextRun({ text: blank.closing, size: 24 })],
      }),
    );
  }

  const doc = new Document({
    creator: "Dogovori.net",
    title: blank.title,
    styles: {
      default: { document: { run: { font: "Times New Roman", size: 24 } } },
    },
    sections: [{ children }],
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
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: quotaRes, error: quotaErr } = await userClient.rpc("consume_quota", { _kind: "template" });
    if (quotaErr) throw new Error(quotaErr.message);
    const quota = quotaRes as { ok: boolean; reason?: string; next_reset?: string; is_pro?: boolean };
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

    let storagePath = existing?.storage_path as string | undefined;

    // 3) If missing, generate via AI Gateway, upload, index.
    if (!storagePath) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

      const userPrompt = `Сектор: ${sectorTitle || sectorId}\nДокумент: ${documentName}\n\nГенерирай професионална българска правна БЛАНКА (празен шаблон) за този документ.`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Cost optimization: blanks are deterministic JSON fills — flash-lite
          // delivers identical quality at ~5x lower cost vs full flash.
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
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

      const docxBytes = await buildDocx(blank);
      storagePath = `${safeKey(sectorId)}/${safeKey(documentName)}.docx`;

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
        filename: `${documentName} - бланка.docx`,
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
