// Edge function: STAFF-ONLY blank cache warming.
// Mirrors the AI generation pipeline from `download-blank` but:
//  - requires staff role (is_staff)
//  - does NOT consume any user quota
//  - is idempotent: skips when a valid cache entry already exists
//  - returns 200 with { status: "failed", error } on AI failure (so batch can continue)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { extractJson as extractJsonShared } from "../_shared/json.ts";
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
import { buildBlankStoragePath } from "../_shared/blank-key.ts";

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
  // Shared tolerant parser: recovers from markdown fences, control chars and
  // responses truncated mid-string by the model's token limit.
  return extractJsonShared(raw) as BlankPayload;
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

    children.push(
      twoColRow(
        [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: blank.title.toUpperCase(), bold: true, size: 28 })] })],
        [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: (blank.title_en || blank.title).toUpperCase(), bold: true, size: 28 })] })],
      ),
    );
    children.push(new Paragraph({ text: "" }));
    children.push(twoColRow(paragraphsFromText(blank.preamble), paragraphsFromText(blank.preamble_en || "")));
    children.push(new Paragraph({ text: "" }));

    for (const c of blank.clauses) {
      const bgHead = new Paragraph({ children: [new TextRun({ text: `${c.number} ${c.title.toUpperCase()}`, bold: true, size: 24 })] });
      const enHead = new Paragraph({ children: [new TextRun({ text: `${c.number} ${(c.title_en || c.title).toUpperCase()}`, bold: true, size: 24 })] });
      children.push(twoColRow([bgHead, ...paragraphsFromText(c.body)], [enHead, ...paragraphsFromText(c.body_en || "")]));
      children.push(new Paragraph({ text: "" }));
    }

    if (blank.closing) {
      children.push(twoColRow(paragraphsFromText(blank.closing), paragraphsFromText(blank.closing_en || "")));
    }
  } else {
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
        children: [new TextRun({ text: blank.title, bold: true, size: 36 })],
      }),
    );

    for (const line of blank.preamble.split(/\n+/).filter(Boolean)) {
      children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 200 }, children: [new TextRun({ text: line, size: 24 })] }));
    }

    for (const c of blank.clauses) {
      children.push(
        new Paragraph({
          spacing: { before: 320, after: 160 },
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `${c.number} ${c.title}`, bold: true, size: 26 })],
        }),
      );
      for (const line of c.body.split(/\n+/).filter(Boolean)) {
        children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 160 }, children: [new TextRun({ text: line, size: 24 })] }));
      }
    }

    if (blank.closing) {
      for (const line of blank.closing.split(/\n+/).filter(Boolean)) {
        children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 320, after: 160 }, children: [new TextRun({ text: line, size: 24 })] }));
      }
    }
  }

  const watermarkHeader = new Header({
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "dogovori.net", bold: true, color: "C9A84C", size: 18 })] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: isBilingual ? "Bilingual template · BG / EN" : "Архитект на Вашите сделки", color: "A0A0A0", size: 14, italics: true })],
      }),
    ],
  });
  const watermarkFooter = new Footer({
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "dogovori.net", color: "B0B0B0", size: 14 })] })],
  });

  const doc = new Document({
    creator: "Dogovori.net",
    title: blank.title,
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [{ headers: { default: watermarkHeader }, footers: { default: watermarkFooter }, children }],
  });

  return Packer.toBuffer(doc).then((b) => new Uint8Array(b));
}

// `safeKey` removed — see `_shared/blank-key.ts` `buildBlankStoragePath`.

