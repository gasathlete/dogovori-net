// Utilities for exporting audit log entries to CSV or PDF.
import { jsPDF } from "jspdf";
import { escapeCell } from "./csv";

export type AuditExportRow = {
  created_at: string;
  actor: string;
  action: string;
  target: string;
  metadata?: any;
};

const csvCell = escapeCell;

export function exportAuditCsv(rows: AuditExportRow[], filename = "audit-log.csv") {
  const header = ["Време", "Действащо лице", "Действие", "Обект", "Метаданни"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      csvCell(new Date(r.created_at).toLocaleString("bg-BG")),
      csvCell(r.actor),
      csvCell(r.action),
      csvCell(r.target),
      csvCell(r.metadata ? JSON.stringify(r.metadata) : ""),
    ].join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAuditPdf(rows: AuditExportRow[], title = "Дневник на действията", filename = "audit-log.pdf") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString("bg-BG")} | Records: ${rows.length}`, margin, y);
  y += 16;

  const colW = [110, 110, 110, 200];
  const headers = ["Time", "Actor", "Action", "Target / Meta"];
  const drawHeader = () => {
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, pageW - margin * 2, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    let x = margin + 4;
    headers.forEach((h, i) => { doc.text(h, x, y + 12); x += colW[i]; });
    y += 18;
    doc.setFont("helvetica", "normal");
  };
  drawHeader();

  for (const r of rows) {
    const cells = [
      new Date(r.created_at).toLocaleString("bg-BG"),
      r.actor || "—",
      r.action || "—",
      [r.target, r.metadata ? JSON.stringify(r.metadata) : ""].filter(Boolean).join(" · "),
    ];
    const wrapped = cells.map((c, i) => doc.splitTextToSize(String(c), colW[i] - 8));
    const lines = Math.max(...wrapped.map((w) => w.length));
    const rowH = lines * 11 + 6;
    if (y + rowH > pageH - margin) {
      doc.addPage();
      y = margin;
      drawHeader();
    }
    let x = margin + 4;
    wrapped.forEach((w, i) => { doc.text(w, x, y + 10); x += colW[i]; });
    doc.setDrawColor(220);
    doc.line(margin, y + rowH, pageW - margin, y + rowH);
    y += rowH;
  }

  doc.save(filename);
}
