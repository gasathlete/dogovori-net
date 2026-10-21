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
import { AudienceToggle } from "@/components/funnel/AudienceToggle";

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
    <section className="border-b border-border bg-background">
      <div className="container grid w-full gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:gap-20 lg:py-20">
        <div className="min-w-0 text-left">
          <p className="text-sm text-muted-foreground">Образци и подготовка на документи · Тестов период</p>
          <h1 className="mt-4 max-w-[16ch] font-serif text-[34px] font-bold leading-[1.1] text-foreground sm:text-[44px] lg:text-[56px]">
            {copy.heroHeadline.lead} {copy.heroHeadline.accent}{copy.heroHeadline.tail}
          </h1>
          <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-foreground/80 sm:text-lg">
            {copy.heroSub}
          </p>

          <form role="search" action="/catalog" method="get" onSubmit={onSubmit} className="mt-8 max-w-xl">
            <label htmlFor="hero-search" className="mb-2 block text-sm font-semibold text-foreground">
              Какъв документ търсите?
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
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
              <button
                type="submit"
                data-testid="hero-primary-cta"
                data-href="/catalog"
                className="btn-gold inline-flex min-h-14 items-center justify-center gap-2 px-7 text-base"
              >
                Намерете документ
                <ArrowRight className="h-[18px] w-[18px]" />
              </button>
            </div>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Често търсени:</span>
              {QUICK_QUERIES.map((q) => (
                <Link key={q} to={catalogHref(q)} className="link-ink inline-flex min-h-11 items-center">
                  {q}
                </Link>
              ))}
            </p>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 text-sm">
            <Link to="/build" {...prefetchHandlers("/build")} className="link-ink inline-flex min-h-11 items-center gap-1.5">
              <Search className="h-4 w-4" /> {isFeatureAvailable("document_generation") ? "Изгответе документ" : "Изготвяне · В подготовка"}
            </Link>
            <Link to="/analiz" {...prefetchHandlers("/analiz")} className="link-ink inline-flex min-h-11 items-center gap-1.5">
              <FileUp className="h-4 w-4" /> {isFeatureAvailable("document_review") ? "Проверете документ" : "Проверка · В подготовка"}
            </Link>
            <button
              type="button"
              onClick={() => {
                trackFunnelEvent("home_demo_story_opened", { source: "hero" });
                import("@/components/funnel/StartStoryOverlay").then((m) => m.openStartStory());
              }}
              className="link-ink inline-flex min-h-11 items-center"
            >
              Вижте демонстрацията
            </button>
          </div>
          <div className="mt-2"><AudienceToggle size="sm" /></div>
        </div>

        {/* Указател: реални адреси към пакети и търсене в каталога. */}
        <nav aria-labelledby="hero-index-title" className="min-w-0 lg:border-l lg:border-border lg:pl-10">
          <h2 id="hero-index-title" className="font-serif text-xl font-bold text-foreground">Започнете от задачата</h2>
          <ol className="mt-4 border-t border-foreground/80">
            {TASKS.map((t, i) => (
              <li key={t.title} className="border-b border-border">
                <Link to={t.to} className="group grid min-h-11 grid-cols-[2rem_1fr] gap-x-2 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="font-serif text-sm text-gold" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <span className="block font-semibold text-foreground underline-offset-4 group-hover:underline">{t.title}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{t.text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">{CATALOG_REVIEW_STATUS.badge}.</span> {CATALOG_REVIEW_STATUS.warning}
          </p>
        </nav>
      </div>

      <div className="container pb-12 lg:pb-16"><HeroProductRail /></div>
    </section>
  );
}
