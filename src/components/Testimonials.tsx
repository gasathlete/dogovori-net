import { Star, Quote } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "За 3 минути изготвих NDA, който нашият юрист одобри без корекции. Сериозно подобри ежедневието ни.",
    name: "Адв. Мария Г.",
    role: "Самостоятелен адвокат, София",
    initials: "МГ",
  },
  {
    quote:
      "AI анализът хвана пропуск в неустойката, който щеше да ми струва скъпо. Препоръчвам на всеки фрийлансър.",
    name: "Иван П.",
    role: "Софтуерен консултант",
    initials: "ИП",
  },
  {
    quote:
      "Управляваме 14 наемни договора през платформата. Електронният подпис и архивът ни пестят часове седмично.",
    name: "Елена С.",
    role: "Управител, агенция за имоти",
    initials: "ЕС",
  },
];

export function Testimonials() {
  return (
    <section id="testimonials" className="container py-14 sm:py-16 md:py-24">
      <div className="mb-10 max-w-2xl md:mb-12">
        <div className="eyebrow mb-3">
          <span className="font-serif text-base font-normal tracking-normal text-gold/60">05</span>
          <span className="h-px w-6 bg-gold/40" />
          Мнения
        </div>
        <h2 className="font-serif text-2xl font-bold leading-[1.15] text-balance sm:text-3xl md:text-4xl lg:text-[44px]">
          Какво казват професионалистите
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Юристи, фрийлансъри и малки бизнеси, които използват Dogovori.net ежедневно.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <figure
            key={t.name}
            className="group relative flex flex-col rounded-xl surface-elevated p-6 sm:p-7 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/45"
          >
            <Quote className="absolute right-5 top-5 h-7 w-7 text-gold/15 transition-colors duration-300 group-hover:text-gold/30" />
            <div className="mb-4 flex items-center gap-1 text-gold">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-gold" strokeWidth={0} />
              ))}
            </div>
            <blockquote className="flex-1 text-sm leading-relaxed text-foreground sm:text-base">
              „{t.quote}"
            </blockquote>
            <figcaption className="mt-5 flex items-center gap-3 border-t border-hairline pt-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-gold/10 font-serif text-xs font-bold text-gold">
                {t.initials}
              </div>
              <div>
                <div className="font-serif text-sm font-bold text-foreground">{t.name}</div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {t.role}
                </div>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
