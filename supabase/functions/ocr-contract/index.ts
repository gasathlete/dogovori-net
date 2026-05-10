// Edge function: OCR a scanned PDF (image pages) using Lovable AI vision.
// Accepts an array of base64 PNG/JPEG data URLs (one per page) and returns the
// extracted text. Used as a fallback when client-side pdfjs.getTextContent() returns
// nothing (i.e. the PDF has no text layer — typical for scanned bank/notary contracts).

import { buildCors } from "../_shared/cors.ts";

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
            { role: "system", content: OCR_SYSTEM },
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

    // Run sequentially to respect rate limits & keep memory low.
    const parts: string[] = [];
    let unreadablePages = 0;
    for (let i = 0; i < pages.length; i++) {
      const t = await ocrPage(pages[i], i);
      const trimmed = t.trim();
      console.log(`OCR page ${i + 1}: ${trimmed.length} chars`);
      if (!trimmed) {
        unreadablePages++;
        continue;
      }
      // Drop pages where the model returned only the unreadable marker.
      if (/^\s*\[OCR_UNREADABLE\]\s*$/i.test(trimmed)) {
        unreadablePages++;
        continue;
      }
      parts.push(trimmed.replace(/\[OCR_UNREADABLE\]/gi, "").trim());
    }
    const text = parts.join("\n\n").replace(/[ \t]+/g, " ").trim();
    console.log(`OCR total: ${text.length} chars, ${pages.length - unreadablePages}/${pages.length} pages readable`);

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
