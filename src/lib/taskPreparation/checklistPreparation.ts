/**
 * Кратка подготовка „Какво ми трябва?“ за комплекти без проверена картировка
 * на полета. Не събира лични данни; отговорите са само „Да / Не / Не е
 * преценено“. „Не е преценено“ никога не означава „не е необходимо“.
 */
export type TriAnswer = "yes" | "no" | "unknown";
export type ItemDecision = "needed" | "not_needed" | "not_assessed" | "check_applicability";

export interface ChecklistQuestion { id: string; label: string; }
export interface ChecklistRule {
  docName: string;
  /** Без въпрос: винаги нужен. С `check`: приложимостта се преценява отделно. */
  when?: { question: string; equals: "yes" | "no" };
  check?: string;
}
export interface ChecklistDefinition { kitId: string; title: string; questions: readonly ChecklistQuestion[]; rules: readonly ChecklistRule[]; }

export const CHECKLIST_PREPARATIONS: Readonly<Record<string, ChecklistDefinition>> = {
  "pokupko-prodajba-imot": {
    kitId: "pokupko-prodajba-imot",
    title: "Купувам или продавам имот",
    questions: [
      { id: "preliminary", label: "Ще сключвате ли предварителен договор преди нотариуса?" },
      { id: "earnest", label: "Уговаряте ли капаро?" },
      { id: "representative", label: "Някоя от страните ще действа чрез пълномощник?" },
      { id: "encumbrance", label: "Искате ли да проверите имота за тежести?" },
    ],
    rules: [
      { docName: "Предварителен договор за покупка на имот", when: { question: "preliminary", equals: "yes" } },
      { docName: "Договор за капаро при продажба на имот", when: { question: "earnest", equals: "yes" } },
      { docName: "Подробно пълномощно за продажба на имот", when: { question: "representative", equals: "yes" } },
      { docName: "Заявление за удостоверение за тежести", when: { question: "encumbrance", equals: "yes" } },
      { docName: "Окончателен договор за покупко-продажба на имот (проект на нотариален акт)" },
      { docName: "Приемно-предавателен протокол при продажба на имот" },
      { docName: "Декларация по чл. 264 ДОПК", check: "Приложимостта се уточнява с нотариуса." },
      { docName: "Декларация по ЗМИП (мерки срещу прането на пари)", check: "Приложимостта се уточнява с нотариуса." },
    ],
  },
  "nasledstvo-paket": {
    kitId: "nasledstvo-paket",
    title: "Подготвям завещание или уреждам наследство",
    questions: [
      { id: "will", label: "Подготвяте ли завещание приживе?" },
      { id: "notary_will", label: "Предпочитате ли завещанието да е нотариално?" },
      { id: "opened", label: "Наследството вече е открито?" },
      { id: "renounce", label: "Решили ли сте да се откажете от наследството?" },
    ],
    rules: [
      { docName: "Саморъчно завещание", when: { question: "will", equals: "yes" } },
      { docName: "Нотариално завещание", when: { question: "notary_will", equals: "yes" } },
      { docName: "Молба за удостоверение за наследници", when: { question: "opened", equals: "yes" } },
      { docName: "Декларация за отказ от наследство", when: { question: "renounce", equals: "yes" } },
      { docName: "Декларация по чл. 264 ДОПК", check: "Приложимостта зависи от наследеното имущество." },
    ],
  },
};

export function planChecklist(def: ChecklistDefinition, answers: Readonly<Record<string, TriAnswer | undefined>>) {
  return def.rules.map((rule) => {
    let decision: ItemDecision;
    if (rule.check) decision = "check_applicability";
    else if (!rule.when) decision = "needed";
    else {
      const a = answers[rule.when.question] ?? "unknown";
      decision = a === "unknown" ? "not_assessed" : a === rule.when.equals ? "needed" : "not_needed";
    }
    return { docName: rule.docName, decision, note: rule.check };
  });
}

export const DECISION_LABEL: Record<ItemDecision, string> = {
  needed: "Нужен",
  not_needed: "Не е нужен според отговора",
  not_assessed: "Не е преценено",
  check_applicability: "Проверете приложимостта",
};
