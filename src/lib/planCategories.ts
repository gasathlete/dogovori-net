import { Brain, FileText, Shield, Zap, Users, LifeBuoy, Sparkles, type LucideIcon } from "@/icons";
import type { PlanId } from "@/hooks/usePlans";

export type CategoryId =
  | "intelligence"
  | "documents"
  | "security"
  | "automation"
  | "team"
  | "support"
  | "other";

export interface CategoryDef {
  id: CategoryId;
  label: string;
  icon: LucideIcon;
  keywords: RegExp;
}

export const PLAN_CATEGORIES: CategoryDef[] = [
  {
    id: "intelligence",
    label: "Интелигентност",
    icon: Brain,
    keywords:
      /(AI|асистент|gpt|преговор|приоритетна\s+AI|модел|интелиген|двуезичн|EN\/|корекци)/i,
  },
  {
    id: "documents",
    label: "Документи и шаблони",
    icon: FileText,
    keywords:
      /(операци|шаблон|каталог|комплект|документ|воден\s+знак|PDF|без\s+воден)/i,
  },
  {
    id: "security",
    label: "Сигурност и достъп",
    icon: Shield,
    keywords:
      /(сигурн|парола|audit|одит|достъп|управлен|GDPR|криптир|SSO)/i,
  },
  {
    id: "automation",
    label: "Автоматизации",
    icon: Zap,
    keywords:
      /(автомат|напомнян|ZIP|архив|масов|bulk|onboarding|ранен\s+достъп|нови\s+функци)/i,
  },
  {
    id: "team",
    label: "Екипна работа",
    icon: Users,
    keywords:
      /(екип|място|seat|сподел|фактур|централизирано)/i,
  },
  {
    id: "support",
    label: "Поддръжка",
    icon: LifeBuoy,
    keywords:
      /(поддръжк|premium|24\/7|loyalty|отстъпк|годиш(ен|на)\s+абон)/i,
  },
];

const OTHER: CategoryDef = {
  id: "other",
  label: "Други възможности",
  icon: Sparkles,
  keywords: /.*/,
};

export interface CategoryGroup {
  id: CategoryId;
  label: string;
  icon: LucideIcon;
  items: string[];
  highlight: string | null;
}

/** Pick a short, punchy highlight from a feature string. */
function pickHighlight(items: string[], catId: CategoryId): string | null {
  if (!items.length) return null;
  const joined = items.join(" • ");
  // Look for strong tokens first
  const strong = [
    /GPT-5/i,
    /Premium\s*24\/7/i,
    /приоритетн[аи][^•]*/i,
    /\d+\s*операци[^•]*/i,
    /audit\s*log/i,
    /парола/i,
    /(масов[оа]|bulk|ZIP)[^•]*/i,
    /напомнян[^•]*/i,
    /сподел[^•]*/i,
    /двуезичн[^•]*/i,
    /без\s+воден\s+знак/i,
    /неограничен[^•]*/i,
    /(\d+\s*%[^•]*)/i,
  ];
  for (const re of strong) {
    const m = joined.match(re);
    if (m) {
      const v = m[0].trim().replace(/\s+/g, " ");
      return v.length > 28 ? v.slice(0, 26) + "…" : v;
    }
  }
  // Fallback: first item, trimmed
  const first = items[0].split(/[—·•]/)[0].trim();
  return first.length > 28 ? first.slice(0, 26) + "…" : first;
}

export function categorize(features: string[]): CategoryGroup[] {
  const buckets = new Map<CategoryId, string[]>();
  for (const cat of [...PLAN_CATEGORIES, OTHER]) buckets.set(cat.id, []);

  for (const f of features) {
    let placed = false;
    for (const cat of PLAN_CATEGORIES) {
      if (cat.keywords.test(f)) {
        buckets.get(cat.id)!.push(f);
        placed = true;
        break;
      }
    }
    if (!placed) buckets.get("other")!.push(f);
  }

  const groups: CategoryGroup[] = [];
  for (const cat of PLAN_CATEGORIES) {
    const items = buckets.get(cat.id)!;
    groups.push({
      id: cat.id,
      label: cat.label,
      icon: cat.icon,
      items,
      highlight: pickHighlight(items, cat.id),
    });
  }
  const otherItems = buckets.get("other")!;
  if (otherItems.length) {
    groups.push({
      id: "other",
      label: OTHER.label,
      icon: OTHER.icon,
      items: otherItems,
      highlight: pickHighlight(otherItems, "other"),
    });
  }
  return groups;
}

export const PLAN_HERO_BENEFIT: Record<PlanId, { title: string; subtitle: string }> = {
  free: {
    title: "Започни без карта",
    subtitle: FREE_OFFER_RULE,
  },
  professional: {
    title: "Масово сваляне и защитени линкове",
    subtitle: "Сваляй пакети документи и споделяй с парола",
  },
  entrepreneur: {
    title: "Всичко от Професионалист + AI преговорна стратегия с GPT-5",
    subtitle: "Премиум модел, приоритетна обработка и onboarding",
  },
  team: {
    title: "Общо работно пространство за фирмата",
    subtitle: "Споделени документи, роли и одит на действия",
  },
};
