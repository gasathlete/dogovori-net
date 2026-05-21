import { supabase } from "@/integrations/supabase/client";
import type { GeneratedContract } from "@/lib/exporters";
import type { CompanionTemplate } from "@/data/companionTemplates";
import { ensureAIDisclaimerAccepted } from "@/lib/aiDisclaimerGate";

export type DownloadKind = "contract" | "template";
export type DownloadFormat = "pdf" | "docx";

interface DownloadParams {
  kind: DownloadKind;
  format: DownloadFormat;
  title: string;
  payload: GeneratedContract | CompanionTemplate;
  source_id?: string;
  contact_id?: string;
  saved_document_id?: string;
}

export interface DownloadResult {
  ok: boolean;
  saved_document_id?: string;
  free?: boolean;
  error?: string;
  status?: number;
}

export async function downloadDocument(p: DownloadParams): Promise<DownloadResult> {
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


  const { data, error } = await supabase.functions.invoke("download-document", {
    body: {
      kind: p.kind,
      title: p.title,
      payload: p.payload,
      source_id: p.source_id,
      contact_id: p.contact_id,
      saved_document_id: p.saved_document_id,
    },
  });

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

  // Dynamic-import the heavy jspdf/docx modules only when actually exporting.
  if (p.kind === "contract") {
    const c = data.payload as GeneratedContract;
    const { exportPDF, exportDOCX } = await import("@/lib/exporters");
    if (p.format === "pdf") await exportPDF(c, watermarkOpts);
    else await exportDOCX(c, watermarkOpts);
  } else {
    const t = data.payload as CompanionTemplate;
    const { exportTemplatePDF, exportTemplateDOCX } = await import("@/lib/templateExporter");
    if (p.format === "pdf") await exportTemplatePDF(t, watermarkOpts);
    else await exportTemplateDOCX(t, watermarkOpts);
  }

  return { ok: true, saved_document_id: data.saved_document_id, free: data.free };
}
