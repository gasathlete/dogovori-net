/**
 * Материали към AI Ревизора: статии, кратки примери и често задавани въпроси.
 *
 * Целта е посетителят да види как изглежда резултатът и да се регистрира
 * безплатно. Нищо тук не обещава правен съвет или пълнота.
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, BookOpen, HelpCircle, ShieldCheck } from "@/icons";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  REVIEWER_ARTICLES,
  REVIEWER_EXAMPLES,
  REVIEWER_FAQ,
} from "@/data/reviewerHub";
import { trackMetric } from "@/lib/metrics";

export function ReviewerContentHub({ className }: { className?: string }) {
  return (
    <section
      className={`container ${className ?? "mt-14"}`}
      aria-labelledby="reviewer-hub"
      data-testid="reviewer-content-hub"
    >
      <div className="mx-auto max-w-3xl text-center">
        <h2
          id="reviewer-hub"
          className="font-serif text-2xl font-bold tracking-tight sm:text-3xl"
        >
          Преди да подпишете: примери, статии и отговори
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Вижте как изглежда една находка, прочетете какво пише законът за
          конкретния вид договор и създайте безплатен профил, за да запазите
          резултата.
        </p>
      </div>

      {/* Кратки примери */}
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {REVIEWER_EXAMPLES.map((ex) => (
          <article
            key={ex.clause}
            className="flex flex-col rounded-2xl border border-border/60 bg-card/40 p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {ex.documentType}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ${
                  ex.severity === "high"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                }`}
              >
                {ex.severity === "high" ? "Висока тежест" : "Средна тежест"}
              </span>
            </div>
            <p className="mt-3 border-l-2 border-gold/50 pl-3 text-sm italic leading-relaxed text-foreground/90">
              {ex.clause}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {ex.finding}
            </p>
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
              <span>{ex.nextStep}</span>
            </p>
          </article>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Примерите са демонстрация на формата на резултата, а не проверка на Ваш документ.
      </p>

      {/* Статии */}
      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 font-serif text-xl font-bold tracking-tight">
            <BookOpen className="h-4 w-4 text-gold" aria-hidden />
            Статии за договори
          </h3>
          <ul className="mt-4 space-y-2">
            {REVIEWER_ARTICLES.map((a) => (
              <li key={a.slug}>
                <Link
                  to={`/blog/${a.slug}`}
                  onClick={() =>
                    trackMetric("reviewer_hub_article_click", { slug: a.slug })
                  }
                  className="block min-h-11 rounded-xl border border-border/60 bg-card/30 px-4 py-3 transition-colors hover:border-gold/40 hover:bg-card/60"
                >
                  <span className="block text-sm font-semibold text-foreground">
                    {a.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {a.note}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to="/blog"
            className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-gold hover:underline"
          >
            Всички статии <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        {/* Често задавани въпроси */}
        <div>
          <h3 className="flex items-center gap-2 font-serif text-xl font-bold tracking-tight">
            <HelpCircle className="h-4 w-4 text-gold" aria-hidden />
            Често задавани въпроси
          </h3>
          <Accordion type="single" collapsible className="mt-4 space-y-2">
            {REVIEWER_FAQ.map((item, i) => (
              <AccordionItem
                key={item.q}
                value={`rq-${i}`}
                className="rounded-xl border border-border/60 bg-card/30 px-4"
              >
                <AccordionTrigger className="min-h-11 text-left text-sm font-semibold hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>

      {/* Регистрация */}
      <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-gold/30 bg-gold/5 p-6 text-center">
        <p className="font-serif text-lg font-bold">
          Създайте безплатен профил и запазете резултата
        </p>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Безплатният профил пази качените документи, намерените клаузи и
          историята на проверките на едно място.
        </p>
        <Button
          asChild
          className="min-h-11 bg-gradient-gold text-navy hover:shadow-gold"
          onClick={() => trackMetric("reviewer_hub_signup_click")}
        >
          <Link to="/auth?tab=signup">Безплатна регистрация</Link>
        </Button>
      </div>
    </section>
  );
}

export default ReviewerContentHub;
