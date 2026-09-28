export type SectorPackageId =
  | "package_rentals"
  | "package_services"
  | "package_digital_agencies"
  | "package_employment";

export interface SectorPackageDocument {
  stage: string;
  title: string;
  docName?: string;
  status: "browseable" | "planned";
  note?: string;
}

export interface SectorPackage {
  id: SectorPackageId;
  slug: string;
  title: string;
  audience: string;
  outcome: string;
  icon: "Home" | "Briefcase" | "Laptop" | "Users";
  image: "rentals" | "services" | "digital" | "employment";
  relatedKitId: string;
  documents: readonly SectorPackageDocument[];
}

export const SECTOR_PACKAGES: readonly SectorPackage[] = [
  {
    id: "package_rentals",
    slug: "naemi",
    title: "Наеми",
    audience: "За наемодатели, наематели и фирми, които управляват имоти.",
    outcome: "Подрежда документите от договарянето на условията до връщането на имота и окончателното уреждане.",
    icon: "Home",
    image: "rentals",
    relatedKitId: "naem-zhilishte",
    documents: [
      { stage: "01 · Условия", title: "Уговаряте основните условия", docName: "Протокол за оглед на имот под наем", status: "browseable" },
      { stage: "02 · Договор и депозит", title: "Оформяте наема и плащането", docName: "Договор за наем на жилище", status: "browseable" },
      { stage: "02 · Договор и депозит", title: "Документирате наема или депозита", docName: "Разписка за получена сума (наем/депозит)", status: "browseable" },
      { stage: "03 · Предаване", title: "Описвате състоянието и имуществото", docName: "Приемно-предавателен протокол", status: "browseable" },
      { stage: "03 · Предаване", title: "Приложение с наличното имущество", docName: "Опис на инвентар към договор за наем", status: "browseable" },
      { stage: "04 · Промяна", title: "Подновявате срока при съгласие", docName: "Анекс за подновяване на наем", status: "browseable" },
      { stage: "05 · Приключване", title: "Давате предизвестие при приложимите условия", docName: "Предизвестие за прекратяване на наем", status: "browseable" },
      { stage: "05 · Приключване", title: "Финален протокол за връщане и разчети", status: "planned", note: "Планиран документ; съдържанието още не е публикувано." },
    ],
  },
  {
    id: "package_services",
    slug: "uslugi-svobodni-profesii",
    title: "Услуги и свободни професии",
    audience: "За консултанти, специалисти на свободна практика и възложители.",
    outcome: "Следва работата от обхвата и поверителността през етапите и приемането до плащането и приключването.",
    icon: "Briefcase",
    image: "services",
    relatedKitId: "freelancer-paket",
    documents: [
      { stage: "01 · Обхват", title: "Описвате услугата и очаквания резултат", docName: "Приложение към договор за услуги – Обхват и детайлно описание на услугите", status: "browseable" },
      { stage: "02 · Поверителност", title: "Уреждате поверителната информация", docName: "NDA – Договор за конфиденциалност", status: "browseable" },
      { stage: "02 · Договор", title: "Уреждате изпълнението и плащането", docName: "Граждански договор / Договор за услуги", status: "browseable" },
      { stage: "03 · Промени", title: "Удължавате срока при договорена промяна", docName: "Анекс към договор за услуга за удължаване на срока на действие", status: "browseable" },
      { stage: "04 · Приемане", title: "Приемате извършената работа", status: "planned", note: "Планиран универсален протокол; конкретните права върху резултата зависят от услугата." },
      { stage: "05 · Плащане", title: "Документирате изплатена сума", docName: "Сметка за изплатени суми", status: "browseable" },
      { stage: "05 · Приключване", title: "Финално потвърждение за приключване", status: "planned", note: "Планиран документ; съдържанието още не е публикувано." },
    ],
  },
  {
    id: "package_digital_agencies",
    slug: "ueb-digitalni-agentsii",
    title: "Уеб и дигитални агенции",
    audience: "За уеб студиа, дигитални агенции и техните бизнес клиенти.",
    outcome: "Организира офертата, обхвата, правата, ревизиите, приемането и последващата поддръжка на проект.",
    icon: "Laptop",
    image: "digital",
    relatedKitId: "digitalen-proekt",
    documents: [
      { stage: "01 · Задание", title: "Фиксирате обхвата и етапите", docName: "Statement of Work (SOW)", status: "browseable" },
      { stage: "02 · Договор и права", title: "Уреждате изработката на уебсайт или приложение", docName: "Договор за изработка на уебсайт / мобилно приложение", status: "browseable" },
      { stage: "02 · Поверителност", title: "Защитавате поверителната информация", docName: "NDA – Договор за конфиденциалност", status: "browseable" },
      { stage: "03 · Ревизии", title: "Описвате промяна извън първоначалния обхват", docName: "Change Request форма", status: "browseable" },
      { stage: "04 · Приемане", title: "Приемате разработката", docName: "Acceptance Protocol (приемане на разработка)", status: "browseable" },
      { stage: "05 · Поддръжка", title: "Уреждате нива на поддръжка", docName: "Договор за поддръжка на софтуер/хардуер (SLA)", status: "browseable" },
      { stage: "05 · Приключване", title: "Предаване на достъпи и проектни материали", status: "planned", note: "Планиран документ; съдържанието още не е публикувано." },
    ],
  },
  {
    id: "package_employment",
    slug: "sluzhiteli-rabotodateli",
    title: "Служители и работодатели",
    audience: "За работодатели и екипи, които поддържат трудови документи през целия период на заетост.",
    outcome: "Подрежда назначаването, кадровите документи, промените и предаването при подходящо основание за прекратяване.",
    icon: "Users",
    image: "employment",
    relatedKitId: "trudovo-naznachavane",
    documents: [
      { stage: "01 · Назначаване", title: "Оформяте безсрочно назначаване", docName: "Трудов договор по чл. 67 КТ (безсрочен)", status: "browseable" },
      { stage: "01 · Длъжност", title: "Описвате ролята и отговорностите", docName: "Длъжностна характеристика", status: "browseable" },
      { stage: "02 · Кадрови документи", title: "Уреждате поверителността", docName: "NDA – Договор за конфиденциалност", status: "browseable" },
      { stage: "03 · Промени", title: "Променяте длъжността по взаимно съгласие", docName: "Допълнително споразумение за промяна на длъжност по трудов договор", status: "browseable" },
      { stage: "03 · Отпуск", title: "Документирате искане за отпуск", docName: "Молба/Заявление за отпуск", status: "browseable" },
      { stage: "04 · Приключване", title: "Избирате документ според конкретното законово основание", status: "planned", note: "Няма универсален документ за прекратяване. Необходим е специален правен преглед на основанието." },
      { stage: "04 · Предаване", title: "Предаване на имущество, достъпи и текуща работа", status: "planned", note: "Планиран документ; съдържанието още не е публикувано." },
    ],
  },
] as const;

export function getSectorPackage(slug: string | undefined): SectorPackage | undefined {
  return SECTOR_PACKAGES.find((item) => item.slug === slug);
}

export function getSectorPackageAvailability(item: SectorPackage, canonicalNames: ReadonlySet<string>) {
  const available = item.documents.filter((document) =>
    document.status === "browseable" && Boolean(document.docName) && canonicalNames.has(document.docName),
  ).length;
  return { available, planned: item.documents.length - available };
}
/**
 * Лек брояч без каталога — за началната страница. Съвпадението с
 * getSectorPackageAvailability срещу пълния каталог се проверява в тестовете.
 */
export function getDeclaredSectorPackageAvailability(item: SectorPackage) {
  const available = item.documents.filter((document) => document.status === "browseable" && Boolean(document.docName)).length;
  return { available, planned: item.documents.length - available };
}
