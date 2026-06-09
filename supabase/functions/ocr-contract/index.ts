// Edge function: OCR a scanned PDF (image pages) using Lovable AI vision.
// Accepts an array of base64 PNG/JPEG data URLs (one per page) and returns the
// extracted text. Used as a fallback when client-side pdfjs.getTextContent() returns
// nothing (i.e. the PDF has no text layer — typical for scanned bank/notary contracts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { loadActivePrompt } from "../_shared/prompt-loader.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { logAiAudit } from "../_shared/ai-call.ts";

const OCR_SYSTEM = `Ти си високо точен OCR енджин за български правни документи.
Получаваш изображение на страница от договор. Върни ИЗКЛЮЧИТЕЛНО извлечения текст,
дословно, ред по ред, на български език (използвай кирилица, не транслитерирай).

КРИТИЧНО:
- Транскрибирай САМО това, което реално виждаш на изображението. НЕ добавяй съдържание от никакъв друг източник.
- Ако изображението е празно, неясно, размазано, или НЕ можеш да разчетеш текста — върни СТРОГО следния маркер и нищо друго: [OCR_UNREADABLE]
- НЕ измисляй параграфи, имена, номера, суми или клаузи. По-добре върни [OCR_UNREADABLE], отколкото да предположиш.
- Запази параграфите и номерацията както са в оригинала.
- НЕ добавяй коментари, обяснения, markdown или ограждания.
- НЕ превеждай. НЕ обобщавай. НЕ интерпретирай.`;

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the bearer token resolves to a real Supabase user. Without this
    // check anyone can burn AI OCR credits with an arbitrary "Bearer x" header.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: authErr } = await admin.auth.getUser(
      auth.replace("Bearer ", ""),
    );
    const userId = userData?.user?.id;
    if (authErr || !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const images: string[] = Array.isArray(body?.images) ? body.images : [];
    if (!images.length) {
      return new Response(JSON.stringify({ error: "Няма страници за OCR" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Cap at 12 pages to keep latency/cost sane (≈ first 12 pages of a contract).
    const pages = images.slice(0, 12);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY липсва" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const activeOcrSystem = await loadActivePrompt(admin, "ocr-contract", OCR_SYSTEM);
    const ocrPage = async (dataUrl: string, pageIndex: number): Promise<string> => {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: activeOcrSystem },
            {
              role: "user",
              content: [
                { type: "text", text: `Извлечи целия текст от страница ${pageIndex + 1}.` },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        console.error(`ocr page ${pageIndex} failed:`, resp.status, t.slice(0, 300));
        return "";
      }
      const j = await resp.json();
      return (j?.choices?.[0]?.message?.content ?? "").trim();
    };

    // Run with bounded concurrency (3 in flight) — ~3× faster than sequential
    // while still respecting AI gateway rate limits for the OCR endpoint.
    const CONCURRENCY = 3;
    const results: string[] = new Array(pages.length).fill("");
    let nextIdx = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, pages.length) }, async () => {
      while (true) {
        const i = nextIdx++;
        if (i >= pages.length) return;
        results[i] = await ocrPage(pages[i], i);
      }
    });
    await Promise.all(workers);

    const parts: string[] = [];
    let unreadablePages = 0;
    for (let i = 0; i < results.length; i++) {
      const trimmed = (results[i] ?? "").trim();
      if (!trimmed) continue;
      if (/\[OCR_UNREADABLE\]/i.test(trimmed) && trimmed.length < 80) {
        unreadablePages++;
        continue;
      }
      const letters = (trimmed.match(/\p{L}/gu) ?? []).length;
      const cyr = (trimmed.match(/[\u0400-\u04FF]/g) ?? []).length;
      if (letters > 60 && letters < 300 && cyr / Math.max(letters, 1) < 0.4) {
        unreadablePages++;
        console.warn(`OCR page ${i} discarded (low Cyrillic ratio).`);
        continue;
      }
      parts.push(trimmed.replace(/\[OCR_UNREADABLE\]/gi, "").trim());
    }
    const text = parts.join("\n\n").replace(/[ \t]+/g, " ").trim();

    // Classify the OCR output (post-hoc) for the audit trail. We cannot
    // pre-classify images. Special-category text is allowed through here
    // because OCR is read-only — downstream operations (correct-uploaded)
    // re-classify and may block.
    const ocrClassification = classifyDocumentBeforeAI(text);
    await logAiAudit({
      user_id: userId, operation: "ocr-contract",
      model: "google/gemini-2.5-flash",
      classification: ocrClassification,
      redaction_applied: false, status: "ok",
    });

    // Per-user accounting so abuse is visible and rate-limitable downstream.
    try {
      await admin.from("ai_usage").insert({ user_id: userId, function_name: "ocr-contract" });
    } catch (_) { /* non-fatal */ }

    return new Response(JSON.stringify({ text, pages: pages.length, unreadablePages }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ocr-contract error:", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
