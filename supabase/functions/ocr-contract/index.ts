// Edge function: OCR a scanned PDF (image pages) using Lovable AI vision.
// Accepts an array of base64 PNG/JPEG data URLs (one per page) and returns the
// extracted text. Used as a fallback when client-side pdfjs.getTextContent() returns
// nothing (i.e. the PDF has no text layer — typical for scanned bank/notary contracts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { loadActivePrompt } from "../_shared/prompt-loader.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { logAiAudit } from "../_shared/ai-call.ts";
import {
  asOperationId,
  type LedgerRpc,
  type PostModelContext,
  cancelDocumentOperation,
  cancelUnexpectedFailure,
  canonicalDocumentBinding,
  commitDocumentOperation,
  internalErrorResponse,
  ledgerBlockResponse,
  lookupDocumentOperation,
  markDocumentModelStarted,
  markDocumentReconciliation,
  ocrPageSequenceDigest,
  operationIdRequiredResponse,
  operationReconciliationResponse,
  ProviderCallBudget,
  reconcileUnexpectedFailure,
  reserveDocumentOperation,
} from "../_shared/ai-document-ledger.ts";
import { runOcrBatch, requireOcrPageContent } from "./ocr-batch.ts";
import {
  RAW_IMAGE_INGRESS_ALLOWED,
  rawImageIngressBlockedResponse,
} from "../_shared/privacy-gate.ts";

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

  // Преграда за ограничени идентификатори: изображения на страници не могат да
  // бъдат проверени, затова не се приемат — нито от браузъра, нито директно.
  if (!RAW_IMAGE_INGRESS_ALLOWED) return rawImageIngressBlockedResponse(corsHeaders);

  // Контекст за fail-closed обработка на НЕОЧАКВАНИ изключения: след трайното
  // начало на модела — изравняване; преди него (с резервация) — отмяна.
  let postStart: PostModelContext | null = null;
  let preStart: PostModelContext | null = null;

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
    // Леджърът е СТРОГО service_role RPC — отделен, тесен контракт за тестваемост.
    const ledger = admin as unknown as LedgerRpc;
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

    // ---------------------------------------------------------------------
    // GATE 2 — ТОЧНО ЕДНО ИЗПЪЛНЕНИЕ.
    // Обвързването покрива ПОДРЕДЕНАТА последователност страници само чрез
    // SHA-256 на всяка страница и размера ѝ. Никакъв base64/байт не влиза в
    // леджъра или в журналите.
    // ---------------------------------------------------------------------
    const operationId = asOperationId(body?.operation_id);
    if (!operationId) return operationIdRequiredResponse(corsHeaders);

    const FREE_OCR_PAGES = 3;
    const extraOps = Math.max(0, pages.length - FREE_OCR_PAGES);
    const sequence = await ocrPageSequenceDigest(pages);
    const binding = await canonicalDocumentBinding({
      purpose: "ocr_contract",
      userId,
      resourceId: null,
      resourceVersion: sequence.digest,
      options: { page_count: pages.length, free_pages: FREE_OCR_PAGES, extra_ops: extraOps },
    });

    // САМО-ЧЕТЯЩО повторение — ПРЕДИ ключа на доставчика и всяка квота.
    const existing = await lookupDocumentOperation(ledger, {
      operationId,
      userId,
      purpose: "ocr_contract",
      binding,
    });
    if (existing.kind === "committed") {
      return new Response(JSON.stringify({ ...existing.result, replay: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const existingBlock = ledgerBlockResponse(existing, corsHeaders);
    if (existingBlock) return existingBlock;

    // Ценообразуване: OCR на първите 3 страници е включен в цената на анализа.
    // Всяка следваща страница струва +1 операция. Резервацията е АТОМАРНА и
    // всичко-или-нищо — няма частично таксуване страница по страница.
    const reserved = await reserveDocumentOperation(ledger, {
      operationId,
      userId,
      purpose: "ocr_contract",
      binding,
      inputDigest: sequence.digest,
      resourceVersion: sequence.digest,
      leaseSeconds: 600,
      waveOps: extraOps,
      waveKind: "analysis",
    });
    if (reserved.kind === "committed") {
      return new Response(JSON.stringify({ ...reserved.result, replay: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (reserved.kind === "quota_exhausted") {
      return new Response(
        JSON.stringify({
          error:
            `OCR на ${pages.length} страници изисква ${extraOps} допълнителни ` +
            `операции (първите ${FREE_OCR_PAGES} страници са безплатни). ` +
            `Балансът Ви не е достатъчен — добавете топ-ъп или намалете броя страници.`,
          code: "ocr_quota_exceeded",
          pages: pages.length,
          free_pages: FREE_OCR_PAGES,
          extra_ops_required: extraOps,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const reserveBlock = ledgerBlockResponse(reserved, corsHeaders);
    if (reserveBlock) return reserveBlock;
    preStart = { db: ledger, operationId, userId };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Детерминистичен провал ПРЕДИ модела: отмяна с точно възстановяване.
      await cancelDocumentOperation(ledger, {
        operationId,
        userId,
        reason: "provider_key_missing",
      });
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY липсва" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const activeOcrSystem = await loadActivePrompt(admin, "ocr-contract", OCR_SYSTEM);

    // Трайно начало на модела ПРЕДИ първото повикване към доставчик.
    const started = await markDocumentModelStarted(ledger, {
      operationId,
      userId,
      purpose: "ocr_contract",
      binding,
    });
    if (!started.ok) {
      return ledgerBlockResponse(started.outcome, corsHeaders) ??
        operationReconciliationResponse(corsHeaders, "model_start_unproven");
    }
    // От тук нататък моделът може да е бил задействан: всяко изключение отива
    // в изравняване, никога в отмяна/възстановяване.
    const post: PostModelContext = { db: ledger, operationId, userId };
    postStart = post;
    preStart = null;

    // ЦЯЛАТА партида има твърд бюджет от 12 повиквания — не 12 на опит.
    const budget = new ProviderCallBudget("ocr_contract");
    /**
     * ЕДНА страница. ВСЯКА несигурност (изключение, не-2xx, нечетим JSON,
     * липсващо/празно съдържание, изчерпан бюджет) хвърля — партидата става
     * несигурна и НИЩО не се потвърждава. Тялото на отговора НЕ се логва.
     */
    const ocrPage = async (pageIndex: number): Promise<string> => {
      budget.take();
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
                { type: "image_url", image_url: { url: pages[pageIndex] } },
              ],
            },
          ],
        }),
      });
      if (!resp.ok) throw new Error(`ocr_provider_http_${resp.status}`);
      const j = await resp.json().catch(() => null);
      return requireOcrPageContent(
        (j as { choices?: Array<{ message?: { content?: unknown } }> } | null)
          ?.choices?.[0]?.message?.content,
      );
    };

    // Ограничена едновременност (3) — по-бързо от последователно, без да се
    // надхвърлят ограниченията на шлюза. Партидата е всичко-или-нищо.
    let results: string[];
    try {
      results = await runOcrBatch({
        pageCount: pages.length,
        concurrency: 3,
        readPage: ocrPage,
      });
    } catch (e) {
      // СЛЕД началото на модела няма автоматично връщане на квота и няма
      // второ повикване към модела: отива в изравняване. Нищо не се записва.
      return await reconcileUnexpectedFailure(post, corsHeaders, e);
    }

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

    // Атомарно потвърждение: резултат за точно повторение, счетоводството в
    // ai_usage и вълната от операции — заедно, най-много веднъж.
    const payload = { text, pages: pages.length, unreadablePages };
    const committed = await commitDocumentOperation(ledger, {
      operationId,
      userId,
      purpose: "ocr_contract",
      binding,
      result: payload,
      resultTtlSeconds: 86400,
      usageFunction: "ocr-contract",
    });
    if (committed.kind !== "committed") {
      await markDocumentReconciliation(ledger, {
        operationId,
        userId,
        reason: "commit_uncertain",
      });
      return operationReconciliationResponse(corsHeaders, "commit_uncertain");
    }

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // ВСЯКО неочаквано изключение след трайното начало на модела отива в
    // изравняване. Никога не се логва сурова грешка, тяло от доставчик,
    // изображение или разчетен текст.
    if (postStart) return await reconcileUnexpectedFailure(postStart, corsHeaders, e);
    if (preStart) return await cancelUnexpectedFailure(preStart, corsHeaders, e);
    console.error("ocr-contract error", { name: e instanceof Error ? e.name : "unknown" });
    return internalErrorResponse(corsHeaders);
  }
});
