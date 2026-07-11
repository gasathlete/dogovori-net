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
  // Last-resort: close an unterminated string, then balance braces/brackets.
  // LLM responses get truncated mid-string when max_tokens is hit — without
  // this recovery the entire document generation fails.
  let inString = false;
  let escape = false;
  let braces = 0, brackets = 0;
  for (const c of cleaned) {
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") braces++; else if (c === "}") braces--;
    else if (c === "[") brackets++; else if (c === "]") brackets--;
  }
  if (inString) cleaned += '"';
  // Drop a dangling trailing comma created by the truncation.
  cleaned = cleaned.replace(/,\s*$/g, "");
  while (brackets-- > 0) cleaned += "]";
  while (braces-- > 0) cleaned += "}";
  return JSON.parse(cleaned);
}
