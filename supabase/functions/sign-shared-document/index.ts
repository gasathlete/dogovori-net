import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";
import { isOwnerStoragePath, targetBelongsToOwner } from "../_shared/share-target.ts";

async function buildSignedPdf(opts: {
  originalPdf: Uint8Array | null;
  title: string;
  signerName: string;
  signatureDataUrl: string;
  signedAtIso: string;
}): Promise<Uint8Array> {
  const pdf = opts.originalPdf
    ? await PDFDocument.load(opts.originalPdf, { ignoreEncryption: true })
    : await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const sigB64 = opts.signatureDataUrl.split(",", 2)[1] ?? "";
  const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
  const isPng = opts.signatureDataUrl.startsWith("data:image/png");
  const sigImg = isPng ? await pdf.embedPng(sigBytes) : await pdf.embedJpg(sigBytes);

  const page = pdf.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const margin = 50;

  page.drawText("Electronic signature / Електронен подпис", {
    x: margin, y: height - margin - 10, size: 14, font: fontBold, color: rgb(0.05, 0.05, 0.1),
  });
  page.drawLine({
    start: { x: margin, y: height - margin - 18 },
    end: { x: width - margin, y: height - margin - 18 },
    thickness: 0.7, color: rgb(0.7, 0.6, 0.3),
  });

  const lines = [
    `Document / Документ: ${opts.title}`,
    `Signed by / Подписан от: ${opts.signerName}`,
    `Signed at / Дата и час: ${new Date(opts.signedAtIso).toISOString()}`,
  ];
  let y = height - margin - 50;
  for (const t of lines) {
    page.drawText(t.slice(0, 110), { x: margin, y, size: 11, font, color: rgb(0.1, 0.1, 0.15) });
    y -= 18;
  }

  const sigW = 240;
  const sigH = (sigImg.height / sigImg.width) * sigW;
  page.drawText("Signature / Подпис:", { x: margin, y: y - 20, size: 11, font: fontBold });
  page.drawImage(sigImg, { x: margin, y: y - 30 - sigH, width: sigW, height: sigH });

  page.drawText(
    "Този електронен подпис не е квалифициран електронен подпис (КЕП) по смисъла на Регламент (ЕС) 910/2014.",
    { x: margin, y: 60, size: 8, font, color: rgb(0.4, 0.4, 0.45), maxWidth: width - 2 * margin },
  );

  return await pdf.save();
}


serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      token, signer_name, signature_data_url, password,
      signature_method,
      qes_file_base64, qes_file_name, qes_file_mime,
    } = body as {
      token?: string;
      signer_name?: string;
      signature_data_url?: string;
      password?: string;
      signature_method?: "drawn" | "uploaded" | "qes";
      qes_file_base64?: string;
      qes_file_name?: string;
      qes_file_mime?: string;
    };
    const method: "drawn" | "uploaded" | "qes" =
      signature_method === "uploaded" || signature_method === "qes" ? signature_method : "drawn";
    // Uploading a file is not provider-verified QES evidence. D-Trust integration
    // is required; reject this unsupported capability before any durable write.
    if (method === "qes") return new Response(JSON.stringify({
      code: "qes_provider_unavailable", message: "Квалифицираното подписване чрез D-Trust още не е достъпно. Документът не е подписан; можете да го свалите.",
    }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // SECURITY: only allow PNG/JPEG raster signatures. Reject SVG (XSS via inline
    // <script>/<foreignObject>) and other vector/exotic formats.
    const SIG_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
    if (!token || !signer_name?.trim() || !signature_data_url || !SIG_RE.test(signature_data_url)) {
      return new Response(JSON.stringify({ error: "invalid_input" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (signature_data_url.length > 500_000) {
      return new Response(JSON.stringify({ error: "signature_too_large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Verify magic bytes match the declared MIME (defense in depth).
    try {
      const b64 = signature_data_url.split(",", 2)[1] ?? "";
      const head = Uint8Array.from(atob(b64.slice(0, 16)), (c) => c.charCodeAt(0));
      const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
      const isJpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      if (!isPng && !isJpg) {
        return new Response(JSON.stringify({ error: "invalid_image_bytes" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: "invalid_image_bytes" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: link } = await admin
      .from("shared_links")
      .select("id, document_id, uploaded_contract_id, owner_id, expires_at, signed_at, revoked_at, password_hash, password_salt")
      .eq("token", token)
      .maybeSingle();

    if (!link) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (link.revoked_at || new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (link.signed_at) {
      return new Response(JSON.stringify({ error: "already_signed" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Password gate (Pro feature)
    if (link.password_hash && link.password_salt) {
      if (!password) {
        return new Response(JSON.stringify({ error: "password_required" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const enc = new TextEncoder().encode(link.password_salt + password);
      const digest = await crypto.subtle.digest("SHA-256", enc);
      const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      if (hex !== link.password_hash) {
        return new Response(JSON.stringify({ error: "password_invalid" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const ipHash = await hashIp(clientIp(req));
    const now = new Date().toISOString();
    const cleanName = signer_name.trim().slice(0, 120);

    // For uploaded contracts, build a signed PDF (original + signature page) and store it.
    let signedPdfPath: string | null = null;
    if (link.uploaded_contract_id) {
      try {
        const { data: uc } = await admin
          .from("uploaded_contracts")
          .select("id, user_id, title, source, storage_path, mime_type")
          .eq("id", link.uploaded_contract_id)
          .eq("user_id", link.owner_id)
          .maybeSingle();
        if (uc && targetBelongsToOwner(uc, link.owner_id)) {
          let originalPdf: Uint8Array | null = null;
          if (isOwnerStoragePath(uc.storage_path, link.owner_id) && (uc.mime_type === "application/pdf" || uc.source === "pdf")) {
            const { data: dl } = await admin.storage
              .from("user-contracts")
              .download(uc.storage_path);
            if (dl) originalPdf = new Uint8Array(await dl.arrayBuffer());
          }
          const pdfBytes = await buildSignedPdf({
            originalPdf,
            title: uc.title,
            signerName: cleanName,
            signatureDataUrl: signature_data_url,
            signedAtIso: now,
          });
          signedPdfPath = `${link.owner_id}/signed/${link.id}.pdf`;
          await admin.storage
            .from("user-contracts")
            .upload(signedPdfPath, pdfBytes, {
              contentType: "application/pdf",
              upsert: true,
            });
        }
      } catch (err) {
        console.error("signed pdf build failed", err);
      }
    }

    const qesPath: string | null = null;
    const qesSize: number | null = null;

    const { data: updatedRows, error: upErr } = await admin
      .from("shared_links")
      .update({
        signed_at: now,
        signed_signature: signature_data_url,
        signer_name: cleanName,
        signer_ip_hash: ipHash,
        signed_pdf_path: signedPdfPath,
        signature_method: method,
        qes_file_path: qesPath,
        qes_file_name: qesPath ? (qes_file_name ?? null) : null,
        qes_file_mime: qesPath ? (qes_file_mime ?? null) : null,
        qes_file_size: qesSize,
      })
      .eq("id", link.id)
      // Атомарно: само първият подпис на неотменена връзка се записва.
      .is("signed_at", null)
      .is("revoked_at", null)
      .select("id");


    if (upErr) {
      console.error("share sign update failed", upErr.message);
      return new Response(JSON.stringify({ error: "sign_failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!updatedRows || updatedRows.length === 0) {
      if (qesPath) await admin.storage.from("qes-signatures").remove([qesPath]);
      return new Response(JSON.stringify({ error: "already_signed" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let signed_pdf_url: string | null = null;
    if (signedPdfPath) {
      const { data: s } = await admin.storage
        .from("user-contracts")
        .createSignedUrl(signedPdfPath, 60 * 60);
      signed_pdf_url = s?.signedUrl ?? null;
    }

    await admin.from("audit_log").insert({
      user_id: link.owner_id,
      action: "share_link_signed",
      target_type: link.uploaded_contract_id ? "uploaded_contract" : "document",
      target_id: link.uploaded_contract_id ?? link.document_id,
      metadata: { signer_name: cleanName },
      ip_hash: ipHash,
    });

    return new Response(
      JSON.stringify({ ok: true, signed_at: now, signed_pdf_url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("edge function error", e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
