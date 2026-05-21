// Suggest follow-up wizard questions based on partial answers + contract type.
// Pulls from the staff-curated contract_question_bank and applies trigger_conditions
// (simple equality match on existing answers). Public — used live by the wizard.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Question {
  id: string;
  question_text: string;
  field_type: string;
  options: unknown;
  importance: number;
  trigger_conditions: Record<string, unknown>;
  contract_type: string | null;
  sector_id: string | null;
}

function conditionsMet(
  conds: Record<string, unknown>,
  answers: Record<string, unknown>,
): boolean {
  if (!conds || Object.keys(conds).length === 0) return true;
  return Object.entries(conds).every(([key, expected]) => {
    const actual = answers[key];
    if (Array.isArray(expected)) {
      return expected.some((e) => String(actual ?? "").toLowerCase() === String(e).toLowerCase());
    }
    if (typeof expected === "string" && expected.startsWith("contains:")) {
      const needle = expected.slice("contains:".length).toLowerCase();
      return String(actual ?? "").toLowerCase().includes(needle);
    }
    return String(actual ?? "") === String(expected);
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const sectorId: string | undefined = body.sector_id;
    const contractType: string | undefined = body.contract_type;
    const answers: Record<string, unknown> = body.answers ?? {};
    const limit: number = Math.min(10, Math.max(1, body.limit ?? 5));

    let query = admin
      .from("contract_question_bank")
      .select("id, question_text, field_type, options, importance, trigger_conditions, contract_type, sector_id")
      .eq("active", true);

    // Match on sector or contract type if provided (OR with null for global).
    if (sectorId) {
      query = query.or(`sector_id.eq.${sectorId},sector_id.is.null`);
    }
    if (contractType) {
      query = query.or(`contract_type.eq.${contractType},contract_type.is.null`);
    }

    const { data, error } = await query.order("importance", { ascending: false }).limit(50);
    if (error) throw error;

    const filtered = (data as Question[])
      .filter((q) => conditionsMet(q.trigger_conditions ?? {}, answers))
      .slice(0, limit)
      .map((q) => ({
        id: q.id,
        question: q.question_text,
        type: q.field_type,
        options: q.options,
        importance: q.importance,
      }));

    return new Response(JSON.stringify({ questions: filtered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-followup-questions error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e), questions: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
