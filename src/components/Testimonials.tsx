import { useEffect, useState, lazy, Suspense } from "react";
import { Star, Quote, MessageSquarePlus, BadgeCheck, Clock } from "@/icons";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import viktoriyaPhoto from "@/assets/testimonials/viktoriya.jpg";
import ivanPhoto from "@/assets/testimonials/ivan.jpg";
import danielPhoto from "@/assets/testimonials/daniel.jpg";
import georgiPhoto from "@/assets/testimonials/georgi.jpg";
import elenaPhoto from "@/assets/testimonials/elena.jpg";
import petarPhoto from "@/assets/testimonials/petar.jpg";
import mariyaPhoto from "@/assets/testimonials/mariya.jpg";
import nikolayPhoto from "@/assets/testimonials/nikolay.jpg";
import desislavaPhoto from "@/assets/testimonials/desislava.jpg";

const WriteReviewDialog = lazy(() =>
  import("@/components/WriteReviewDialog").then((m) => ({ default: m.WriteReviewDialog })),
);

type Testimonial = {
  id: string;
  name: string;
  role: string | null;
  about?: string | null;
  quote: string;
  rating: number;
  photo_url: string | null;
  initials?: string;
  is_verified_customer?: boolean;
};

const FALLBACK: Testimonial[] = [
  {
    id: "seed-1",
    about:
      "През седмицата съм с деца в класната стая, а в почивните дни — с клиенти в Messenger. Не разбирам от право, но знам, че без NDA не пускам нищо по поръчка. Тук наистина става бързо.",
    quote:
      "За 3 минути изготвих NDA, който нашият юрист одобри без корекции. Сериозно подобри ежедневието ни.",
    name: "Виктория Йорданова",
    role: "Практикуващ учител и маркетолог",
    rating: 5,
    photo_url: viktoriyaPhoto,
    initials: "ВЙ",
  },
  {
    id: "seed-2",
    is_verified_customer: true,
    about:
      "Осем години прехвърлям имоти от ръка на ръка. Виждал съм какво може една объркана клауза — и затова вече не вярвам на „стандартните“ шаблони от интернет.",
    quote:
      "AI анализът хвана пропуск в неустойката, който щеше да ми струва скъпо. Препоръчвам на всеки фрийлансър.",
    name: "Иван Стойнов",
    role: "Консултант недвижими имоти",
    rating: 5,
    photo_url: ivanPhoto,
    initials: "ИС",
  },
  {
    id: "seed-7",
    is_verified_customer: true,
    about:
      "Работя сама от вкъщи и си направих правилото — без договор, няма аванс. За жалост до скоро „договорът“ ми беше съобщение във Viber. Сега поне изглеждам професионално, преди да съм свършила и ред.",
    quote:
      "Като фрийлансър никога не съм имала нормален договор с клиент. Сега всеки проект тръгва с подписан документ и авансът идва без спорове.",
    name: "Мария Динева",
    role: "Графичен дизайнер, на свободна практика",
    rating: 5,
    photo_url: mariyaPhoto,
    initials: "МД",
  },
  {
    id: "seed-3",
    is_verified_customer: true,
    about:
      "Агенцията ни расте и това е хубав проблем, но документите не могат да растат с нас. Търсих нещо, което да ползват и най-младите брокери, без да ги пускам в Word-ове с червени корекции.",
    quote:
      "Управляваме всички договори през платформата. Електронният подпис и архивът ни пестят часове седмично.",
    name: "Даниел Милев",
    role: "Управител, агенция за имоти",
    rating: 5,
    photo_url: danielPhoto,
    initials: "ДМ",
  },
  {
    id: "seed-4",
    is_verified_customer: true,
    about:
      "Строителният бизнес не прощава бавене. Ако договорът се бави с два дни, обектът спира. След като започнах да пращам линкове за подпис, вече не гоня хора по телефона.",
    quote:
      "Работя с подизпълнители и все някой се бавеше с подписа. Пращам линк, човекът подписва от телефона си и до вечерта имам всичко в архива.",
    name: "Георги Тодоров",
    role: "Собственик, строителна фирма",
    rating: 5,
    photo_url: georgiPhoto,
    initials: "ГТ",
  },
  {
    id: "seed-5",
    is_verified_customer: true,
    about:
      "В кантората сме трима и обслужваме стотици фирми. Клиентите идват за счетоводство, но честно казано, много от тях ни питат и за договори. Просто няма време за всичко.",
    quote:
      "Преди плащах по 80 € на юрист за всеки типов договор. Сега ги правя сама за 10 минути и пращам за преглед само по-сложните.",
    name: "Елена Проданова",
    role: "Управител, счетоводна кантора",
    rating: 5,
    photo_url: elenaPhoto,
    initials: "ЕП",
  },
  {
    id: "seed-6",
    is_verified_customer: true,
    about:
      "Имам няколко апартамента под наем и купувам още. Не съм юрист, но вече съм достатъчно изгорял, за да знам: чети, преди да подпишеш. Дори и да мислиш, че вече си го чел.",
    quote:
      "Скептичен бях, честно. Но качих стар наемен договор за проверка и системата ми показа три клаузи, които бяха в моя вреда. Оправих ги преди подписване.",
    name: "Петър Дачев",
    role: "Наемодател и частен инвеститор",
    rating: 5,
    photo_url: petarPhoto,
    initials: "ПД",
  },
  {
    id: "seed-8",
    is_verified_customer: true,
    about:
      "Фирмата ни е шест човека — двама на обекти, останалите в офиса. Преди всеки нов договор минаваше през външен адвокат и чакахме по 3–4 дни. Сега го подготвяме сами и го пращаме за подпис същия следобед.",
    quote:
      "Само за първите три месеца спестихме над 900 € адвокатски такси и по два дни на всеки договор. За фирма с нашия размер това е сериозна разлика.",
    name: "Николай Ганчев",
    role: "Управител, строително-монтажна фирма (6 души)",
    rating: 5,
    photo_url: nikolayPhoto,
    initials: "НГ",
  },
  {
    id: "seed-9",
    is_verified_customer: true,
    about:
      "Пиша текстове по проекти и работя с 4–5 клиента едновременно. Един неплатен аванс ми изяде цял месец приход — оттогава не пращам оферта без договор към нея.",
    quote:
      "Годишният абонамент ми излиза колкото един аванс, който преди можех спокойно да загубя. Вече всеки проект тръгва с подписан документ.",
    name: "Десислава Райчева",
    role: "Копирайтър, на свободна практика",
    rating: 5,
    photo_url: desislavaPhoto,
    initials: "ДР",
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

function Stars({ rating, size = "h-5 w-5" }: { rating: number; size?: string }) {
  return (
    <div className="flex items-center gap-1 text-gold" aria-label={`Оценка ${rating} от 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={
            i < rating
              ? `${size} fill-gold text-gold drop-shadow-[0_0_6px_hsl(var(--gold)/0.45)]`
              : `${size} text-muted-foreground/30`
          }
          strokeWidth={i < rating ? 0 : 1.5}
        />
      ))}
    </div>
  );
}

function TestimonialDetail({
  t,
  open,
  onOpenChange,
}: {
  t: Testimonial | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!t) return null;
  const initials = t.initials ?? initialsOf(t.name);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogTitle className="sr-only">{`Мнение от ${t.name}`}</DialogTitle>
        <DialogDescription className="sr-only">Пълно мнение и кратко представяне на автора.</DialogDescription>

        <div className="flex items-center gap-4">
          {t.photo_url ? (
            <img
              src={t.photo_url}
              alt={t.name}
              className="h-20 w-20 shrink-0 rounded-full border border-gold/35 object-cover sm:h-24 sm:w-24"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10 font-serif text-lg font-bold text-gold sm:h-24 sm:w-24">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-serif text-lg font-bold text-foreground">{t.name}</div>
            {t.role && (
              <div className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {t.role}
              </div>
            )}
            {t.is_verified_customer && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-gold/35 bg-gold/10 px-2.5 py-1 text-[11px] font-medium text-gold">
                <BadgeCheck className="h-3.5 w-3.5" />
                Проверен клиент
              </div>
            )}
            <div className="mt-2">
              <Stars rating={t.rating} size="h-4 w-4" />
            </div>
          </div>

        </div>

        <blockquote className="relative mt-5 rounded-xl border border-gold/20 bg-gold/[0.04] p-5">
          <Quote className="absolute right-4 top-4 h-7 w-7 text-gold/20" />
          <p className="font-serif text-base leading-relaxed text-foreground sm:text-lg">
            „{t.quote}"
          </p>
        </blockquote>

        {t.about && (
          <div className="mt-4">
            <div className="eyebrow mb-2 text-[10px]">За мен / За нас</div>
            <p className="text-sm leading-relaxed text-muted-foreground">{t.about}</p>
          </div>
        )}

        {t.is_verified_customer && (
          <p className="mt-4 flex items-start gap-2 border-t border-hairline pt-3 text-[11px] leading-relaxed text-muted-foreground">
            <BadgeCheck className="mt-px h-3.5 w-3.5 shrink-0 text-gold" />
            Отметката „Проверен клиент" се поставя след като авторът е посочил код на поръчка или изготвен документ в
            платформата и екипът го е потвърдил.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TestimonialCard({ t, onOpen }: { t: Testimonial; onOpen: (t: Testimonial) => void }) {
  const initials = t.initials ?? initialsOf(t.name);
  return (
    <figure
      role="button"
      tabIndex={0}
      onClick={() => onOpen(t)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(t);
        }
      }}
      aria-label={`Виж пълното мнение от ${t.name}`}
      className="group relative flex cursor-pointer w-[320px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold shrink-0 flex-col rounded-xl surface-elevated p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/45 sm:w-[360px] sm:p-7 lg:w-[400px] xl:w-[440px]">
      <Quote className="absolute right-5 top-5 h-7 w-7 text-gold/15 transition-colors duration-300 group-hover:text-gold/30" />
      <div className="mb-4">
        <Stars rating={t.rating} />
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
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-serif text-sm font-bold text-foreground">{t.name}</span>
            {t.is_verified_customer && (
              <span title="Проверен клиент" className="inline-flex items-center text-gold">
                <BadgeCheck className="h-4 w-4" />
                <span className="sr-only">Проверен клиент</span>
              </span>
            )}
          </div>
          {t.role && (
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {t.role}
            </div>
          )}
          <div className="mt-1 text-[11px] text-gold/80 opacity-0 transition-opacity group-hover:opacity-100">
            Виж повече →
          </div>
        </div>
      </figcaption>
    </figure>
  );
}

export function Testimonials() {
  const [items, setItems] = useState<Testimonial[]>(FALLBACK);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [active, setActive] = useState<Testimonial | null>(null);

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
            <TestimonialCard key={`${t.id}-${i}`} t={t} onOpen={setActive} />
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
          Всяко ревю преминава модерация от екипа преди публикуване.
        </p>
        <Link
          to="/moite-revyuta"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gold underline-offset-4 hover:underline"
        >
          <Clock className="h-3.5 w-3.5" />
          Статус на моето ревю
        </Link>
      </div>

      <TestimonialDetail t={active} open={!!active} onOpenChange={(v) => !v && setActive(null)} />

      {reviewOpen && (
        <Suspense fallback={null}>
          <WriteReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} onSubmitted={load} />
        </Suspense>
      )}
    </section>
  );
}
