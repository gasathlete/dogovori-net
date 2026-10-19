/**
 * Строг парсер на Responses SSE поток. Успех само при response.completed;
 * failed/incomplete/error/прекъснат поток → неуспех (не се записва като кандидат).
 */
export type StreamOutcome =
  | { ok: true; text: string; responseId: string | null }
  | { ok: false; kind: "failed" | "incomplete" | "error" | "truncated" | "empty"; text: string; detail: string };

export async function parseResponsesStream(chunks: AsyncIterable<Uint8Array>): Promise<StreamOutcome> {
  const dec = new TextDecoder();
  let buf = "", text = "", completed = false, responseId: string | null = null;
  let failure: StreamOutcome | null = null;
  let completedText: string | null = null;

  const handle = (line: string) => {
    const l = line.replace(/\r$/, "");
    if (!l.startsWith("data:")) return;
    const data = l.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let ev: { type?: string; delta?: string; response?: { id?: string; status?: string; incomplete_details?: unknown; error?: unknown; output?: unknown[] }; message?: string; error?: unknown };
    try { ev = JSON.parse(data); } catch { failure ??= { ok: false, kind: "error", text, detail: "malformed_sse_json" }; return; }
    switch (ev.type) {
      case "response.output_text.delta": text += ev.delta ?? ""; break;
      case "response.completed": {
        completed = true; responseId = ev.response?.id ?? null;
        // Пълният текст от финалното съобщение е по-надежден от делтите.
        const parts: string[] = [];
        for (const item of (ev.response?.output ?? []) as { type?: string; content?: { type?: string; text?: string }[] }[]) {
          if (item.type === "message") for (const c of item.content ?? []) if (c.type === "output_text" && typeof c.text === "string") parts.push(c.text);
        }
        if (parts.length) completedText = parts.join("");
        break;
      }
      case "response.failed": failure = { ok: false, kind: "failed", text, detail: JSON.stringify(ev.response?.error ?? null).slice(0, 300) }; break;
      case "response.incomplete": failure = { ok: false, kind: "incomplete", text, detail: JSON.stringify(ev.response?.incomplete_details ?? null).slice(0, 300) }; break;
      case "error": failure = { ok: false, kind: "error", text, detail: String(ev.message ?? JSON.stringify(ev.error ?? null)).slice(0, 300) }; break;
      default: break;
    }
  };

  for await (const chunk of chunks) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  buf += dec.decode(); // flush
  if (buf) handle(buf);

  if (failure) return failure;
  if (!completed) return { ok: false, kind: "truncated", text, detail: "no_response_completed" };
  const final = completedText ?? text;
  if (!final.trim()) return { ok: false, kind: "empty", text: final, detail: "empty_output" };
  return { ok: true, text: final, responseId };
}
