/**
 * Source of truth for plan display data on the public /plans page.
 *
 * Code keys mapping:
 * - `professional` → Stripe lookup_keys `professional_monthly` / `professional_yearly`
 *   (legacy `pro_monthly` / `pro_yearly` are kept only for grandfathered subscribers
 *   and resolve to the same tier).
 * - `entrepreneur` → Stripe lookup_keys `entrepreneur_monthly` / `entrepreneur_yearly`.
 * - `team` → Stripe lookup_key `team_yearly` (monthly removed, yearly only).
 */
export type PlanId = "free" | "professional" | "entrepreneur" | "team";
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
    id: "professional",
    name: "Професионалист",
    tagline: "За самонаети и фрийлансъри",
    monthly: { price: 12.9, suffix: "€/мес" },
    yearly: { price: 129, suffix: "€/год", note: "≈ 10.75 €/мес" },
    features: [
      "50 операции / месец",
      "Неограничен AI Асистент",
      "Пълни двуезични договори (EN/DE/FR)",
      "Неограничени комплекти документи и автоматични корекции",
      "Без воден знак",
      "Loyalty: 5–15% доживотна отстъпка",
      "Стандартна поддръжка",
    ],
  },
  {
    id: "entrepreneur",
    name: "Предприемач",
    tagline: "Най-премиум планът — за активни предприемачи",
    monthly: { price: 19.9, suffix: "€/мес" },
    yearly: { price: 199, suffix: "€/год", note: "≈ 16.60 €/мес" },
    features: [
      "120 операции / месец",
      "Всичко от Професионалист",
      "Приоритетна AI обработка + GPT-5 модел",
      "Премиум поддръжка 24/7",
      "Персонален onboarding",
      "Ранен достъп до нови функции",
    ],
    highlight: true,
    badge: "Най-премиум",
  },
  {
    id: "team",
    name: "Екип",
    tagline: "За фирми с няколко юриста или мениджъри",
    monthly: null,
    yearly: { price: 109, suffix: "€/seat/год", note: "мин. 3 = 327 €/год" },
    features: [
      "Само годишен абонамент",
      "100 операции / място / месец",
      "Споделени документи и шаблони",
      "Audit log на всички действия",
      "Екипно фактуриране",
      "Централизирано управление на достъп",
      "Всичко от Професионалист",
    ],
  },
];

export const COMPARISON_ROWS: Array<{
  label: string;
  free: string;
  professional: string;
  entrepreneur: string;
  team: string;
}> = [
  { label: "Операции / месец", free: "5 + 2/мес", professional: "50", entrepreneur: "120", team: "100 / място" },
  { label: "AI Асистент", free: "5 съобщ./мес", professional: "Неограничен", entrepreneur: "Неограничен + приоритет", team: "Неограничен" },
  { label: "AI модел", free: "Стандартен", professional: "Стандартен", entrepreneur: "GPT-5", team: "Стандартен" },
  { label: "Двуезични договори", free: "Само BG", professional: "Пълни EN/DE/FR", entrepreneur: "Пълни EN/DE/FR", team: "Пълни EN/DE/FR" },
  { label: "Комплекти документи", free: "1", professional: "Неограничени", entrepreneur: "Неограничени", team: "Неограничени" },
  { label: "Воден знак", free: "Да", professional: "Не", entrepreneur: "Не", team: "Не" },
  { label: "Loyalty отстъпка", free: "—", professional: "5–15%", entrepreneur: "5–15%", team: "5–15%" },
  { label: "Персонален onboarding", free: "—", professional: "—", entrepreneur: "Да", team: "Да" },
  { label: "Audit log", free: "—", professional: "—", entrepreneur: "—", team: "Да" },
  { label: "Споделени документи", free: "—", professional: "—", entrepreneur: "—", team: "Да" },
  { label: "Поддръжка", free: "Стандартна", professional: "Стандартна", entrepreneur: "Premium 24/7", team: "Приоритетна" },
];

export const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Какво е „операция"?',
    a: "1 операция = изтегляне на договор, изтегляне на шаблон или качване с анализ (вкл. една вълна автоматични корекции). Същият документ в същата сесия не се таксува повторно.",
  },
  {
    q: "Каква е разликата между Професионалист и Предприемач?",
    a: "Професионалист (12.90 €/мес, 50 операции) покрива всички основни функции — AI Асистент, двуезични договори и комплекти. Предприемач (19.90 €/мес, 120 операции) добавя GPT-5 модел, приоритетна AI обработка, премиум поддръжка 24/7 и персонален onboarding.",
  },
  {
    q: "Мога ли да сменям плана по всяко време?",
    a: "Да. Ъпгрейд (Професионалист → Предприемач) е незабавен с pro-rate; даунгрейд влиза в сила от следващия период. Откажи когато искаш — без неустойки.",
  },
  {
    q: "Включен ли е ДДС в цените?",
    a: "Да, всички показани цени са с ДДС 20%. Получаваш ДДС фактура автоматично след всяко плащане.",
  },
  {
    q: "Каква е разликата между месечно и годишно?",
    a: "Годишно плащане спестява ~17% спрямо месечно — Професионалист 129 €/год (вместо 154.80 €), Предприемач 199 €/год (вместо 238.80 €). С промо код FIRST100 — допълнително 40% намаление на първия годишен период.",
  },
  {
    q: 'Как работи „Екип" с няколко души?',
    a: "Екип е само годишен абонамент: 109 €/място/год, минимум 3 места = 327 €/год. Всеки член получава 100 операции/мес. Един потребител не може да е едновременно индивидуален абонат и член на екип.",
  },
  {
    q: "Какво се случва, ако надхвърля операциите на плана?",
    a: 'Купуваш допълнителен пакет 5 операции за 1.90 € (one-off, без подновяване) или ъпгрейдваш към по-висок план.',
  },
];
