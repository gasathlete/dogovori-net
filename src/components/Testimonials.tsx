import { Star, Quote } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "За 3 минути изготвих NDA, който нашият юрист одобри без корекции. Сериозно подобри ежедневието ни.",
    name: "​Виктория Йорданова",
    role: "Практикуващ Учител и марктетолог",
    initials: "ВЙ",
  },
  {
    quote:
      "AI анализът хвана пропуск в неустойката, който щеше да ми струва скъпо. Препоръчвам на всеки фрийлансър.",
    name: "Иван Стойнов",
    role: "Консултант Недвижими Имоти",
    initials: "ИС",
  },
  {
    quote:
      "Управляваме всички договори през платформата. Електронният подпис и архивът ни пестят часове седмично.",
    name: "Даниел Милев",
    role: "Управител, агенция за имоти",
    initials: "ДМ",
  },
];

function TestimonialCard({ t }: { t: (typeof TESTIMONIALS)[number] }) {
  return (
    <figure className="group relative flex w-[320px] shrink-0 flex-col rounded-xl surface-elevated p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/45 sm:w-[360px] sm:p-7 lg:w-[400px] xl:w-[440px]">
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
  );
}

export function Testimonials() {
  // Duplicate the row for a seamless marquee loop.
  const row = [...TESTIMONIALS, ...TESTIMONIALS];

  return (
    <section id="testimonials" className="container py-20 sm:py-24 md:py-28">
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

      <div
        className="relative overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)",
        }}
      >
        <div className="marquee-track flex w-max gap-5">
          {row.map((t, i) => (
            <TestimonialCard key={`${t.name}-${i}`} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}
