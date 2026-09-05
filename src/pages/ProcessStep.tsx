import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, Bot, FileText, ShieldAlert, FileSignature, ShieldCheck, ChevronRight } from "@/icons";
import { cn } from "@/lib/utils";

type StepKey = "dogovaryay" | "sazday" | "pretsiziray" | "podpishi";

interface StepDef {
  slug: StepKey;
  order: number;
  word: string;
  title: string;
  tagline: string;
  metaDesc: string;
  icon: any;
  intro: string;
  bullets: { h: string; p: string }[];
  how: string[];
  featureHref: string;
  featureLabel: string;
  authedCtaLabel: string;
  prev?: StepKey;
  next?: StepKey;
}

const STEPS: Record<StepKey, StepDef> = {
  dogovaryay: {
    slug: "dogovaryay",
    order: 1,
    word: "Договаряй",
    title: "Договаряй — правен AI-асистент, обучен на българското право",
    tagline: "Първата стъпка: разбери позицията си и договори най-добрите условия.",
    metaDesc:
      "Правен AI-асистент на dogovori.net – консултира, договаря клаузи и подготвя аргументите ти преди да седнеш на масата. Безплатно за старт.",
    icon: Bot,
    intro:
      "Преди да съставиш договор, трябва да знаеш какво искаш и какво можеш да поискаш. DogovAI е обучен модел върху ЗЗД, ТЗ, КТ, ЗУТ и българската съдебна практика – помага ти да формулираш позиция, да разбереш насрещните интереси и да подготвиш точния език за преговор.",
    bullets: [
      { h: "Юридически контекст на български", p: "Отговори със справка към конкретен член от закона или устойчива практика, не общи AI-хрумвания." },
      { h: "Симулация на преговор", p: "Задай сценарий («наемодател иска 3 наема депозит») и получи готови контра-аргументи и алтернативни клаузи." },
      { h: "Проверка на позицията ти", p: "Асистентът посочва слабостите преди насрещната страна да ги намери." },
    ],
    how: [
      "Отвори чата и опиши ситуацията с 1-2 изречения.",
      "Асистентът задава уточняващи въпроси и предлага стратегия.",
      "Изнасяш готовите тези и клаузи директно към стъпка «Създай»."
    ],
    featureHref: "/assistant",
    featureLabel: "Отвори AI-асистента",
    authedCtaLabel: "Продължи с AI-асистента",
    next: "sazday",
  },
  sazday: {
    slug: "sazday",
    order: 2,
    word: "Създай",
    title: "Създай — над 600 шаблона и динамичен wizard",
    tagline: "Втора стъпка: превърни договорената позиция в готов документ.",
    metaDesc:
      "Създай трудов, наемен, граждански договор, NDA или пълномощно от 600+ адвокатски бланки на dogovori.net – с wizard, който попълва точните клаузи.",
    icon: FileText,
    intro:
      "Каталогът обхваща над 600 шаблона – трудови, граждански, наемни, търговски, услуги, недвижими имоти, семейни, административни. Всеки шаблон върви с динамичен wizard, който задава само въпросите, релевантни за твоя казус, и активира правилните клаузи (напр. неустойка, ексклузивитет, GDPR анекс).",
    bullets: [
      { h: "Wizard, не празен Word", p: "Отговаряш на въпроси на български; клаузите се раждат автоматично, съобразени с ЗЗД и КТ." },
      { h: "Двуезични договори", p: "BG / EN / DE / FR в две колони – когато другата страна не чете български." },
      { h: "Експорт PDF и DOCX", p: "Веднага – с водни знаци за безплатен и чист документ при активен план." },
    ],
    how: [
      "Избери шаблон от каталога или използвай търсенето.",
      "Мини wizard-ът те води през параметрите – страни, срок, цена, специфични клаузи.",
      "Сваляш готовия PDF/DOCX или пращаш към стъпка «Прецизирай» за проверка."
    ],
    featureHref: "/catalog",
    featureLabel: "Виж каталога с шаблони",
    authedCtaLabel: "Създай нов документ",
    prev: "dogovaryay",
    next: "pretsiziray",
  },
  pretsiziray: {
    slug: "pretsiziray",
    order: 3,
    word: "Прецизирай",
    title: "Прецизирай — AI анализ на риска в договор",
    tagline: "Трета стъпка: улови клопките, преди да си подписал.",
    metaDesc:
      "Качи договор в dogovori.net и получи анализ на неравноправни клаузи, липсващи защити и правни рискове по българското законодателство.",
    icon: ShieldAlert,
    intro:
      "Всеки договор – твой или получен от насрещна страна – може да бъде качен за анализ. Системата маркира неравноправни клаузи по чл. 143 ЗЗП, дисбаланси в неустойките, липсваща GDPR-защита, скрити автоматични продължения и неясни формулировки, и предлага конкретни редакции.",
    bullets: [
      { h: "Категоризиран риск", p: "Червено / жълто / зелено – с обяснение защо и препратка към член от закона." },
      { h: "Предложени редакции", p: "Готов текст за замяна на проблемната клауза, който можеш да приложиш с 1 клик." },
      { h: "Вълни корекции", p: "Прилагаш пакет промени наведнъж; същият batch не се таксува повторно." },
    ],
    how: [
      "Качи PDF или DOCX (или го подай от стъпка «Създай»).",
      "Прегледай маркираните клаузи и рискове.",
      "Приеми или отхвърли предложените редакции и пращай към «Подпиши»."
    ],
    featureHref: "/analiz",
    featureLabel: "Анализирай документ",
    authedCtaLabel: "Качи документ за анализ",
    prev: "sazday",
    next: "podpishi",
  },
  podpishi: {
    slug: "podpishi",
    order: 4,
    word: "Подпиши",
    title: "Подпиши — електронен подпис през dogovori.net",
    tagline: "Финална стъпка: юридически валиден подпис без принтер.",
    metaDesc:
      "Подпиши договор електронно през dogovori.net – Advanced Electronic Signature с идентификация имейл + SMS + селфи + ЛК, PAdES-B-LT формат.",
    icon: FileSignature,
    intro:
      "Пращаш договора за подпис на 1 или повече страни през защитен линк. Всяка страна се идентифицира с имейл, SMS-код, селфи и снимка на лична карта; подписът се вгражда в PDF-а с PAdES-B-LT печат за дългосрочна валидност. Получаваш пълна одит-пътека и подписан оригинал в акаунта си.",
    bullets: [
      { h: "AES (Advanced Electronic Signature)", p: "Юридически валиден за повечето договори по чл. 13 ЗЕДЕУУ – без нужда от квалифицирано устройство." },
      { h: "Многостранно подписване", p: "Поредица от подписи с напомняния по имейл и статус на всяка страна." },
      { h: "Одит-пътека", p: "IP, timestamps, идентификация и хеш на документа – достъпни като PDF доказателство." },
    ],
    how: [
      "Отвори документа в акаунта и избери «Изпрати за подпис».",
      "Добави имейлите на страните и реда на подписване.",
      "Получаваш подписания PDF с печат и одит-доказателство."
    ],
    featureHref: "/console/signing?send=1",
    featureLabel: "Отвори електронния подпис",
    authedCtaLabel: "Изпрати за подпис",
    prev: "pretsiziray",
  },
};

