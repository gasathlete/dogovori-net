/**
 * Source of truth for plan display data on the public /plans page.
 * Code keys (`id`) stay aligned with Stripe lookup_keys + `plan === "pro"`
 * checks — only the `name` is user-facing BG copy.
 */
export type PlanId = "free" | "pro" | "team";
export type Billing = "monthly" | "yearly";

export interface PlanData {
  id: PlanId;
  name: string;
  tagline: string;
  monthly: { price: number; suffix: string; note?: string } | null;
  yearly: { price: number; suffix: string; note?: string } | null;
  features: string[];
  highlight?: boolean;
  badge?: string;
}

export const PLANS: PlanData[] = [
  {
    id: "free",
    name: "Безплатен",
    tagline: "За първи стъпки и единични документи",
    monthly: { price: 0, suffix: "€" },
    yearly: { price: 0, suffix: "€" },
    features: [
      "5 операции при регистрация + 2 / месец",
      "AI Асистент — 5 съобщения / месец",
      "1 активен комплект документи",
      "Достъп до пълния каталог шаблони",
      "Воден знак на PDF",
    ],
  },
  {
    id: "pro",
    name: "Предприемач",
    tagline: "За самонаети, фрийлансъри и малък бизнес",
    monthly: { price: 12.9, suffix: "€/мес" },
    yearly: { price: 129, suffix: "€/год", note: "≈ 10.75 €/мес" },
    features: [
      "100 операции / месец",
      "Неограничен AI Асистент",
      "Пълни двуезични договори (EN/DE/FR)",
      "Неограничени комплекти документи",
      "Без воден знак",
      "Loyalty: 5–15% доживотна отстъпка",
      "Приоритетна поддръжка",
    ],
    highlight: true,
    badge: "Най-популярен",
  },
  {
    id: "team",
    name: "Екип",
    tagline: "За фирми с няколко юриста или мениджъри",
    monthly: { price: 10.9, suffix: "€/seat/мес", note: "мин. 3 = 32.70 €/мес" },
    yearly: { price: 109, suffix: "€/seat/год", note: "мин. 3 = 327 €/год" },
    features: [
      "100 операции / seat / месец",
      "Споделени документи и шаблони",
      "Audit log на всички действия",
      "Екипно фактуриране",
      "Централизирано управление на достъп",
      "Всичко от Предприемач",
    ],
  },
];

export const COMPARISON_ROWS: Array<{
  label: string;
  free: string;
  pro: string;
  team: string;
}> = [
  { label: "Операции / месец", free: "5 + 2/мес", pro: "100", team: "100 / seat" },
  { label: "AI Асистент", free: "5 съобщ./мес", pro: "Неограничен", team: "Неограничен" },
  { label: "Двуезични договори", free: "Само BG", pro: "Пълни EN/DE/FR", team: "Пълни EN/DE/FR" },
  { label: "Комплекти документи", free: "1", pro: "Неограничени", team: "Неограничени" },
  { label: "Воден знак", free: "Да", pro: "Не", team: "Не" },
  { label: "Loyalty отстъпка", free: "—", pro: "5–15%", team: "5–15%" },
  { label: "Audit log", free: "—", pro: "—", team: "Да" },
  { label: "Споделени документи", free: "—", pro: "—", team: "Да" },
  { label: "Поддръжка", free: "Стандартна", pro: "Приоритетна", team: "Приоритетна" },
];

export const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Какво е „операция"?",
    a: "1 операция = изтегляне на договор, изтегляне на шаблон или качване с анализ (вкл. една вълна автоматични корекции). Същият документ в същата сесия не се таксува повторно.",
  },
  {
    q: "Мога ли да сменям плана по всяко време?",
    a: "Да. Ъпгрейд е незабавен с pro-rate; даунгрейд влиза в сила от следващия период. Откажи когато искаш — без неустойки.",
  },
  {
    q: "Включен ли е ДДС в цените?",
    a: "Да, всички показани цени са с ДДС 20%. Получаваш ДДС фактура автоматично след всяко плащане.",
  },
  {
    q: "Каква е разликата между месечно и годишно?",
    a: "Годишно плащане спестява ~17% спрямо месечно. Pro 129 €/год вместо 154.80 €/год. С промо код FIRST100 — допълнително 40% намаление на първия годишен период.",
  },
  {
    q: "Как работи „Екип" с няколко души?",
    a: "Минимум 3 seats (≈ 32.70 €/мес). Всеки член получава 100 операции/мес. Споделяте документи, шаблони и виждате audit log на всичко.",
  },
  {
    q: "Какво се случва, ако надхвърля 100 операции?",
    a: "Купуваш допълнителен пакет 5 операции за 2.90 € (one-off, без подновяване) или ъпгрейдваш към Екип.",
  },
];