const SECTOR_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_TEXT_RE = /^[^\u0000-\u001F\u007F<>{}`]{1,200}$/;

async function callAiWithRetry(systemPrompt: string, userPrompt: string, apiKey: string): Promise<BlankPayload> {
  const delays = [2000, 6000, 15000];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < delays.length + 1; attempt++) {
    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          // Bulk cache warming uses flash — ~5× cheaper than pro and the
          // structure of each blank already comes from `document-types` spec,
          // so the model mostly fills in legal wording.
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (aiRes.status === 429 || aiRes.status >= 500) {
        const txt = await aiRes.text();
        lastError = new Error(`AI Gateway ${aiRes.status}: ${txt.slice(0, 200)}`);
        if (attempt < delays.length) {
          await new Promise((r) => setTimeout(r, delays[attempt]));
          continue;
        }
        throw lastError;
      }
      if (aiRes.status === 402) {
        throw new Error("AI credits exhausted (402)");
      }
      if (!aiRes.ok) {
        const errText = await aiRes.text();
        throw new Error(`AI Gateway ${aiRes.status}: ${errText.slice(0, 200)}`);
      }

      const aiJson = await aiRes.json();
      const raw = aiJson?.choices?.[0]?.message?.content ?? "";
      return extractJson(raw);
    } catch (e) {
      lastError = e as Error;
      if (attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error("AI call failed");
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- Auth + staff check ----
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "auth_required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    let userId: string | undefined;
    const { data: claimsData } = await admin.auth.getClaims(token);
    userId = claimsData?.claims?.sub as string | undefined;
    if (!userId) {
      const { data: u } = await admin.auth.getUser(token);
      userId = u?.user?.id;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: staffOk, error: staffErr } = await admin.rpc("is_staff", { _user_id: userId });
    if (staffErr || !staffOk) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Input ----
    const body = await req.json().catch(() => ({}));
    const sectorId = String(body?.sector_id ?? "").trim();
    const documentName = String(body?.document_name ?? "").trim();
    const sectorTitle = String(body?.sector_title ?? "").trim().slice(0, 200);
    const isBilingual = Boolean(body?.bilingual);

    if (!sectorId || !documentName || !SECTOR_RE.test(sectorId) || !SAFE_TEXT_RE.test(documentName) || (sectorTitle && !SAFE_TEXT_RE.test(sectorTitle))) {
      return new Response(JSON.stringify({ status: "failed", error: "invalid_params" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const CACHE_VERSION = isBilingual ? "v6-bilingual" : "v6";

    // ---- СТАРИТЕ ПУБЛИЧНИ БЛАНКИ НЕ СЕ СЧИТАТ ЗА ПРОВЕРЕНИ ----
    // Наличието на стар обект в document_blanks вече НЕ прекратява работата с
    // „skipped": този запис е създаден без проверим правен манифест, клиентът
    // не го получава и той не може да бъде удостоверен наново. Отчита се само
    // като игнориран и се изготвя нова ЧЕРНОВА след строго заземяване.
    const { data: existing } = await admin
      .from("document_blanks")
      .select("id, storage_path")
      .eq("sector_id", sectorId)
      .eq("document_name", documentName)
      .maybeSingle();

    const legacyUnverifiedIgnored = !!existing?.storage_path;

    // ---- Generate (background task to avoid 150s edge timeout) ----
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ status: "failed", error: "LOVABLE_API_KEY missing" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docTypeSpec = getDocumentTypeSpec(inferDocumentType(documentName));

    // СТРОГО ЗАЗЕМЯВАНЕ — без проверена норма не се генерира дори чернова.
    const { retrieveLegalContext } = await import("../_shared/legal-rag.ts");
    const legal = await retrieveLegalContext(
      admin as unknown as Parameters<typeof retrieveLegalContext>[0],
      LOVABLE_API_KEY,
      `${documentName}\n${docTypeSpec.label}\n${sectorTitle || sectorId}`.slice(0, 4000),
      { matchCount: 6 },
    );
    if (!legal.hasMatches) {
      return new Response(
        JSON.stringify({ status: "failed", error: "legal_verification_unavailable" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `${SYSTEM_PROMPT}\n\n--- Специфика за този вид документ (${docTypeSpec.label}) ---\n${docTypeSpec.systemAddendum}${isBilingual ? BILINGUAL_ADDENDUM : ""}\n\n${legal.promptBlock}`;
    const userPrompt = `Сектор: ${sectorTitle || sectorId}\nВид документ: ${docTypeSpec.label}\nКонкретен документ: ${documentName}\n\nГенерирай професионална българска правна БЛАНКА (празен шаблон) за този КОНКРЕТЕН ВИД документ. Спазвай структурата за „${docTypeSpec.label}" — не я смесвай с друг вид документ.${isBilingual ? "\n\nЗАДЪЛЖИТЕЛНО: добави паралелен английски превод в полетата title_en, preamble_en, closing_en и в clauses[].title_en/body_en (виж системния промпт за билингвален режим)." : ""}`;
    // САМО ЧЕРНОВА: предварителното генериране не може да създава бланка, която
    // се поднася на клиент. Пише се в отделно draft пространство и НЕ се вписва
    // в document_blanks, докато няма проверим правен манифест и човешки преглед.
    const storagePath = `draft/${await buildBlankStoragePath(CACHE_VERSION, sectorId, documentName)}`;

    const work = (async () => {
      try {
        const blank = await callAiWithRetry(systemPrompt, userPrompt, LOVABLE_API_KEY);
        const docxBytes = await buildDocx(blank, isBilingual);
        const { error: upErr } = await admin.storage
          .from("document-blanks")
          .upload(storagePath, docxBytes, {
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            upsert: true,
          });
        if (upErr) {
          console.error(`[warm] upload failed ${storagePath}:`, upErr.message);
          return;
        }
        // НЯМА вписване в document_blanks: черновата не става публична само
        // защото съществува. Нужен е човешки преглед и проверим манифест.
        console.log(`[warm] draft generated ${storagePath}`);
      } catch (e) {
        console.error(`[warm] generation failed ${storagePath}:`, (e as Error)?.message ?? e);
      }
    })();

    // @ts-ignore - EdgeRuntime is available in Supabase Edge Runtime
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);

    return new Response(
      JSON.stringify({ status: "queued", storage_path: storagePath, bilingual: isBilingual }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ status: "failed", error: String((e as Error)?.message ?? e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
