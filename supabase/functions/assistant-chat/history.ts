/**
 * P0-E2 — историята на разговора е СЪРВЪРНА истина.
 *
 * Браузърът подава САМО новото съобщение. Предходните ходове се четат от
 * `assistant_messages` за доказано собствения разговор. Клиентски „препис“ на
 * разговора не се приема при никакви обстоятелства.
 */

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export const HISTORY_TURN_LIMIT = 20;
export const HISTORY_CHARS_LIMIT = 8000;

export interface HistoryReader {
  from: (table: string) => any;
}

/**
 * Връща последните ходове на разговора в хронологичен ред. При грешка в базата
 * връща `null` — извикващият спира с контролирана грешка, вместо да продължи с
 * непълна история.
 */
export async function loadThreadHistory(
  admin: HistoryReader,
  threadId: string,
): Promise<HistoryMessage[] | null> {
  const { data, error } = await admin
    .from("assistant_messages")
    .select("role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURN_LIMIT);
  if (error) return null;
  const rows = Array.isArray(data) ? data : [];
  const mapped: HistoryMessage[] = [];
  for (const r of rows) {
    const role = (r as { role?: unknown }).role;
    const content = (r as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    mapped.push({ role, content: content.slice(0, HISTORY_CHARS_LIMIT) });
  }
  return mapped.reverse();
}
