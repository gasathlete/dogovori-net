/**
 * Catalog of supported linked-document kinds that can be spawned from a
 * parent contract inside the split-view workspace.
 */

import type { LucideIcon } from "lucide-react";
import {
  FileText,
  ClipboardList,
  FilePlus2,
  ScrollText,
  Stamp,
  Bell,
} from "lucide-react";

export type LinkedDocKind =
  | "appendix"
  | "annex"
  | "handover_protocol"
  | "declaration"
  | "power_of_attorney"
  | "notice";

export interface LinkedDocSpec {
  kind: LinkedDocKind;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  /** Short instruction added to the AI prompt for this kind. */
  systemAddendum: string;
}

export const LINKED_DOC_CATALOG: Record<LinkedDocKind, LinkedDocSpec> = {
  appendix: {
    kind: "appendix",
    label: "Приложение към договора",
    shortLabel: "Приложение",
    description:
      "Опис / спецификация, която е неразделна част от основния договор — обект, количества, цени, състояние.",
    icon: ClipboardList,
    systemAddendum:
      "Изготви ПРИЛОЖЕНИЕ към основния договор. Формат: заглавие „ПРИЛОЖЕНИЕ №[N] към Договор [дата/номер]", кратък встъпителен параграф със референция към конкретния член от основния договор, след което таблично изброяване (№, описание, количество, ед. цена, стойност, забележка) или структуриран опис според контекста. Завърши с място за подпис на двете страни и дата. НЕ повтаряй клаузи от основния договор.",
  },
  annex: {
    kind: "annex",
    label: "Анекс към договора",
    shortLabel: "Анекс",
    description:
      "Изменение или допълнение на конкретни клаузи от основния договор.",
    icon: FilePlus2,
    systemAddendum:
      "Изготви АНЕКС към основния договор. Задължително цитирай точно кой член/алинея се изменя, стар текст → нов текст. Структура: преамбюл със страните и препратка към основния договор, § 1. Изменения (списък), § 2. Заключителни, място за подписи и дата. Всички останали клаузи остават непроменени — заяви го изрично.",
  },
  handover_protocol: {
    kind: "handover_protocol",
    label: "Приемо-предавателен протокол",
    shortLabel: "ППР",
    description:
      "Фиксира предаването на обекта/имуществото — състояние, показания, ключове, дата.",
    icon: FileText,
    systemAddendum:
      "Изготви ПРИЕМО-ПРЕДАВАТЕЛЕН ПРОТОКОЛ. Структура: заглавие, дата и място, страни (предаващ / приемащ), препратка към основния договор, описание на предавания обект, състояние към момента на предаване, показания на измервателни уреди (ако е приложимо), предадени ключове/документи, забележки, подписи на двете страни.",
  },
  declaration: {
    kind: "declaration",
    label: "Декларация",
    shortLabel: "Декларация",
    description:
      "Едностранна декларация свързана с изпълнението на договора (напр. за съгласие, за истинност, за липса на задължения).",
    icon: ScrollText,
    systemAddendum:
      "Изготви ДЕКЛАРАЦИЯ — едностранен документ. Структура: „Долуподписаният/ата [име, ЕГН, адрес]", декларативна част („ДЕКЛАРИРАМ, ЧЕ:") с ясно формулирано съдържание според контекста от основния договор, наказателна отговорност по чл. 313 НК ако е приложимо, дата и подпис. НЕ прави двустранна структура.",
  },
  power_of_attorney: {
    kind: "power_of_attorney",
    label: "Пълномощно",
    shortLabel: "Пълномощно",
    description:
      "Овластяване на трето лице да представлява страна по договора.",
    icon: Stamp,
    systemAddendum:
      "Изготви ПЪЛНОМОЩНО. Структура: упълномощител (пълни данни), упълномощен (пълни данни), обхват на представителната власт (конкретни действия — не общо), срок на валидност, право/забрана на преупълномощаване, дата и място, подпис на упълномощителя. Ако представителството касае разпоредителни сделки — посочи че се изисква нотариална заверка.",
  },
  notice: {
    kind: "notice",
    label: "Нотариална покана / уведомление",
    shortLabel: "Уведомление",
    description:
      "Официално писмено уведомление до другата страна (за забавяне, за прекратяване, за неизпълнение).",
    icon: Bell,
    systemAddendum:
      "Изготви УВЕДОМЛЕНИЕ / НОТАРИАЛНА ПОКАНА. Структура: изпращач, получател, референция към основния договор, ясно формулирано изискване или уведомление, срок за отговор/изпълнение, последици при неспазване, дата и подпис. Тонът е официален, но неагресивен.",
  },
};

export const LINKED_DOC_LIST: LinkedDocSpec[] =
  Object.values(LINKED_DOC_CATALOG);

export function getLinkedDocSpec(kind: string): LinkedDocSpec | null {
  return (LINKED_DOC_CATALOG as Record<string, LinkedDocSpec>)[kind] ?? null;
}
