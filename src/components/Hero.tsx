import { useEffect, useState, type FormEvent } from "react";
import { isFeatureAvailable } from "@/lib/prelaunch";
import { markFunnelStep, trackFunnelEvent } from "@/lib/funnel";
import { Link, useNavigate } from "react-router-dom";
import { prefetchHandlers } from "@/components/PrefetchLink";
import { Search, ArrowRight, FileUp } from "@/icons";
import { HeroProductRail } from "@/components/products/HeroProductRail";
import { useAuth } from "@/hooks/useAuth";
import { useAudience } from "@/hooks/useAudience";
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
    <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-b from-primary/[0.06] to-background">
      <div className="container relative grid w-full gap-10 py-10 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14 lg:py-20">
        <div className="text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">Dogovori.net · Тестов период</p>
          <h1 className="mt-3 font-serif text-[32px] font-bold leading-[1.08] text-balance text-foreground sm:text-4xl lg:text-[52px]">
            {copy.heroHeadline.lead}{" "}
            <em className="font-serif italic text-gold">{copy.heroHeadline.accent}</em>
            {copy.heroHeadline.tail}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-foreground/80 sm:text-lg">
            {copy.heroSub}
          </p>

          <form role="search" onSubmit={onSubmit} className="mt-7 max-w-xl">
            <label htmlFor="hero-search" className="mb-2 block text-sm font-semibold text-foreground">
              Какъв документ търсите?
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="hero-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={120}
                  autoComplete="off"
                  placeholder="Напр. договор за наем"
                  className="h-14 w-full rounded-xl border-2 border-border bg-card pl-12 pr-4 text-base text-foreground placeholder:text-muted-foreground focus:border-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
                />
              </div>
              <Link
                to={catalogHref(query)}
                {...prefetchHandlers("/catalog")}
                data-testid="hero-primary-cta"
                onClick={track}
                className="btn-gold btn-press inline-flex min-h-14 items-center justify-center gap-2 rounded-xl px-7 text-base font-bold normal-case tracking-normal shadow-elegant"
              >
                Намерете документ
                <ArrowRight className="h-[18px] w-[18px]" />
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Често търсени:</span>
              {QUICK_QUERIES.map((q) => (
                <Link key={q} to={catalogHref(q)} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3.5 text-foreground/85 transition-colors hover:border-gold hover:text-gold">
                  {q}
                </Link>
              ))}
            </div>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 text-sm text-muted-foreground">
            <Link to="/build" {...prefetchHandlers("/build")} className="inline-flex min-h-11 items-center gap-1.5 hover:text-gold">
              <Search className="h-4 w-4" /> {isFeatureAvailable("document_generation") ? "Изгответе документ" : "Изготвяне · В подготовка"}
            </Link>
            <Link to="/analiz" {...prefetchHandlers("/analiz")} className="inline-flex min-h-11 items-center gap-1.5 hover:text-gold">
              <FileUp className="h-4 w-4" /> {isFeatureAvailable("document_review") ? "Проверете документ" : "Проверка · В подготовка"}
            </Link>
            <AudienceToggle size="sm" />
          </div>
        </div>

        {/* Демонстрационен лист — ясно означен пример, не реален документ. */}
        <figure aria-label="Примерен документ" className="relative mx-auto w-full max-w-md rounded-2xl border border-gold/30 bg-muted p-4 shadow-elegant sm:p-6">
          <figcaption className="mb-3 flex items-center justify-between text-xs font-semibold text-foreground/80">
            <span>Примерен документ · Демонстрация</span>
            <span className="rounded-full border border-gold/50 px-2 py-0.5 text-gold">В преработка</span>
          </figcaption>
          <div className="rounded-lg bg-card p-5 text-card-foreground shadow-sm">
            <p className="text-center font-serif text-lg font-bold">ДОГОВОР ЗА НАЕМ НА ЖИЛИЩЕ</p>
            <p className="mt-1 text-center text-xs text-muted-foreground">гр. София, [дата]</p>
            <dl className="mt-4 space-y-2 text-sm">
              {[["Наемодател", "[име]"], ["Наемател", "[име]"], ["Имот", "[адрес]"], ["Наемна цена", "[сума] € месечно"], ["Депозит", "[сума] €"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-dashed border-border pb-1.5">
                  <dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 rounded-md bg-gold/10 px-3 py-2 text-xs leading-relaxed text-foreground">
              Проверете внимателно преди подписване.
            </p>
          </div>
        </figure>
      </div>

      {/* Задачи — реални канонични адреси. */}
      <div className="container pb-10 lg:pb-14">
        <h2 className="sr-only">Започнете от задачата</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TASKS.map((t) => (
            <li key={t.title}>
              <Link to={t.to} className="group flex h-full min-h-11 flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                <span className="font-semibold text-foreground group-hover:text-gold">{t.title}</span>
                <span className="mt-1 text-sm text-muted-foreground">{t.text}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mx-auto max-w-3xl"><HeroProductRail /></div>
      </div>
    </section>
  );
}
