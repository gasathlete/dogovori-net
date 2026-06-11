// Shared edge function helper: loads the active system prompt for a given
// AI function from the public.ai_prompts table, with a small in-memory cache.
// Falls back to the provided default when no DB row exists yet.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface CacheEntry { content: string; model?: string | null; premiumModel?: string | null; expires: number }
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

export interface ActivePromptMeta {
  content: string;
  model: string | null;
  premiumModel: string | null;
}

/** Loads active prompt + model config in one call. */
export async function loadActivePromptMeta(
  admin: SupabaseClient,
  functionName: string,
  fallback: string,
): Promise<ActivePromptMeta> {
  const hit = cache.get(functionName);
  if (hit && hit.expires > Date.now()) {
    return { content: hit.content, model: hit.model ?? null, premiumModel: hit.premiumModel ?? null };
  }
  try {
    const { data: promptRow } = await admin
      .from("ai_prompts")
      .select("id, content, model, premium_model")
      .eq("function_name", functionName)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    let content = "";
    if (promptRow?.id) {
      const { data: sections } = await admin
        .from("ai_prompt_sections")
        .select("title, content, order_idx, enabled")
        .eq("prompt_id", promptRow.id)
        .eq("enabled", true)
        .order("order_idx", { ascending: true });
      if (sections && sections.length > 0) {
        content = sections
          .map((s: { title: string; content: string }) =>
            s.title ? `# ${s.title}\n${s.content}` : s.content,
          )
          .join("\n\n")
          .trim();
      }
    }
    if (!content && promptRow?.content?.trim()) content = promptRow.content;
    if (content && fallback && content.length < fallback.length * 0.7) {
      console.warn(`[prompt-loader] ${functionName} assembled too small, using fallback`);
      content = fallback;
    }
    if (!content) content = fallback;

    const meta: ActivePromptMeta = {
      content,
      model: (promptRow as any)?.model ?? null,
      premiumModel: (promptRow as any)?.premium_model ?? null,
    };
    cache.set(functionName, { content, model: meta.model, premiumModel: meta.premiumModel, expires: Date.now() + TTL_MS });
    return meta;
  } catch (e) {
    console.warn(`[prompt-loader] ${functionName} fallback:`, (e as Error).message);
    return { content: fallback, model: null, premiumModel: null };
  }
}

export async function loadActivePrompt(
  admin: SupabaseClient,
  functionName: string,
  fallback: string,
): Promise<string> {
  const hit = cache.get(functionName);
  if (hit && hit.expires > Date.now()) return hit.content;

  try {
    const { data: promptRow, error: pErr } = await admin
      .from("ai_prompts")
      .select("id, content")
      .eq("function_name", functionName)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pErr) throw pErr;

    let content = "";
    if (promptRow?.id) {
      const { data: sections } = await admin
        .from("ai_prompt_sections")
        .select("content, order_idx, enabled")
        .eq("prompt_id", promptRow.id)
        .eq("enabled", true)
        .order("order_idx", { ascending: true });
      if (sections && sections.length > 0) {
        content = sections.map((s: { content: string }) => s.content).join("\n\n").trim();
      }
    }
    if (!content && promptRow?.content && promptRow.content.trim().length > 0) {
      content = promptRow.content;
    }
    // Safety: if assembled content is dramatically smaller than the hardcoded
    // fallback, prefer the fallback to avoid quality regression.
    if (content && fallback && content.length < fallback.length * 0.7) {
      console.warn(`[prompt-loader] ${functionName} assembled too small (${content.length} < ${fallback.length}), using fallback`);
      content = fallback;
    }
    if (!content) content = fallback;

    cache.set(functionName, { content, expires: Date.now() + TTL_MS });
    return content;
  } catch (e) {
    console.warn(`[prompt-loader] ${functionName} fallback:`, (e as Error).message);
    return fallback;
  }
}

export async function loadActiveRules(
  admin: SupabaseClient,
  functionName: string,
): Promise<string> {
  try {
    const { data } = await admin
      .from("ai_rules")
      .select("rule_text, severity")
      .eq("function_name", functionName)
      .eq("active", true);
    if (!data || data.length === 0) return "";
    const must = data.filter((r) => r.severity === "must").map((r) => `MUST: ${r.rule_text}`);
    const should = data.filter((r) => r.severity === "should").map((r) => `SHOULD: ${r.rule_text}`);
    return [...must, ...should].join("\n");
  } catch {
    return "";
  }
}

export async function loadTrainingExamples(
  admin: SupabaseClient,
  functionName: string,
  category?: string | null,
  limit = 3,
): Promise<Array<{ input_context: string; expected_output: string }>> {
  try {
    let q = admin
      .from("ai_training_examples")
      .select("input_context, expected_output, category, weight")
      .eq("function_name", functionName)
      .eq("active", true);
    if (category) q = q.eq("category", category);
    const { data } = await q
      .order("weight", { ascending: false })
      .limit(limit);
    return data ?? [];
  } catch {
    return [];
  }
}
