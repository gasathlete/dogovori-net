import { useEffect, useState, lazy, Suspense } from "react";
import { Star, Quote, MessageSquarePlus } from "@/icons";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const WriteReviewDialog = lazy(() =>
  import("@/components/WriteReviewDialog").then((m) => ({ default: m.WriteReviewDialog })),
);

type Testimonial = {
  id: string;
  name: string;
  role: string | null;
  quote: string;
  rating: number;
  photo_url: string | null;
  initials?: string;
};

const FALLBACK: Testimonial[] = [
  {
    id: "seed-1",
    quote:
      "За 3 минути изготвих NDA, който нашият юрист одобри без корекции. Сериозно подобри ежедневието ни.",
    name: "Виктория Йорданова",
    role: "Практикуващ учител и маркетолог",
    rating: 5,
    photo_url: null,
    initials: "ВЙ",
  },
  {
    id: "seed-2",
    quote:
      "AI анализът хвана пропуск в неустойката, който щеше да ми струва скъпо. Препоръчвам на всеки фрийлансър.",
    name: "Иван Стойнов",
    role: "Консултант недвижими имоти",
    rating: 5,
    photo_url: null,
    initials: "ИС",
  },
  {
    id: "seed-3",
    quote:
      "Управляваме всички договори през платформата. Електронният подпис и архивът ни пестят часове седмично.",
    name: "Даниел Милев",
    role: "Управител, агенция за имоти",
    rating: 5,
    photo_url: null,
    initials: "ДМ",
  },
];

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function TestimonialCard({ t }: { t: Testimonial }) {
  const initials = t.initials ?? initialsOf(t.name);
  return (
    <figure className="group relative flex w-[320px] shrink-0 flex-col rounded-xl surface-elevated p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/45 sm:w-[360px] sm:p-7 lg:w-[400px] xl:w-[440px]">
      <Quote className="absolute right-5 top-5 h-7 w-7 text-gold/15 transition-colors duration-300 group-hover:text-gold/30" />
      <div className="mb-4 flex items-center gap-1 text-gold" aria-label={`Оценка ${t.rating} от 5`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={
              i < t.rating
                ? "h-5 w-5 fill-gold text-gold drop-shadow-[0_0_6px_hsl(var(--gold)/0.45)]"
                : "h-5 w-5 text-muted-foreground/30"
            }
            strokeWidth={i < t.rating ? 0 : 1.5}
          />
        ))}
      </div>
      <blockquote className="flex-1 text-sm leading-relaxed text-foreground sm:text-base">
        „{t.quote}"
      </blockquote>
      <figcaption className="mt-5 flex items-center gap-3 border-t border-hairline pt-4">
        {t.photo_url ? (
          <img
            src={t.photo_url}
            alt={t.name}
            loading="lazy"
            className="h-10 w-10 rounded-full border border-gold/30 object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-gold/10 font-serif text-xs font-bold text-gold">
            {initials}
          </div>
        )}
        <div>
          <div className="font-serif text-sm font-bold text-foreground">{t.name}</div>
          {t.role && (
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {t.role}
            </div>
          )}
        </div>
      </figcaption>
    </figure>
  );
}

export function Testimonials() {
  const [items, setItems] = useState<Testimonial[]>(FALLBACK);
  const [reviewOpen, setReviewOpen] = useState(false);

  const load = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("list-home-testimonials");
      if (error) return;
      const arr = (data as any)?.items as Testimonial[] | undefined;
      if (arr && arr.length > 0) setItems(arr);
    } catch {
      /* ignore — keep fallback */
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Duplicate the row for a seamless marquee loop.
  const row = [...items, ...items];

  return (
    <section id="testimonials" className="container py-12 sm:py-16 md:py-20">
      <div className="mb-10 max-w-2xl md:mb-12">
        <div className="eyebrow mb-3">
          <span className="font-serif text-base font-normal tracking-normal text-gold/60">05</span>
          <span className="h-px w-6 bg-gold/40" />
          Мнения
        </div>
        <h2 className="font-serif text-2xl font-bold leading-[1.15] text-balance sm:text-3xl md:text-4xl lg:text-[44px]">
          Не подписваме просто договори. Договаряме партньорства
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
            <TestimonialCard key={`${t.id}-${i}`} t={t} />
          ))}
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <Button
          onClick={() => setReviewOpen(true)}
          size="lg"
          variant="outline"
          className="border-gold/50 text-foreground hover:border-gold hover:bg-gold/5"
        >
          <MessageSquarePlus className="mr-2 h-4 w-4 text-gold" />
          Напишете ревю
        </Button>
        <p className="text-xs text-muted-foreground">
          Всяко ревю преминава кратък преглед преди публикуване.
        </p>
      </div>

      {reviewOpen && (
        <Suspense fallback={null}>
          <WriteReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} onSubmitted={load} />
        </Suspense>
      )}
    </section>
  );
}
