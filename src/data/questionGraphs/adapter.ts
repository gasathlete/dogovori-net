/**
 * Adapter: converts a rich `QuestionGraph` (dynamic decision tree with
 * `visible_when`/`required_when` DSL, typed fields, sections) into the
 * flat, grouped `Question[]` shape consumed by the classic `Wizard.tsx`
 * renderer.
 *
 * Rationale: we've unified the wizard experience — the classic UI is the
 * only one users see. Documents that have a graph get **richer, conditional
 * questions in the same UI**, not a separate route/renderer.
 */
import type { Question } from "../sectors";
import type { QuestionGraph, QuestionNode, FieldType } from "@/lib/questionGraph";
import { evaluateExpression, type Ctx } from "@/lib/expressionEvaluator";

/** Map user-visible answer strings back to graph values for expression evaluation. */
function buildEvalContext(graph: QuestionGraph, answers: Record<string, string>): Ctx {
  const ctx: Ctx = {};
  for (const q of graph.questions) {
    const raw = answers[q.id];
    if (raw === undefined || raw === null || raw === "") {
      // fall back to declared default when the user hasn't answered yet
      if (q.default !== undefined) ctx[q.id] = q.default;
      continue;
    }
    ctx[q.id] = coerceAnswer(q, raw);
  }
  return ctx;
}

function coerceAnswer(q: QuestionNode, raw: string): unknown {
  switch (q.field_type) {
    case "boolean":
      return raw === "Да" || raw === "true" || raw === "yes";
    case "number":
    case "money": {
      const n = Number(String(raw).replace(",", "."));
      return Number.isFinite(n) ? n : raw;
    }
    case "select":
    case "multiselect": {
      const match = q.options?.find((o) => o.label === raw);
      return match ? match.value : raw;
    }
    default:
      return raw;
  }
}

function mapFieldType(ft: FieldType): Question["type"] {
  switch (ft) {
    case "longtext":
    case "multiselect":
    case "party_list":
      return "textarea";
    case "number":
    case "money":
      return "number";
    case "date":
      return "date";
    case "boolean":
    case "select":
      return "select";
    case "signature":
    case "text":
    default:
      return "text";
  }
}

function mapOptions(q: QuestionNode): string[] | undefined {
  if (q.field_type === "boolean") return ["Да", "Не"];
  if ((q.field_type === "select" || q.field_type === "multiselect") && q.options) {
    return q.options.map((o) => o.label);
  }
  return undefined;
}

function fieldHelp(q: QuestionNode): string | undefined {
  const notes: string[] = [];
  if (q.help) notes.push(q.help);
  if (q.field_type === "multiselect") notes.push("Може да изброите няколко стойности, разделени със запетая.");
  if (q.field_type === "party_list") notes.push("По един ред на страна: „Име | Тип (физическо/юридическо) | ЕГН/ЕИК“.");
  if (q.field_type === "signature") notes.push("Полето за подпис ще се попълни след сваляне на документа.");
  if (q.field_type === "money") notes.push("Сумата е в евро (EUR).");
  return notes.length ? notes.join(" ") : undefined;
}

function toWizardQuestion(graph: QuestionGraph, q: QuestionNode): Question {
  const showIf: Question["showIf"] | undefined = q.visible_when
    ? (answers) => evaluateExpression(q.visible_when!, buildEvalContext(graph, answers))
    : undefined;

  const required =
    q.required_when === "true" ||
    (typeof q.required_when === "string" && q.required_when.length > 0);

  const options = mapOptions(q);
  const type = mapFieldType(q.field_type);

  return {
    id: q.id,
    label: q.label,
    help: fieldHelp(q),
    type,
    options,
    placeholder:
      q.field_type === "money" ? "напр. 500" :
      q.field_type === "number" ? "напр. 30" :
      q.field_type === "date" ? "" :
      undefined,
    required,
    ...(showIf ? { showIf } : {}),
  };
}

/**
 * Convert a `QuestionGraph` into the grouped `Question[]` structure the
 * classic wizard expects. Groups follow the graph's declared sections so
 * the "cards" in the wizard mirror the semantic grouping the template
 * author intended.
 */
export function adaptGraphToWizardQuestions(graph: QuestionGraph): Question[] {
  const out: Question[] = [];
  for (const section of graph.sections) {
    const sectionQs = graph.questions.filter((q) => q.section === section.id);
    if (sectionQs.length === 0) continue;

    // Ако секцията съдържа само party_list полета — рендираме я със специалния
    // блок за страни (кликаеми ФЛ / ЮЛ / ЕТ), а не като текстови полета.
    const partyOnly = sectionQs.every((q) => q.field_type === "party_list");
    if (partyOnly) {
      const partyFields: Question[] = sectionQs.map((q) => ({
        id: q.id,
        label: q.label,
        type: "text", // не се използва — PartyBlock рендира собствен UI
        required: q.required_when === "true",
      }));
      out.push({
        id: `group_parties_${section.id}`,
        label: section.title,
        help: section.description ?? "Посочете само правно-организационната форма. Имена, ЕГН и други лични данни не се събират.",
        type: "group",
        fields: partyFields,
      });
      continue;
    }

    const mapped = sectionQs.map((q) => toWizardQuestion(graph, q));
    out.push({
      id: `graph_group_${section.id}`,
      label: section.title,
      help: section.description,
      type: "group",
      fields: mapped,
    });
  }
  return out;
}
