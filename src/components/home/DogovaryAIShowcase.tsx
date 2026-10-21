/**
 * DogovaryAIShowcase — премиум секция за DogovaryAI на началната страница.
 * Показва реалистична извадка от интерфейса на чата с един сложен правен
 * въпрос и структурирания отговор на асистента. Статичен, лек (без AI заявки).
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight } from "@/icons";
import { trackMetric } from "@/lib/metrics";

const SAMPLE_QUESTION =
  "Наемателят на офиса ми не плаща три месеца. Мога ли да прекратя договора и да задържа депозита?";

const SAMPLE_ANSWER: { heading: string; body: string }[] = [
  {
    heading: "Какво означава",
    body: "Забава от три месеца може да Ви даде основание да прекратите договора — зависи от клаузите и от обстоятелствата по случая.",
  },
  {
    heading: "Какво да направите",
    body: "Първо проверете клаузите за прекратяване, депозита и реда за уведомяване. След това изпратете писмена покана със срок за плащане.",
  },
  {
    heading: "Какъв документ Ви трябва",
    body: "Според случая може да са нужни покана за плащане с предизвестие и заявление за заповед за изпълнение за остатъка.",
  },
];

const CITATIONS = ["ЗЗД, чл. 87", "ЗЗД, чл. 103", "ГПК, чл. 410"];

export function DogovaryAIShowcase() {
  return (
    <section aria-labelledby="dogovaryai-showcase-title" className="border-b border-border">
      <div className="container grid gap-10 py-14 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <h2 id="dogovaryai-showcase-title" className="font-serif text-3xl font-bold leading-tight sm:text-4xl">
            DogovaryAI
          </h2>
          <p className="mt-3 max-w-[46ch] text-base leading-relaxed text-muted-foreground">
            Асистент с изкуствен интелект. Питате на нормален език и получавате какво означава, какво да направите и
            какъв документ Ви трябва, с посочени разпоредби. Не е правен съвет.
          </p>
          <p className="mt-3 text-sm text-foreground/80">3 безплатни запитвания без регистрация.</p>
          <div className="mt-4 flex flex-wrap gap-x-6">
            <Link to="/assistant" onClick={() => trackMetric("home_dogovaryai_open")} className="link-ink inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
              Попитайте DogovaryAI <ArrowRight className="size-4" />
            </Link>
            <Link to="/plans" onClick={() => trackMetric("home_dogovaryai_plans")} className="link-ink inline-flex min-h-11 items-center text-sm">
              Вижте плановете
            </Link>
          </div>
        </div>

        <figure className="border-l-2 border-gold pl-5 sm:pl-8">
          <figcaption className="text-sm text-muted-foreground">Примерен разговор</figcaption>
          <blockquote className="mt-3 font-serif text-lg leading-relaxed text-foreground sm:text-xl">„{SAMPLE_QUESTION}“</blockquote>
          <dl className="mt-6 space-y-4">
            {SAMPLE_ANSWER.map((p) => (
              <div key={p.heading}>
                <dt className="text-sm font-semibold text-foreground">{p.heading}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.body}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-sm text-muted-foreground">Източници: {CITATIONS.join("; ")}</p>
        </figure>
      </div>
    </section>
  );
}
