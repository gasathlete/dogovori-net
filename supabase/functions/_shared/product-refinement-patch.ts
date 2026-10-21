/** Merge only explicitly allowed narrative changes; paid evidence never comes from a model. */
export function mergeRefinementPatch(base: { payload: unknown }, patch: unknown): unknown {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("refined_invalid");
  const values = patch as Record<string, unknown>;
  const allowed = ["objectives", "red_lines", "acceptable_concessions", "fallbacks", "negotiation_questions", "actions", "messages"];
  if (Object.keys(values).length === 0 || Object.keys(values).some(key => !allowed.includes(key))) throw new Error("refined_invalid");
  if (!base.payload || typeof base.payload !== "object" || Array.isArray(base.payload)) throw new Error("refined_invalid");
  return { ...base, payload: { ...base.payload, ...values, refinement: { included: 1, used: 1 } } };
}