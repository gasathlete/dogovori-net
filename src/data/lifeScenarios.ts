/**
 * Real-life entry scenarios for the homepage — inspired by LawDepot's
 * "What do you want to accomplish?" pattern, but localized to BG sectors.
 *
 * Each scenario maps a plain-language goal to the matching sector or
 * template in our catalog. Icons are lucide-react names (rendered via
 * dynamic lookup in LifeScenarios.tsx).
 */

export interface LifeScenario {
  id: string;
  label: string;
  icon: string; // lucide-react icon name
  href: string;
}

export const LIFE_SCENARIOS: LifeScenario[] = [
  { id: "rent-out",     label: "Отдавам имот под наем",        icon: "Home",           href: "/sektor/real-estate" },
  { id: "buy-sell-re",  label: "Купувам или продавам имот",    icon: "ArrowRightLeft", href: "/sektor/real-estate" },
  { id: "start-biz",    label: "Започвам бизнес (ООД/ЕООД)",   icon: "Store",          href: "/sektor/corporate" },
  { id: "hire",         label: "Наемам служител",              icon: "Briefcase",      href: "/sektor/employment" },
  { id: "freelance",    label: "Възлагам услуга / freelance",  icon: "Code2",          href: "/sektor/services" },
  { id: "vehicle",      label: "Купувам или продавам автомобил", icon: "Car",          href: "/sektor/vehicles" },
  { id: "poa",          label: "Упълномощавам някого",         icon: "FileSignature",  href: "/sektor/power-of-attorney" },
  { id: "nda",          label: "Защитавам идея / NDA",         icon: "ShieldCheck",    href: "/shablon/nda-dogovor-za-konfidentsialnost" },
  { id: "family",       label: "Развод или семейно дело",      icon: "Users",          href: "/sektor/family" },
  { id: "loan",         label: "Заемам или връщам пари",       icon: "HandCoins",      href: "/sektor/finance" },
  { id: "declaration",  label: "Изготвям декларация",          icon: "FileCheck",      href: "/sektor/family" },
  { id: "unsure",       label: "Не съм сигурен какво ми трябва", icon: "Search",       href: "/catalog" },
];
