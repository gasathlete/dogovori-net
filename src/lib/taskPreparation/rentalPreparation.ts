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
 * изтеглените документи — експортът остава под текущите ограничения.
 * Предварителното попълване на въпросниците е в `rentalFieldMap.ts`.
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
  "term_type",
  "start_date",
  "end_date",
  "monthly_rent",
  "payment_day",
  "payment_method",
  "has_deposit",
  "deposit_amount",
] as const;

/** Същите стойности, които PartyBlock на въпросника пази (само форма, без имена). */
export const PARTY_TYPE_OPTIONS = ["Юридическо лице", "Физическо лице", "ЕТ / Самоосигуряващо се"] as const;

/** Подготовката е само за жилище — стая и търговски обект имат друг път. */
export const SUPPORTED_PROPERTY_TYPES = ["apartment", "house"] as const;

function pickLeaseQuestion(id: string): QuestionNode {
  const q = dogovorZaNaemGraph.questions.find((x) => x.id === id);
  if (!q) throw new Error(`Липсващ каноничен въпрос: ${id}`);
  if (q.field_type === "party_list") {
    return {
      ...q,
      field_type: "select",
      help: "Правно-организационна форма. Имена и ЕГН се въвеждат в самия документ.",
      options: PARTY_TYPE_OPTIONS.map((o) => ({ value: o, label: o })),
    };
  }
  return q;
}

export const RENTAL_PREPARATION_GRAPH: QuestionGraph = {
  template_slug: "podgotovka-naem-obzavedeno-zhilishte",
  title: "Отдавам обзаведено жилище под наем",
  sections: [
    { id: "parties", title: "Страни" },
    { id: "property", title: "Жилище" },
    { id: "terms", title: "Наем и плащане" },
    { id: "deposit", title: "Депозит" },
  ],
  questions: [
    ...SHARED_FROM_LEASE_GRAPH.map(pickLeaseQuestion).filter((q) =>
      ["parties", "property", "terms", "deposit"].includes(q.section),
    ),
  ],
};

/** Начални отговори за сценария „обзаведено“. Потребителят може да ги промени. */
export const RENTAL_INITIAL_ANSWERS: Readonly<Ctx> = Object.freeze({ furniture_included: "full", payment_day: 5 });

export type DocStatus = "available" | "planned";

export interface PreparedDocument {
  docName: string;
  stageLabel: string;
  included: boolean;
  /** Решението зависи от още неотговорен въпрос — не е „не е нужен“. */
  pending?: boolean;
  /** Приложимостта към случая не е преценена от подготовката. */
  notAssessed?: boolean;
  /** Кратко обяснение защо е включен или изключен. */
  reason: string;
  status: DocStatus;
  /** Канонична страница на шаблона — само ако съществува. */
  slug?: string;
  /** Документ, който се подготвя по-късно (напр. при прекратяване). */
  later?: boolean;
}

type Decision = { included: boolean; reason: string; later?: boolean; pending?: boolean; notAssessed?: boolean };
const unanswered = (v: unknown) => v === undefined || v === null || v === "";

function decide(docName: string, a: Ctx): Decision {
  switch (docName) {
    case "Договор за наем на жилище":
      return { included: true, reason: "Основният документ за наема." };
    case "Приемно-предавателен протокол":
      return { included: true, reason: "Удостоверява предаването на жилището и ключовете." };
    case "Опис на инвентар към договор за наем":
      if (unanswered(a.furniture_included)) return { included: false, pending: true, reason: "Отговорете дали жилището е обзаведено." };
      return a.furniture_included === "none"
        ? { included: false, reason: "Посочили сте, че жилището не е обзаведено." }
        : { included: true, reason: "Жилището е обзаведено — описва мебелите и уредите." };
    case "Разписка за получена сума (наем/депозит)":
      if (a.has_deposit === true) return { included: true, reason: "Удостоверява получения депозит." };
      if (a.payment_method === "cash") return { included: true, reason: "Наемът се плаща в брой." };
      if (unanswered(a.has_deposit) || unanswered(a.payment_method))
        return { included: false, pending: true, reason: "Отговорете за депозита и начина на плащане." };
      return { included: false, reason: "Няма депозит и плащането не е в брой." };
    case "Декларация за регистрация на наем пред НАП":
      return { included: false, notAssessed: true, reason: "Не е част от подготовката. Приложимостта към Вашия случай не е преценена; документът остава в каталога." };
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

/** Стая и търговско помещение не минават по пътя за обзаведено жилище. */
export function isUnsupportedProperty(a: Ctx): boolean {
  return !unanswered(a.property_type) && !(SUPPORTED_PROPERTY_TYPES as readonly unknown[]).includes(a.property_type);
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
  "Договор за наем на жилище": ["landlord", "tenant", "property_address", "term_type", "start_date", "end_date", "monthly_rent", "payment_day", "payment_method", "deposit_amount"],
  "Приемно-предавателен протокол": ["landlord", "tenant", "property_address", "start_date"],
  "Опис на инвентар към договор за наем": ["landlord", "tenant", "property_address"],
  "Разписка за получена сума (наем/депозит)": ["landlord", "tenant", "deposit_amount", "monthly_rent"],
};
