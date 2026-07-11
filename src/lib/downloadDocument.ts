import { supabase } from "@/integrations/supabase/client";
import type { GeneratedContract } from "@/lib/exporters";
import type { CompanionTemplate } from "@/data/companionTemplates";
import { ensureAIDisclaimerAccepted } from "@/lib/aiDisclaimerGate";
import { getOpSessionId, getOpDocKey } from "@/lib/opSession";

export type DownloadKind = "contract" | "template";
export type DownloadFormat = "pdf" | "docx";

interface DownloadParams {
  kind: DownloadKind;
  format: DownloadFormat;
  title: string;
  payload: GeneratedContract | CompanionTemplate;
  source_id?: string;
  contact_id?: string;
  folder_id?: string;
  saved_document_id?: string;
  /** Slug/ID that uniquely identifies the document for session-scoped charging. */
  doc_key?: string;
}

export interface DownloadResult {
  ok: boolean;
  saved_document_id?: string;
  free?: boolean;
  error?: string;
  status?: number;
}

export async function downloadDocument(p: DownloadParams): Promise<DownloadResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { ok: false, error: "auth_required", status: 401 };
    }

  // Require AI disclaimer acceptance once per session before any download.
    try {
      await ensureAIDisclaimerAccepted();
    } catch {
      return { ok: false, error: "disclaimer_cancelled", status: 0 };
    }

  // Kick off all three work streams in parallel:
  //   1. Edge function call (network round-trip)
  //   2. Dynamic import of the heavy exporter chunk (jspdf or docx)
  //   3. Cyrillic-capable PDF font (cached in IndexedDB after first run)
  // This typically saves 300–800ms on the first download because the
  // exporter chunk parse and font fetch are no longer waiting for the
  // edge response.
    const invokePromise = supabase.functions.invoke("download-document", {
      body: {
        kind: p.kind,
        title: p.title,
        payload: p.payload,
        source_id: p.source_id,
        contact_id: p.contact_id,
        folder_id: p.folder_id,
        saved_document_id: p.saved_document_id,
        session_id: getOpSessionId(),
        doc_key: getOpDocKey(p.doc_key || p.source_id || p.title),
      },
    });

    const needsPdfFont = p.format === "pdf";
  // Preload the PDF font in parallel; harmless to start during DOCX exports
  // too because the in-memory cache is shared across the SPA session.
    const fontPromise = needsPdfFont
      ? import("@/lib/pdfFont")
        .then((m) => m.loadCyrillicFontB64())
        .then(() => ({ ok: true as const }))
        .catch((error) => ({ ok: false as const, error }))
      : Promise.resolve({ ok: true as const });

  // Prefetch only the exporter we actually need, so PDF callers never
  // pay for the docx chunk and vice versa.
    let exporterPromise: Promise<unknown>;
    if (p.kind === "contract") {
      exporterPromise = p.format === "pdf"
        ? import("@/lib/exporters.pdf")
        : import("@/lib/exporters.docx");
    } else {
      exporterPromise = import("@/lib/templateExporter");
    }
  // Swallow prefetch errors — the real import below will surface them.
    exporterPromise.catch(() => null);

    const { data, error } = await invokePromise;

    if (error) {
      // supabase-js wraps non-2xx as FunctionsHttpError. Try to read context.
      const ctx: any = (error as any).context;
      let body: any = null;
      try {
        if (ctx && typeof ctx.json === "function") body = await ctx.json();
      } catch {}
      if (body?.error === "quota_exceeded") return { ok: false, error: "quota_exceeded", status: 402 };
      return { ok: false, error: String(error.message || error), status: ctx?.status };
    }

    if (data?.error) {
      return { ok: false, error: String(data.error) };
    }

  // Generate the file client-side
    const watermarkOpts = data?.watermark
      ? { watermark: true as const, userTag: data.user_tag as string | undefined }
      : undefined;

  // Make sure the font is ready before we hand off to jsPDF.
    const fontResult = await fontPromise;
    if (fontResult.ok === false) throw fontResult.error;

    if (p.kind === "contract") {
      const c = data.payload as GeneratedContract;
      if (p.format === "pdf") {
        const { exportPDF } = await import("@/lib/exporters.pdf");
        await exportPDF(c, watermarkOpts);
      } else {
        const { exportDOCX } = await import("@/lib/exporters.docx");
        await exportDOCX(c, watermarkOpts);
      }
    } else {
      const t = data.payload as CompanionTemplate;
      const { exportTemplatePDF, exportTemplateDOCX } = await import("@/lib/templateExporter");
      if (p.format === "pdf") await exportTemplatePDF(t, watermarkOpts);
      else await exportTemplateDOCX(t, watermarkOpts);
    }

  // Quota just changed on the server — invalidate the shared cache so the
  // next mount of useIsPro / useQuota / useDocumentAccess reads fresh values.
    try {
      const [{ invalidateQuota }] = await Promise.all([import("@/hooks/useQuota")]);
      invalidateQuota(session.user.id);
    } catch {}



  // Engagement: bump streak/daily progress + emit celebration event.
    try {
      const { bumpEngagement } = await import("@/hooks/useEngagement");
      const res = bumpEngagement();
      window.dispatchEvent(
        new CustomEvent("dogovari:op-completed", {
          detail: {
            variant: p.kind === "template" ? "template" : "download",
            title: p.title,
            reachedGoal: res.reachedGoal,
            streakIncreased: res.streakIncreased,
          },
        }),
      );
    } catch {}

    return { ok: true, saved_document_id: data.saved_document_id, free: data.free };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e), status: 0 };
  }
}
