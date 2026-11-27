/**
 * Real-life entry scenarios for the homepage — each maps to a document kit.
 * Click → /komplekti/:kitId. The "unsure" scenario links to the kits index.
 */

export interface LifeScenario {
  id: string;
  label: string;
  icon: string; // lucide-react icon name
  /** Primary kit slug — used to build /komplekti/:kitId. Omit for href-only entries. */
  kitId?: string;
  /** Fallback href when no kit applies (e.g. the "unsure" entry). */
  href?: string;
}

export const LIFE_SCENARIOS: LifeScenario[] = [
  { id: "rent-out",     label: "Отдавам имот под наем",              icon: "Home",           kitId: "naem-zhilishte" },
  { id: "buy-sell-re",  label: "Купувам или продавам имот",          icon: "ArrowRightLeft", kitId: "pokupko-prodajba-imot" },
  { id: "start-biz",    label: "Започвам бизнес (ООД/ЕООД)",         icon: "Store",          kitId: "registratsiya-na-ood" },
  { id: "invest",       label: "Привличам инвеститор",               icon: "TrendingUp",     kitId: "investitsionna-sdelka" },
  { id: "hire",         label: "Наемам служител",                    icon: "Briefcase",      kitId: "trudovo-naznachavane" },
  { id: "terminate",    label: "Прекратявам трудов договор",         icon: "UserMinus",      kitId: "prekratyavane-trudovo" },
  { id: "freelance",    label: "Възлагам услуга / freelance",        icon: "Code2",          kitId: "freelancer-paket" },
  { id: "digital",      label: "Стартирам дигитален проект",         icon: "Laptop",         kitId: "digitalen-proekt" },
  { id: "ecommerce",    label: "Онлайн магазин / SaaS",              icon: "ShoppingCart",   kitId: "saas-eshop-paket" },
  { id: "vehicle",      label: "Купувам или продавам автомобил",     icon: "Car",            kitId: "prodajba-mps" },
  { id: "poa",          label: "Упълномощавам някого",               icon: "FileSignature",  kitId: "pulnomoshchno-paket" },
  { id: "nda",          label: "Защитавам идея / NDA",               icon: "ShieldCheck",    kitId: "nda-ip" },
  { id: "gdpr",         label: "GDPR съответствие",                  icon: "ShieldAlert",    kitId: "gdpr-paket" },
  { id: "family",       label: "Развод или семейно дело",            icon: "Users",          kitId: "razvod-paket" },
  { id: "inheritance",  label: "Наследство и завещание",             icon: "Scroll",         kitId: "nasledstvo-paket" },
  { id: "loan",         label: "Заемам или връщам пари",             icon: "HandCoins",      kitId: "zaem-pari-paket" },
  { id: "collect",      label: "Събирам вземане / спор",             icon: "Gavel",          kitId: "vzemanie-spor" },
  { id: "declaration",  label: "Изготвям декларация",                icon: "FileCheck",      kitId: "deklaratsii-paket" },
  { id: "unsure",       label: "Не съм сигурен какво ми трябва",     icon: "Search",         href: "/komplekti" },
];
