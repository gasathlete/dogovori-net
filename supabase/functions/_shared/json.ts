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

export function extractJson(s: string): any {
  let cleaned = s.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.search(/[\{\[]/);
  const openCh = start !== -1 ? cleaned[start] : "";
  const closeCh = openCh === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(closeCh);
  if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
  try { return JSON.parse(cleaned); } catch {}
  cleaned = escapeControlCharsInStrings(cleaned);
  try { return JSON.parse(cleaned); } catch {}
  cleaned = cleaned
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  try { return JSON.parse(cleaned); } catch {}
  // Last-resort: repair a response truncated mid-string / mid-escape (max_tokens),
  // then balance braces/brackets. Without this the whole generation fails.
  const balance = (src: string) => {
    let inStr = false, esc = false, braces = 0, brackets = 0;
    for (const c of src) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") braces++; else if (c === "}") braces--;
      else if (c === "[") brackets++; else if (c === "]") brackets--;
    }
    return { inStr, braces, brackets };
  };

  let { inStr, braces, brackets } = balance(cleaned);

  if (inStr) {
    // Drop an incomplete trailing escape sequence, e.g. `...\` or `...\u00`,
    // which would otherwise swallow the closing quote we add.
    cleaned = cleaned.replace(/\\u[0-9a-fA-F]{0,3}$/, "").replace(/(^|[^\\])((?:\\\\)*)\\$/, "$1$2");
    cleaned += '"';
  }

  // Remove trailing fragments the truncation left behind: a dangling comma,
  // or a key with no (complete) value such as `"detail":` / `"detail": "x",`.
  let prev = "";
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned
      .replace(/,\s*$/, "")
      .replace(/"(?:[^"\\]|\\.)*"\s*:\s*$/, "")
      .replace(/,\s*$/, "");
  }

  ({ braces, brackets } = balance(cleaned));
  while (brackets-- > 0) cleaned += "]";
  while (braces-- > 0) cleaned += "}";

  try { return JSON.parse(cleaned); } catch {}

  // Still broken: walk back to the last structurally closed object/array so the
  // caller gets partial-but-valid data instead of a hard failure.
  for (let i = cleaned.length - 1; i > 0; i--) {
    const c = cleaned[i];
    if (c !== "}" && c !== "]") continue;
    let candidate = cleaned.slice(0, i + 1).replace(/,\s*$/, "");
    const b = balance(candidate);
    if (b.inStr) continue;
    let { braces: nb, brackets: nk } = b;
    while (nk-- > 0) candidate += "]";
    while (nb-- > 0) candidate += "}";
    try { return JSON.parse(candidate); } catch { /* keep scanning */ }
  }

  return JSON.parse(cleaned);

}
