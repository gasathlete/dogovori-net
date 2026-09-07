/**
 * DogovaryAIShowcase — премиум секция за DogovaryAI на началната страница.
 * Показва реалистична извадка от интерфейса на чата с един сложен правен
 * въпрос и структурирания отговор на асистента. Статичен, лек (без AI заявки).
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Sparkles, ArrowRight, ShieldCheck, Scale, Send } from "@/icons";
import { trackMetric } from "@/lib/metrics";

const dogovaiIcon = "/dogovai-favicon.png";

const SAMPLE_QUESTION =
  "Наемателят на офиса ми не плаща от 3 месеца, в договора няма клауза за неустойка, а има и депозит от една наемна вноска. Мога ли да прекратя едностранно, да задържа депозита и да събера дължимото по бърз ред?";

const SAMPLE_ANSWER: { heading: string; body: string }[] = [
  {
    heading: "1. Основание за прекратяване",
    body: "Забавата от 3 месеца е съществено неизпълнение. При двустранен договор може да развалите с писмено предизвестие и срок за изпълнение (чл. 87, ал. 1 ЗЗД). Ако договорът съдържа клауза за автоматично разваляне при неплащане, срок за изпълнение не е нужен.",
  },
  {
    heading: "2. Депозитът",
    body: "Депозитът обезпечава вреди и неплатен наем — може да го прихванете срещу дължимото (чл. 103–104 ЗЗД), но с изрично писмено изявление за прихващане. Задържане „по презумпция“, без изявление, е рисково при спор.",
  },
  {
    heading: "3. Бърз ред за събиране",
    body: "Липсата на неустойка не блокира вземането: дължите се наемът плюс законна лихва за забава (чл. 86 ЗЗД). При писмен договор може заявление за заповед за изпълнение по чл. 410 ГПК, а при нотариална заверка на подписите — по чл. 417 ГПК с незабавно изпълнение.",
  },
  {
    heading: "4. Какво да направите днес",
    body: "Нотариална покана с 7-дневен срок → изявление за прихващане на депозита → заявление по чл. 410 ГПК за остатъка. Подготвям и трите документа веднага.",
  },
];

const CITATIONS = ["ЗЗД, чл. 87", "ЗЗД, чл. 103", "ЗЗД, чл. 86", "ГПК, чл. 410"];

export function DogovaryAIShowcase() {
  return (
    <section
      aria-labelledby="dogovaryai-showcase-title"
      className="relative border-b border-border/50 py-14 sm:py-20"
    >
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <p className="flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold/80 sm:text-[11px]">
            <span className="section-number font-serif text-base font-normal tracking-normal text-gold/60">
              04
            </span>
            <span className="h-px w-5 bg-gold/40" />
            DogovaryAI
          </p>
          <h2
            id="dogovaryai-showcase-title"
            className="mt-3 font-serif text-2xl font-bold leading-tight text-balance sm:text-[28px] md:text-3xl"
          >
            Асистент, който структурира казуса и посочва източниците
          </h2>
          <p className="mx-auto mt-3 max-w-[62ch] text-sm text-muted-foreground sm:text-[15px]">
            Задавате казуса си на нормален език. DogovaryAI подрежда въпроса, цитира
            приложимите разпоредби и предлага следващите стъпки и документи за преглед.
            Не замества индивидуална правна консултация.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-6xl items-start gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Извадка от интерфейса */}
          <div className="overflow-hidden rounded-2xl border border-gold/25 bg-card/70 shadow-elegant backdrop-blur-sm">
            <div className="flex items-center gap-2.5 border-b border-border/50 bg-gradient-to-r from-gold/15 via-card to-card px-4 py-3">
              <img
                src={dogovaiIcon}
                alt="DogovaryAI"
                width={32}
                height={32}
                loading="lazy"
                decoding="async"
                className="h-8 w-8 rounded-full ring-1 ring-gold/30"
              />
              <div className="min-w-0 leading-tight">
                <div className="font-serif text-sm font-bold text-foreground">DogovaryAI</div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Онлайн · с цитати от закона
                </div>
              </div>
              <span className="ml-auto hidden items-center gap-1 rounded-full border border-gold/30 bg-gold/[0.08] px-2 py-0.5 text-[10px] font-semibold text-gold sm:inline-flex">
                <Sparkles className="h-3 w-3" /> Премиум модел
              </span>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-gold/15 px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground">
                {SAMPLE_QUESTION}
              </div>

              <div className="mr-auto max-w-[96%] space-y-2.5 rounded-2xl rounded-bl-md border border-border/50 bg-muted/30 px-3.5 py-3">
                {SAMPLE_ANSWER.map((p) => (
                  <div key={p.heading}>
                    <div className="text-[12.5px] font-semibold text-foreground">{p.heading}</div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                      {p.body}
                    </p>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Източници:
                  </span>
                  {CITATIONS.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-gold/40 bg-gold/[0.07] px-2 py-0.5 text-[10px] text-foreground"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {["Изготви нотариална покана", "Изготви заявление по чл. 410 ГПК"].map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-gold/40 bg-gold/5 px-3 py-1 text-[11.5px] text-gold"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            <div className="border-t border-border/50 bg-background/60 px-4 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-[12.5px] text-muted-foreground">
                <span className="flex-1 truncate">Опишете своя казус…</span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-gold text-navy">
                  <Send className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </div>

          {/* Стойност + CTA */}
          <div className="rounded-2xl border border-border/60 bg-card/50 p-5 sm:p-6">
            <ul role="list" className="space-y-3.5">
              {[
                {
                  icon: Scale,
                  title: "Отговор с правно основание",
                  desc: "Всяко твърдение е обвързано с конкретен член — без общи приказки.",
                },
                {
                  icon: Sparkles,
                  title: "От отговор към документ",
                  desc: "Асистентът подготвя поканата, възражението или договора на място.",
                },
                {
                  icon: ShieldCheck,
                  title: "Данните остават Ваши",
                  desc: "Чувствителните данни се маскират преди обработка от модела.",
                },
              ].map((f) => (
                <li key={f.title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
                    <f.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-foreground">
                      {f.title}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
                      {f.desc}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-5 rounded-xl border border-gold/30 bg-gold/[0.06] p-3.5">
              <div className="text-[13px] font-semibold text-foreground">
                3 безплатни запитвания
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                Без регистрация. След това продължавате с абонамент за неограничен
                правен контекст, история на разговорите и прикачени документи.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  trackMetric("home_dogovaryai_open");
                  window.dispatchEvent(new CustomEvent("dogovai:open"));
                }}
                className="btn-gold w-full justify-center sm:w-auto"
              >
                Попитай DogovaryAI
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </button>
              <Link
                to="/plans"
                onClick={() => trackMetric("home_dogovaryai_plans")}
                className="inline-flex w-full items-center justify-center rounded-full border border-border/70 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-gold/50 hover:text-gold sm:w-auto"
              >
                Виж плановете
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 hairline-x opacity-70" />
    </section>
  );
}
