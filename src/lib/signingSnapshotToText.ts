// Converts a stored signing envelope `document_snapshot` into readable plain
// text. Handles three shapes:
//   1. Plain string
//   2. `{ body }` / `{ text }` object (legacy)
//   3. `GeneratedContract` object (title, preamble, clauses[], closing)
export function snapshotToPlainText(snap: unknown): string {
  if (snap == null) return "";
  if (typeof snap === "string") return snap;
  if (typeof snap !== "object") return String(snap);

  const s: any = snap;
  if (typeof s.body === "string" && s.body.trim()) return s.body;
  if (typeof s.text === "string" && s.text.trim()) return s.text;

  // GeneratedContract shape
  if (Array.isArray(s.clauses)) {
    const parts: string[] = [];
    if (s.title) parts.push(String(s.title).toUpperCase(), "");
    if (s.preamble) parts.push(String(s.preamble), "");
    for (const c of s.clauses) {
      const num = c?.number ? `${c.number}. ` : "";
      const title = c?.title ? String(c.title) : "";
      const head = `${num}${title}`.trim();
      if (head) parts.push(head);
      if (c?.body) parts.push(String(c.body));
      parts.push("");
    }
    if (s.closing) parts.push("", String(s.closing));
    return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  try {
    return JSON.stringify(s, null, 2);
  } catch {
    return String(s);
  }
}
