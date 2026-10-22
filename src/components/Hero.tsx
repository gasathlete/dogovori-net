import { useEffect, useState, type FormEvent } from "react";
import { isFeatureAvailable } from "@/lib/prelaunch";
import { markFunnelStep, trackFunnelEvent } from "@/lib/funnel";
import { Link, useNavigate } from "react-router-dom";
import { prefetchHandlers } from "@/components/PrefetchLink";
import { Search, ArrowRight, FileUp } from "@/icons";
import { HeroProductRail } from "@/components/products/HeroProductRail";
import { useAuth } from "@/hooks/useAuth";
import { useAudience } from "@/hooks/useAudience";
import { CATALOG_REVIEW_STATUS } from "@/lib/templateReviewStatus";

import { BrandMark } from "@/components/BrandLogo";
import { DocumentWorkflowStage } from "@/components/home/DocumentWorkflowStage";
import { Button } from "@/components/ui/button";
import { TaskChooser } from "@/components/home/TaskChooser";

/** Бързи търсения — водят към реалното търсене в каталога (/catalog?q=…). */
const QUICK_QUERIES = ["наем", "услуги", "пълномощно", "трудов договор"] as const;

/** Задачи към съществуващи канонични страници (пакети и търсене в каталога). */
const TASKS = [
  { title: "Наеми и имоти", text: "Оглед, договор, депозит, връщане на имота.", to: "/paketi/naemi" },
  { title: "Услуги и свободни професии", text: "Оферта, договор, приемане на работата.", to: "/paketi/uslugi-svobodni-profesii" },
  { title: "Работа и служители", text: "Назначаване, отпуск, прекратяване.", to: "/paketi/sluzhiteli-rabotodateli" },
  { title: "Лични документи", text: "Пълномощни, декларации, молби.", to: "/catalog?q=%D0%BF%D1%8A%D0%BB%D0%BD%D0%BE%D0%BC%D0%BE%D1%89%D0%BD%D0%BE" },
] as const;

const catalogHref = (q: string) => (q.trim() ? `/catalog?q=${encodeURIComponent(q.trim())}` : "/catalog");

export function Hero() {
  const { user } = useAuth();
  const { copy } = useAudience();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => { markFunnelStep(1); }, []);

  // Без текста на търсенето в аналитиката — само дали е имало заявка.
  const track = () => trackFunnelEvent("home_primary_cta_clicked", {
    destination: "/catalog",
    authenticated: Boolean(user),
    has_query: Boolean(query.trim()),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    track();
    navigate(catalogHref(query));
  };

  return (
    <section className="brand-hero commerce-hero border-b border-border">
      <div className="container grid w-full gap-8 py-5 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-10 lg:py-14">
        <div className="min-w-0 text-left">
          <p className="flex items-center gap-3 text-sm text-muted-foreground"><BrandMark decorative className="h-10 w-12" /> За хората и бизнеса · Тестов период</p>
          <h1 className="mt-4 max-w-[17ch] font-serif text-[38px] font-bold leading-[1.08] text-foreground sm:text-[52px] lg:text-[64px]">
            {copy.heroHeadline.lead}{" "}<span className="block text-gold">{copy.heroHeadline.accent}{copy.heroHeadline.tail}</span>
          </h1>
          <p className="mt-5 max-w-[48ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            {copy.heroSub}
          </p>

          <form role="search" action="/catalog" method="get" onSubmit={onSubmit} className="mt-4 max-w-xl sm:mt-8">
            <label htmlFor="hero-search" className="mb-2 block text-sm font-semibold text-foreground">
              Какъв документ търсите?
            </label>
            <div className="hero-search-row flex flex-col gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="hero-search"
                  name="q"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={120}
                  autoComplete="off"
                  placeholder="Напр. договор за наем"
                  className="h-14 w-full rounded border border-foreground/40 bg-card pl-11 pr-4 text-base text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <Button
                type="submit"
                data-testid="hero-primary-cta"
                data-href="/catalog"
                className="btn-gold inline-flex min-h-14 items-center justify-center gap-2 px-7 text-base"
              >
                Намерете документ
                <ArrowRight className="h-[18px] w-[18px]" />
              </Button>
            </div>
            <p className="mt-2 hidden flex-wrap items-baseline gap-x-4 text-sm sm:flex">
              <span className="text-muted-foreground">Например:</span>
              {QUICK_QUERIES.map((q) => (
                <Link key={q} to={catalogHref(q)} className="link-ink inline-flex min-h-11 items-center">
                  {q}
                </Link>
              ))}
            </p>
          </form>
          <TaskChooser />

          <div className="mt-4 flex flex-wrap items-center gap-x-6 text-sm">
            <Link to="/build" {...prefetchHandlers("/build")} className="link-ink inline-flex min-h-11 items-center gap-1.5">
              <Search className="h-4 w-4" /> {isFeatureAvailable("document_generation") ? "Изгответе документ" : "Изготвяне · В подготовка"}
            </Link>
            <Link to="/analiz" {...prefetchHandlers("/analiz")} className="link-ink inline-flex min-h-11 items-center gap-1.5">
              <FileUp className="h-4 w-4" /> {isFeatureAvailable("document_review") ? "Проверете документ" : "Проверка · В подготовка"}
            </Link>
            <Button variant="link" type="button" onClick={() => {
              setDemoOpen(true);
              trackFunnelEvent("home_demo_story_opened", { source: "hero" });
              requestAnimationFrame(() => document.getElementById("hero-workflow")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" }));
            }} className="link-ink min-h-11 px-0">Вижте как работи <ArrowRight className="size-4" /></Button>
          </div>
          <nav aria-label="Бързи задачи" className="mt-6 hidden grid-cols-2 gap-x-5 border-t border-border pt-3 sm:grid">
            {TASKS.map((task) => <Link key={task.to} to={task.to} className="flex min-h-11 items-center justify-between gap-2 text-sm text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">{task.title}<ArrowRight className="size-3 shrink-0 text-gold" /></Link>)}
          </nav>
        </div>

        <div className="min-w-0">
          {demoOpen && <Button variant="ghost" className="mb-2 min-h-11 lg:hidden" onClick={() => setDemoOpen(false)}>Скрийте демонстрацията</Button>}
          <DocumentWorkflowStage />
        </div>
      </div>

      <div className="hero-offer-band border-t border-border"><div className="container py-6 sm:py-8"><HeroProductRail /><p className="mt-4 text-xs leading-relaxed text-muted-foreground">{CATALOG_REVIEW_STATUS.notice}</p></div></div>
    </section>
  );
}
