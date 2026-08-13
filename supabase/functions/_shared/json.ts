import { logAiParseFailure } from "./jsonDiagnostics.ts";
import { logAiOutput } from "./ai-log.ts";
// Shared helper: tolerant JSON extraction from LLM responses.
// Strips markdown fences, escapes literal control chars inside strings,
// removes trailing commas, and balances braces/brackets.
function escapeControlCharsInStrings(input: string): string {
  let out = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const code = ch.charCodeAt(0);

    if (escape) {
      out += ch;
      escape = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escape = true;
      continue;
    }

    if (ch === '"') {
      out += ch;
      inString = !inString;
      continue;
    }

    if (inString && code <= 0x1f) {
      if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else out += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }

    out += ch;
  }

  return out;
}

export interface ExtractJsonCtx {
  /** Име на edge функцията — за админ панела. */
  fn?: string;
  /** Correlation ID на заявката. */
  correlationId?: string;
  model?: string | null;
  stage?: string;
  /** По подразбиране провалите се логват; изключи за "best effort" опити. */
  report?: boolean;
}

export function extractJson(s: string, ctx?: ExtractJsonCtx): any {
  const trace: { final?: string } = {};
  try {
    const value = extractJsonInner(s, trace);
    // Безопасно логване: маскиран суров изход + описание на поправката.
    const repaired = trace.final ?? s;
    logAiOutput({
      fn: ctx?.fn,
      correlationId: ctx?.correlationId,
      stage: ctx?.stage,
      model: ctx?.model,
      outcome: repaired === s.trim() || repaired === s ? "parsed" : "repaired",
      raw: s,
      ...(repaired === s || repaired === s.trim() ? {} : { repaired }),
    });
    return value;
  } catch (err) {
    logAiOutput({
      fn: ctx?.fn,
      correlationId: ctx?.correlationId,
      stage: ctx?.stage,
      model: ctx?.model,
      outcome: "failed",
      raw: s,
      error: err,
    });
    if (ctx?.report !== false) {
      logAiParseFailure({ fn: ctx?.fn, model: ctx?.model, stage: ctx?.stage, raw: s, error: err, correlationId: ctx?.correlationId });
    }
    throw err;
  }
}

function extractJsonInner(s: string, trace: { final?: string } = {}): any {
  // Записва текста, който в крайна сметка е бил успешно парснат.
  const P = (cur: string): any => {
    const value = JSON.parse(cur);
    trace.final = cur;
    return value;
  };

  let cleaned = s.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.search(/[\{\[]/);
  const openCh = start !== -1 ? cleaned[start] : "";
  const closeCh = openCh === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(closeCh);
  if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
  try { return P(cleaned); } catch {}
  cleaned = escapeControlCharsInStrings(cleaned);
  try { return P(cleaned); } catch {}
  cleaned = cleaned
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  try { return P(cleaned); } catch {}

  // Error-position guided repair: the most common mid-document break is an
  // unescaped double quote inside a string value, which closes the string too
  // early ("Expected ',' or '}' after property value in JSON at position N").
  // Escape the offending quote and retry, iteratively.
  {
    let cur = cleaned;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { return P(cur); } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const m = msg.match(/position (\d+)/i);
        if (!m) break;
        if (!/Expected ',' or '}'|Expected ',' or ']'|Expected double-quoted property name|Unexpected (?:non-whitespace|string|token)/i.test(msg)) break;
        const pos = Number(m[1]);
        const q = cur.lastIndexOf('"', Math.max(0, pos - 1));
        if (q <= 0 || cur[q - 1] === "\\") break;
        cur = cur.slice(0, q) + '\\"' + cur.slice(q + 1);
      }
    }
  }
  // Last-resort: repair a response truncated mid-string / mid-escape (max_tokens),
  // then close the open containers in the correct nesting order.

  // then close the open containers in the correct nesting order.
  const scan = (src: string) => {
    let inStr = false, esc = false;
    const stack: string[] = [];
    for (const c of src) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") stack.push("}");
      else if (c === "[") stack.push("]");
      else if (c === "}" || c === "]") stack.pop();
    }
    return { inStr, closers: stack.reverse().join("") };
  };

  const close = (src: string) => {
    const { inStr, closers } = scan(src);
    return inStr ? null : src.replace(/,\s*$/, "") + closers;
  };

  if (scan(cleaned).inStr) {
    // Drop an incomplete trailing escape sequence, e.g. `...\` or `...\u00`,
    // which would otherwise swallow the closing quote we add.
    cleaned = cleaned.replace(/\\u[0-9a-fA-F]{0,3}$/, "").replace(/(^|[^\\])((?:\\\\)*)\\$/, "$1$2");
    cleaned += '"';
  }

  // Remove trailing fragments the truncation left behind: a dangling comma,
  // or a key with no value such as `"detail":`.
  let prev = "";
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned
      .replace(/,\s*$/, "")
      .replace(/"(?:[^"\\]|\\.)*"\s*:\s*$/, "")
      .replace(/,\s*$/, "");
  }

  const closed = close(cleaned);
  if (closed) {
    try { return P(closed); } catch {}
  }

  // Still broken: walk back to the last structurally valid point so the caller
  // gets partial-but-valid data instead of a hard failure.
  for (let i = cleaned.length - 1; i > 0; i--) {
    const c = cleaned[i];
    if (c !== "}" && c !== "]" && c !== '"' && !/[0-9]/.test(c)) continue;
    const candidate = close(cleaned.slice(0, i + 1));
    if (!candidate) continue;
    try { return P(candidate); } catch { /* keep scanning */ }
  }

  return P(cleaned);


}
