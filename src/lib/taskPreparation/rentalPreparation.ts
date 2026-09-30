/**
 * Подготовка „Отдавам обзаведено жилище под наем“.
 *
 * Преизползва:
 *   - канонични въпроси от графа на „Договор за наем на жилище“ (по id, без копиране на текст);
 *   - комплекта `naem-zhilishte` и неговите етапи (featuredKitStages);
 *   - каталожните документи (по точно име).
 *
 * Тук НЯМА правен текст и НЯМА генериране. Модулът само решава кои от вече
 * съществуващите документи са приложими към отговорите и какви общи факти
 * е събрал потребителят. Не твърди, че фактите се попълват автоматично в
 * изтеглените документи — това не е проверено.
 */
import type { Ctx } from "@/lib/expressionEvaluator";
import { resolveGraph, pruneAnswers, type QuestionGraph, type QuestionNode } from "@/lib/questionGraph";
import { dogovorZaNaemGraph } from "@/data/questionGraphs/dogovor-za-naem-na-zhilishte";
import { getKit, type KitItem } from "@/data/documentKits";
import { FEATURED_KIT_STAGES } from "@/data/featuredKitStages";

export const RENTAL_KIT_ID = "naem-zhilishte" as const;

/** Въпроси от каноничния граф, които са общи факти за целия комплект. */
const SHARED_FROM_LEASE_GRAPH = [
  "landlord",
  "tenant",
  "property_type",
  "property_address",
  "furniture_included",
  "start_date",
  "monthly_rent",
  "payment_method",
  "has_deposit",
  "deposit_amount",
] as const;

function pickLeaseQuestion(id: string): QuestionNode {
  const q = dogovorZaNaemGraph.questions.find((x) => x.id === id);
  if (!q) throw new Error(`Липсващ каноничен въпрос: ${id}`);
  // party_list се събира като едно текстово име в подготовката.
  return q.field_type === "party_list" ? { ...q, field_type: "text" } : q;
}

/** Въпроси, специфични за подготовката (избор на документи, не правно съдържание). */
const PREPARATION_QUESTIONS: QuestionNode[] = [
  {
    id: "include_nap_declaration",
    section: "documents",
    label: "Да включим ли декларацията за регистрация на наем пред НАП в списъка?",
    help: "По избор. Проверете дали се отнася за Вашия случай.",
    field_type: "boolean",
    required_when: "true",
  },
];

export const RENTAL_PREPARATION_GRAPH: QuestionGraph = {
  template_slug: "podgotovka-naem-obzavedeno-zhilishte",
  title: "Отдавам обзаведено жилище под наем",
  sections: [
    { id: "parties", title: "Страни" },
    { id: "property", title: "Жилище" },
    { id: "terms", title: "Наем и плащане" },
    { id: "deposit", title: "Депозит" },
    { id: "documents", title: "Документи" },
  ],
  questions: [
    ...SHARED_FROM_LEASE_GRAPH.map(pickLeaseQuestion).filter((q) =>
      ["parties", "property", "terms", "deposit"].includes(q.section),
    ),
    ...PREPARATION_QUESTIONS,
  ],
};

/** Начални отговори за сценария „обзаведено“. Потребителят може да ги промени. */
export const RENTAL_INITIAL_ANSWERS: Readonly<Ctx> = Object.freeze({ furniture_included: "full" });

export type DocStatus = "available" | "planned";

export interface PreparedDocument {
  docName: string;
  stageLabel: string;
  included: boolean;
  /** Кратко обяснение защо е включен или изключен. */
  reason: string;
  status: DocStatus;
  /** Канонична страница на шаблона — само ако съществува. */
  slug?: string;
  /** Документ, който се подготвя по-късно (напр. при прекратяване). */
  later?: boolean;
}

function decide(docName: string, a: Ctx): { included: boolean; reason: string; later?: boolean } {
  switch (docName) {
    case "Договор за наем на жилище":
      return { included: true, reason: "Основният документ за наема." };
    case "Приемно-предавателен протокол":
      return { included: true, reason: "Удостоверява предаването на жилището и ключовете." };
    case "Опис на инвентар към договор за наем":
      return a.furniture_included === "none"
        ? { included: false, reason: "Посочили сте, че жилището не е обзаведено." }
        : { included: true, reason: "Жилището е обзаведено — описва мебелите и уредите." };
    case "Разписка за получена сума (наем/депозит)":
      if (a.has_deposit === true) return { included: true, reason: "Удостоверява получения депозит." };
      if (a.payment_method === "cash") return { included: true, reason: "Наемът се плаща в брой." };
      return { included: false, reason: "Няма депозит и плащането не е в брой." };
    case "Декларация за регистрация на наем пред НАП":
      return a.include_nap_declaration === true
        ? { included: true, reason: "Избрахте да я включите." }
        : { included: false, reason: "По избор — не е избрана." };
    case "Предизвестие за прекратяване на наем":
      return { included: false, later: true, reason: "Използва се по-късно, при прекратяване." };
    default:
      return { included: false, reason: "Не е част от тази подготовка." };
  }
}

/**
 * Изгражда списъка с документи от реалния комплект. Всеки елемент на комплекта
 * се появява точно веднъж; планираните позиции са без адрес и без изтегляне.
 */
export function planRentalDocuments(
  answers: Ctx,
  availableSlugs: ReadonlyMap<string, string>,
): PreparedDocument[] {
  const kit = getKit(RENTAL_KIT_ID);
  if (!kit) return [];
  const byName = new Map<string, KitItem>(kit.items.map((i) => [i.docName, i]));
  const out: PreparedDocument[] = [];
  for (const stage of FEATURED_KIT_STAGES[RENTAL_KIT_ID]) {
    for (const name of stage.documentNames) {
      if (!byName.has(name)) continue;
      const slug = availableSlugs.get(name);
      const d = decide(name, answers);
      out.push({
        docName: name,
        stageLabel: stage.label,
        ...d,
        status: slug ? "available" : "planned",
        slug,
      });
    }
    if (stage.plannedItem) {
      out.push({
        docName: stage.plannedItem,
        stageLabel: stage.label,
        included: false,
        later: true,
        reason: "Предстои да бъде добавен в каталога.",
        status: "planned",
      });
    }
  }
  return out;
}

export function resolveRentalPreparation(answers: Ctx) {
  return resolveGraph(RENTAL_PREPARATION_GRAPH, answers);
}

/** Премахва отговори от скрити разклонения (напр. сума на депозит при „без депозит“). */
export function pruneRentalAnswers(answers: Ctx): Ctx {
  return pruneAnswers(RENTAL_PREPARATION_GRAPH, answers);
}

/** Кои общи факти се отнасят за кой документ — само за показване в обобщението. */
export const FACTS_BY_DOCUMENT: Readonly<Record<string, readonly string[]>> = {
  "Договор за наем на жилище": ["landlord", "tenant", "property_address", "start_date", "monthly_rent", "payment_method", "deposit_amount"],
  "Приемно-предавателен протокол": ["landlord", "tenant", "property_address", "start_date"],
  "Опис на инвентар към договор за наем": ["landlord", "tenant", "property_address"],
  "Разписка за получена сума (наем/депозит)": ["landlord", "tenant", "deposit_amount", "monthly_rent"],
  "Декларация за регистрация на наем пред НАП": ["landlord", "property_address", "monthly_rent"],
};
