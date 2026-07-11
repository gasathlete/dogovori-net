// Assembles a final signed PDF: document body + per-signer signature blocks + audit trail.
// Uses jsPDF dynamically to avoid loading on initial render.
import type { jsPDF as JsPDFType } from "jspdf";

export interface SignedSignature {
  id: string;
  name: string;
  email?: string;
  role: string | null;
  order_idx: number;
  signed_at: string | null;
  signature_data_url: string | null;
  signature_name: string | null;
  signer_ip_hash?: string | null;
}

export interface SignedEnvelopeInput {
  title: string;
  document_snapshot: unknown;
  completed_at?: string | null;
  created_at?: string;
  order_mode?: string;
  envelopeId?: string;
}

import { snapshotToPlainText as snapshotToText } from "./signingSnapshotToText";

export async function buildSignedPdfBlob(env: SignedEnvelopeInput, signatures: SignedSignature[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc: JsPDFType = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  let y = margin;

  function ensureSpace(needed: number) {
    if (y + needed > pageH - margin) { doc.addPage(); y = margin; }
  }
  function heading(t: string, size = 14) {
    ensureSpace(size + 4);
    doc.setFont("helvetica", "bold"); doc.setFontSize(size);
    doc.text(t, margin, y); y += size * 0.6 + 3;
  }
  function paragraph(t: string, size = 10, lh = 1.45) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(size);
    const lines = doc.splitTextToSize(t, pageW - margin * 2);
    for (const ln of lines) {
      ensureSpace(size * 0.5 * lh + 1);
      doc.text(ln, margin, y);
      y += size * 0.5 * lh;
    }
  }
  function hr() {
    ensureSpace(4);
    doc.setDrawColor(180);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  }

  // 1) Header
  heading(env.title || "Подписан документ", 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  doc.text(`Финализиран: ${env.completed_at ? new Date(env.completed_at).toLocaleString("bg-BG") : "—"}`, margin, y);
  y += 5;
  if (env.envelopeId) { doc.text(`ID: ${env.envelopeId}`, margin, y); y += 5; }
  doc.setTextColor(0);
  hr();

  // 2) Document body
  paragraph(snapshotToText(env.document_snapshot), 10);

  // 3) Signatures appendix
  doc.addPage(); y = margin;
  heading("Подписи", 14);
  for (const s of signatures.slice().sort((a, b) => a.order_idx - b.order_idx)) {
    ensureSpace(50);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(`${s.order_idx + 1}. ${s.signature_name || s.name}${s.role ? ` — ${s.role}` : ""}`, margin, y);
    y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
    if (s.email) { doc.text(`Имейл: ${s.email}`, margin, y); y += 4; }
    if (s.signed_at) { doc.text(`Подписан на: ${new Date(s.signed_at).toLocaleString("bg-BG")}`, margin, y); y += 4; }
    if (s.signer_ip_hash) { doc.text(`IP отпечатък: ${s.signer_ip_hash.slice(0, 16)}…`, margin, y); y += 4; }
    doc.setTextColor(0);

    if (s.signature_data_url) {
      try {
        ensureSpace(30);
        const fmt = s.signature_data_url.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
        doc.addImage(s.signature_data_url, fmt, margin, y, 70, 25);
        y += 28;
      } catch { /* ignore broken signature */ }
    }
    hr();
  }

  // 4) Footer note on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140);
    doc.text(`dogovori.net — електронно подписан · стр. ${i}/${pages}`, margin, pageH - 8);
  }

  return doc.output("blob");
}

export async function downloadSignedPdf(env: SignedEnvelopeInput, signatures: SignedSignature[]) {
  const blob = await buildSignedPdfBlob(env, signatures);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (env.title || "podpisan-dokument").replace(/[^a-zа-я0-9\- _]/gi, "").slice(0, 80);
  a.href = url; a.download = `${safe}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
