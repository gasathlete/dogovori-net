// Shared edge function helper: loads the active system prompt for a given
// AI function from the public.ai_prompts table, with a small in-memory cache.
// Falls back to the provided default when no DB row exists yet.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface CacheEntry { content: string; expires: number }
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

export async function loadActivePrompt(
  admin: SupabaseClient,
  functionName: string,
  fallback: string,
): Promise<string> {
  const hit = cache.get(functionName);
  if (hit && hit.expires > Date.now()) return hit.content;

  try {
    const { data, error } = await admin
      .from("ai_prompts")
      .select("content")
      .eq("function_name", functionName)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const content = data?.content && data.content.trim().length > 0 ? data.content : fallback;
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
