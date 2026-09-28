import type { DocumentKit, KitItem } from "@/data/documentKits";

export type FeaturedKitId =
  | "naem-zhilishte"
  | "freelancer-paket"
  | "digitalen-proekt"
  | "trudovo-naznachavane"
  | "pokupko-prodajba-imot"
  | "prodajba-mps";

export interface KitLifecycleStage {
  id: string;
  label: string;
  documentNames: readonly string[];
  plannedItem?: string;
}

export const FEATURED_KIT_STAGES: Readonly<Record<FeaturedKitId, readonly KitLifecycleStage[]>> = {
  "naem-zhilishte": [
    { id: "dogovaryane", label: "Договаряне", documentNames: ["Договор за наем на жилище"] },
    { id: "depozit", label: "Депозит и плащане", documentNames: ["Разписка за получена сума (наем/депозит)"] },
    { id: "predavane", label: "Предаване и опис", documentNames: ["Приемно-предавателен протокол", "Опис на инвентар към договор за наем"] },
    { id: "tekushti-deistviya", label: "Текущи действия", documentNames: ["Декларация за регистрация на наем пред НАП"] },
    { id: "priklyuchvane", label: "Предизвестие и връщане", documentNames: ["Предизвестие за прекратяване на наем"], plannedItem: "Протокол за окончателно връщане на имота и ключовете" },
  ],
  "freelancer-paket": [
    { id: "poveritelnost", label: "Поверителност", documentNames: ["NDA – Договор за конфиденциалност"] },
    { id: "vazlagane", label: "Възлагане на услугата", documentNames: ["Граждански договор / Договор за услуги"] },
    { id: "plashtane", label: "Плащане и документиране", documentNames: ["Сметка за изплатени суми", "Декларация за здравно осигуряване (самоосигуряващо се лице)"] },
    { id: "priemane", label: "Приемане и приключване", documentNames: [], plannedItem: "Приемно-предавателен протокол за приета работа" },
  ],
  "digitalen-proekt": [
    { id: "podgotovka", label: "Поверителност и рамка", documentNames: ["NDA – Договор за конфиденциалност", "Master Services Agreement (MSA)"] },
    { id: "obhvat", label: "Обхват и договор", documentNames: ["Statement of Work (SOW)", "Договор за изработка на уебсайт / мобилно приложение"] },
    { id: "promeni", label: "Ревизии и промени", documentNames: ["Change Request форма"] },
    { id: "priemane", label: "Приемане", documentNames: ["Acceptance Protocol (приемане на разработка)"] },
    { id: "predavane", label: "Предаване и приключване", documentNames: [], plannedItem: "Протокол за предаване на достъпи и проектни материали" },
  ],
  "trudovo-naznachavane": [
    { id: "naznachavane", label: "Назначаване и длъжност", documentNames: ["Трудов договор по чл. 67 КТ (безсрочен)", "Длъжностна характеристика"] },
    { id: "registratsiya", label: "Регистрация", documentNames: ["Уведомление по чл. 62, ал. 5 КТ до НАП"] },
    { id: "lichno-dosie", label: "Лично досие и вътрешен ред", documentNames: ["Декларация по ЗЗЛД от служител", "Заповед за работно време / Правилник за вътрешния трудов ред"] },
    { id: "predavane", label: "Предаване на имущество", documentNames: [], plannedItem: "Протокол за приемане на предоставено фирмено оборудване" },
  ],
  "pokupko-prodajba-imot": [
    { id: "proverki", label: "Подготовка и проверки", documentNames: ["Заявление за удостоверение за тежести", "Подробно пълномощно за продажба на имот"] },
    { id: "predvaritelni-usloviya", label: "Предварителни условия и капаро", documentNames: ["Предварителен договор за покупка на имот", "Договор за капаро при продажба на имот"] },
    { id: "deklaratsii", label: "Декларации за сделката", documentNames: ["Декларация по чл. 264 ДОПК", "Декларация по ЗМИП (мерки срещу прането на пари)"] },
    { id: "finalizirane", label: "Подготовка за нотариално финализиране", documentNames: ["Окончателен договор за покупко-продажба на имот (проект на нотариален акт)"] },
    { id: "predavane", label: "Предаване на имота", documentNames: ["Приемно-предавателен протокол при продажба на имот"] },
  ],
  "prodajba-mps": [
    { id: "podgotovka", label: "Подготовка и представителство", documentNames: ["Пълномощно за управление и продажба на МПС"] },
    { id: "dogovor", label: "Договор и декларации", documentNames: ["Договор за покупко-продажба на МПС", "Декларация по чл. 264 ДОПК"] },
    { id: "predavane", label: "Предаване на автомобила", documentNames: ["Приемно-предавателен протокол за МПС"] },
    { id: "sledvashti-deistviya", label: "Следващи действия", documentNames: ["Декларация за продажба на МПС пред КАТ"], plannedItem: "Разписка за получена сума по договор за продажба на МПС" },
  ],
};

export function isFeaturedKitId(id: string): id is FeaturedKitId {
  return Object.prototype.hasOwnProperty.call(FEATURED_KIT_STAGES, id);
}

export function itemsForStage(items: readonly KitItem[], stage: KitLifecycleStage): KitItem[] {
  const byName = new Map(items.map((item) => [item.docName, item]));
  return stage.documentNames.flatMap((name) => {
    const item = byName.get(name);
    return item ? [item] : [];
  });
}

// Shared by the interactive page and static HTML so planned items and order agree.
export function getKitSections(kit: DocumentKit): { stage: KitLifecycleStage; items: KitItem[] }[] {
  if (isFeaturedKitId(kit.id)) {
    return FEATURED_KIT_STAGES[kit.id].map((stage) => ({ stage, items: itemsForStage(kit.items, stage) }));
  }
  return [
    { stage: { id: "osnovni", label: "Основни документи", documentNames: [] }, items: kit.items.filter((item) => item.role === "primary") },
    { stage: { id: "prilozheniya", label: "Приложения", documentNames: [] }, items: kit.items.filter((item) => item.role === "appendix") },
    { stage: { id: "svurzani", label: "Свързани документи", documentNames: [] }, items: kit.items.filter((item) => item.role === "companion") },
  ];
}
