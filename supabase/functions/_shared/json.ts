// Shared helper: tolerant JSON extraction from LLM responses.
// Strips markdown fences, control chars, trailing commas, and balances braces/brackets.
export function extractJson(s: string): any {
  let cleaned = s.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.search(/[\{\[]/);
  const openCh = start !== -1 ? cleaned[start] : "";
  const closeCh = openCh === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(closeCh);
  if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
  try { return JSON.parse(cleaned); } catch {}
  cleaned = cleaned
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x1F\x7F]/g, "");
  try { return JSON.parse(cleaned); } catch {}
  // Last-resort: balance unmatched braces/brackets
  let braces = 0, brackets = 0;
  for (const c of cleaned) {
    if (c === "{") braces++; else if (c === "}") braces--;
    if (c === "[") brackets++; else if (c === "]") brackets--;
  }
  while (brackets-- > 0) cleaned += "]";
  while (braces-- > 0) cleaned += "}";
  return JSON.parse(cleaned);
}
