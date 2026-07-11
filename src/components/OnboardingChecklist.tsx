import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Circle, ChevronRight, X, Sparkles } from "@/icons";
import { Button } from "@/components/ui/button";

export interface OnboardingStats {
  createdDocs: number;
  uploadedCount: number;
  contactsCount: number;
  foldersCount: number;
  isPro: boolean;
}

interface Step {
  id: string;
  title: string;
  desc: string;
  href: string;
  done: boolean;
  cta: string;
}

const STORAGE_KEY = "dgv:onboarding:dismissed:v1";

export function OnboardingChecklist({ stats }: { stats: OnboardingStats }) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  const steps: Step[] = useMemo(
    () => [
      {
        id: "first-doc",
        title: "Създайте първи документ",
        desc: "Изберете шаблон от каталога и попълнете параметрите.",
        href: "/catalog",
        cta: "Към каталога",
        done: stats.createdDocs > 0,
      },
      {
        id: "first-upload",
        title: "Качете договор за анализ",
        desc: "Сканирайте рискове и получете автоматични корекции.",
        href: "/account?tab=documents#uploaded",
        cta: "Качи договор",
        done: stats.uploadedCount > 0,
      },
      {
        id: "first-contact",
        title: "Добавете първи контрагент",
        desc: "Запазете контакт за автоматично попълване на бъдещи документи.",
        href: "/account?tab=contacts",
        cta: "Контакти",
        done: stats.contactsCount > 0,
      },
      {
        id: "first-folder",
        title: "Организирайте с папка",
        desc: "Групирайте свързани документи за бърз достъп.",
        href: "/account?tab=folders",
        cta: "Папки",
        done: stats.foldersCount > 0,
      },
      {
        id: "upgrade",
        title: "Отключете AI стратегията",
        desc: "Преминете към Предприемач за GPT-5 и преговорни тактики.",
        href: "/plans",
        cta: "Виж плановете",
        done: stats.isPro,
      },
    ],
    [stats],
  );

  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  const pct = Math.round((completed / total) * 100);
  const allDone = completed === total;

  useEffect(() => {
    if (allDone) {
      // Auto-dismiss once everything is complete; stays hidden afterwards.
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  }, [allDone]);

  if (dismissed || allDone) return null;

  const handleDismiss = () => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="md:col-span-3 relative overflow-hidden rounded-2xl border border-brand/30 bg-gradient-card p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-brand/15 blur-3xl" />
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Скрий контролния списък"
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="relative mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
            <Sparkles className="h-3 w-3" /> Първи стъпки
          </div>
          <h3 className="font-serif text-base font-bold sm:text-lg">
            Активирайте профила си за 5 бързи стъпки
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Завършете списъка, за да усетите пълната мощ на DogovaryAI.
          </p>
        </div>
        <div className="text-right">
          <div className="font-serif text-2xl font-bold text-brand">{completed}/{total}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">завършени</div>
        </div>
      </div>

      <div className="relative mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
        <div
          className="h-full rounded-full bg-gradient-brand transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="relative space-y-2">
        {steps.map((s) => (
          <li
            key={s.id}
            className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-all ${
              s.done
                ? "border-brand/30 bg-brand/5"
                : "border-border/60 bg-card/40 hover:border-brand/40"
            }`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  s.done ? "bg-brand/20 text-brand" : "bg-muted/40 text-muted-foreground"
                }`}
              >
                {s.done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
              </span>
              <div className="min-w-0">
                <div className={`text-sm font-medium ${s.done ? "line-through text-muted-foreground" : ""}`}>
                  {s.title}
                </div>
                <div className="text-[11px] leading-snug text-muted-foreground">{s.desc}</div>
              </div>
            </div>
            {!s.done && (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-8 shrink-0 border-brand/40 text-xs text-brand hover:bg-brand/10"
              >
                <Link to={s.href}>
                  {s.cta} <ChevronRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
