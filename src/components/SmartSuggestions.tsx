/**
 * SmartSuggestions — empty-state карти за бърз старт.
 * Използва curated „first-time" set от 6 шаблона; може да се разшири с user history.
 */
import { Link } from "react-router-dom";
import {
  FileText,
  Lock,
  Home,
  Briefcase,
  Receipt,
  UserCheck,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SuggestionCard {
  title: string;
  subtitle: string;
  to: string;
  icon: LucideIcon;
}

const FIRST_TIME_SET: SuggestionCard[] = [
  {
    title: "Договор за изработка",
    subtitle: "Услуги, проекти, freelance",
    to: "/shablon/dogovor-za-izrabotka",
    icon: FileText,
  },
  {
    title: "NDA — поверителност",
    subtitle: "Защити търговската тайна",
    to: "/shablon/sporazumenie-za-poveritelnost-nda",
    icon: Lock,
  },
  {
    title: "Договор за наем",
    subtitle: "Жилищен или офис",
    to: "/shablon/dogovor-za-naem",
    icon: Home,
  },
  {
    title: "Трудов договор",
    subtitle: "По чл. 67/68 КТ",
    to: "/shablon/trudov-dogovor-chl-67-kt",
    icon: Briefcase,
  },
  {
    title: "Фактура / Разписка",
    subtitle: "Бързо плащане",
    to: "/shablon/razpiska-za-poluchena-suma",
    icon: Receipt,
  },
  {
    title: "Пълномощно",
    subtitle: "Делегиране на права",
    to: "/shablon/palnomoshtno",
    icon: UserCheck,
  },
];

interface SmartSuggestionsProps {
  context?: "assistant" | "catalog" | "home";
  title?: string;
  limit?: number;
  className?: string;
}

const CONTEXT_TITLES: Record<NonNullable<SmartSuggestionsProps["context"]>, string> = {
  assistant: "Започни с готов прецедент",
  catalog: "Популярни шаблони — започни тук",
  home: "Бърз старт",
};

export function SmartSuggestions({
  context = "home",
  title,
  limit = 6,
  className,
}: SmartSuggestionsProps) {
  const cards = FIRST_TIME_SET.slice(0, limit);
  const displayTitle = title ?? CONTEXT_TITLES[context];

  return (
    <section className={cn("w-full", className)} aria-label={displayTitle}>
      {displayTitle && (
        <h3 className="mb-3 text-sm font-semibold text-foreground">{displayTitle}</h3>
      )}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin] sm:grid sm:grid-cols-2 sm:overflow-visible md:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.to}
              to={c.to}
              className="group flex min-w-[200px] flex-shrink-0 items-start gap-2.5 rounded-lg border border-border/60 bg-card/40 p-3 transition-all hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-md sm:min-w-0"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gold/10 text-gold">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-sm font-medium text-foreground group-hover:text-gold">
                    {c.title}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {c.subtitle}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