function StepChip({ step, active }: { step: StepDef; active: boolean }) {
  return (
    <Link
      to={`/proces/${step.slug}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors",
        active
          ? "border-gold/70 bg-gold/10 text-gold"
          : "border-gold/20 bg-card/40 text-muted-foreground hover:border-gold/40 hover:text-gold",
      )}
    >
      <span className="opacity-60">0{step.order}</span>
      {step.word}
    </Link>
  );
}

export default function ProcessStep() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const step = slug ? STEPS[slug as StepKey] : undefined;

  const ctaHref = useMemo(() => {
    if (!step) return "/";
    if (user) return step.featureHref;
    return `/auth?tab=signup&redirect=${encodeURIComponent(step.featureHref)}`;
  }, [user, step]);

  if (!step) return <Navigate to="/" replace />;

  const Icon = step.icon;
  const ordered: StepDef[] = [STEPS.dogovaryay, STEPS.sazday, STEPS.pretsiziray, STEPS.podpishi];

  return (
    <div className="min-h-dvh">
      <Seo
        title={`${step.title} · dogovori.net`}
        description={step.metaDesc}
        canonical={`/proces/${step.slug}`}
      />
      <Header />
      <main className="route-fade">
        <section className="container mx-auto max-w-4xl px-4 pb-20 pt-10 sm:pt-14">
          {/* Breadcrumb chips */}
          <nav aria-label="Процес" className="mb-8 flex flex-wrap items-center gap-1.5">
            {ordered.map((s, i) => (
              <div key={s.slug} className="flex items-center gap-1.5">
                <StepChip step={s} active={s.slug === step.slug} />
                {i < ordered.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
              </div>
            ))}
          </nav>

          {/* Hero */}
          <header className="mb-10">
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-gold">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/80">
                Стъпка 0{step.order} от 04
              </span>
            </div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              {step.title}
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">{step.tagline}</p>
          </header>

          <p className="text-[15px] leading-relaxed text-foreground/90">{step.intro}</p>

          {/* Bullets */}
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {step.bullets.map((b) => (
              <div
                key={b.h}
                className="rounded-xl border border-gold/15 bg-card/40 p-4 backdrop-blur-sm"
              >
                <h3 className="text-sm font-semibold text-foreground">{b.h}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{b.p}</p>
              </div>
            ))}
          </div>

          {/* How */}
          <section className="mt-12">
            <h2 className="text-xl font-semibold">Как работи</h2>
            <ol className="mt-4 space-y-3">
              {step.how.map((h, i) => (
                <li key={i} className="flex gap-3 rounded-lg border border-border/60 bg-card/30 p-3.5">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-[12px] font-bold text-gold">
                    {i + 1}
                  </span>
                  <span className="text-[14px] leading-relaxed text-foreground/90">{h}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* CTA block */}
          <section className="mt-12 rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-card/60 to-card/30 p-6 sm:p-8">
            {user ? (
              <>
                <h2 className="text-xl font-semibold">Готов си за тази стъпка</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Продължи директно към функцията – акаунтът ти е активен.
                </p>
                <Link
                  to={ctaHref}
                  className="btn-gold btn-sheen btn-press shadow-gold mt-5 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-semibold"
                >
                  {step.authedCtaLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold">Пробвай безплатно</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Регистрирай се за 60 секунди – безплатен профил: {FREE_OFFER_RULE}, без карта.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Link
                    to={ctaHref}
                    className="btn-gold btn-sheen btn-press shadow-gold inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-semibold"
                  >
                    Започни безплатно
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to={step.featureHref}
                    className="inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-card/60 px-5 py-3 text-[14px] font-semibold text-gold hover:bg-gold/10"
                  >
                    {step.featureLabel}
                  </Link>
                </div>
                <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  Без карта · GDPR · Данните ти остават твои
                </p>
              </>
            )}
          </section>

          {/* Prev / Next navigation */}
          <nav className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-between">
            {step.prev ? (
              <Link
                to={`/proces/${step.prev}`}
                className="group inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/30 px-4 py-3 text-sm hover:border-gold/40"
              >
                <ArrowRight className="h-4 w-4 rotate-180 transition-transform group-hover:-translate-x-1" />
                <span>
                  <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
                    Предишна стъпка
                  </span>
                  <span className="font-semibold">{STEPS[step.prev].word}</span>
                </span>
              </Link>
            ) : <span />}
            {step.next ? (
              <Link
                to={`/proces/${step.next}`}
                className="group inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/30 px-4 py-3 text-sm hover:border-gold/40 sm:text-right"
              >
                <span>
                  <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
                    Следваща стъпка
                  </span>
                  <span className="font-semibold">{STEPS[step.next].word}</span>
                </span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            ) : <span />}
          </nav>
        </section>
        <SeoFooter />
      </main>
    </div>
  );
}
