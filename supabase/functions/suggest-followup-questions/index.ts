// Suggest follow-up wizard questions based on partial answers + contract type.
// Pulls from the staff-curated contract_question_bank and applies trigger_conditions
// (simple equality match on existing answers). Public — used live by the wizard.

import { matchesScope, mergeRanked, parseLimit, parseScope, SCOPE_CAPACITY, scopeCombos } from "./filters.ts";
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

    const raw = await req.json().catch(() => ({}));
    const body = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw as Record<string, unknown> : {};
    const scope = parseScope(body);
    if (!scope.ok) {
      return new Response(JSON.stringify({ error: "Невалидна стойност.", code: "invalid_input", field: scope.field, questions: [] }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { sectorId, contractType } = scope;
    const answers: Record<string, unknown> =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? body.answers as Record<string, unknown>
        : {};
    const limit = parseLimit(body.limit);

    // Всяка комбинация (стойност | NULL) е отделна заявка с `.eq`/`.is`.
    // Всяка е ограничена до SCOPE_CAPACITY + 1 реда: надхвърляне означава, че
    // пълнотата не е доказана → честна грешка, никога тихо отрязан резултат.
    const groups: Question[][] = [];
    for (const combo of scopeCombos(sectorId, contractType)) {
      let q = admin
        .from("contract_question_bank")
        .select("id, question_text, field_type, options, importance, trigger_conditions, contract_type, sector_id")
        .eq("active", true);
      for (const f of combo) q = f.value === null ? q.is(f.column, null) : q.eq(f.column, f.value);
      const { data, error } = await q
        .order("importance", { ascending: false })
        .order("id", { ascending: true })
        .limit(SCOPE_CAPACITY + 1);
      if (error) throw error;
      const rows = (data ?? []) as Question[];
      if (rows.length > SCOPE_CAPACITY) {
        return new Response(JSON.stringify({
          error: "Предложенията временно не са достъпни.",
          code: "capacity_exceeded",
          questions: [],
        }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      groups.push(rows);
    }

    const filtered = mergeRanked(groups)
      .filter((q) => matchesScope(q, sectorId, contractType))
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
    return new Response(JSON.stringify({ error: "Предложенията временно не са достъпни.", code: "unavailable", questions: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
