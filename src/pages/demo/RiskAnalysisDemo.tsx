import { Link } from "react-router-dom";
import { ShieldAlert, AlertTriangle, CheckCircle2, ArrowRight, FileText, Lock, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";

const FINDINGS = [
  { level: "high", title: "Неравноправна клауза за едностранно прекратяване",
    quote: `„Възложителят има право едностранно и без предизвестие да прекрати договора по всяко време…"`,
    why: "Накърнява баланса на правата по чл. 143 ЗЗП — счита се за неравноправна. Препоръчва се симетричен срок (мин. 30 дни)." },
  { level: "high", title: "Прекомерна неустойка (20% от общата стойност)",
    quote: `„При забава Изпълнителят дължи неустойка 20% от стойността на договора за всеки месец…"`,
    why: "ВКС, ТР 1/2009 — нищожна поради противоречие с добрите нрави. Препоръчва се таван 0,1%/ден, не повече от 8%." },
  { level: "medium", title: "Липсва клауза за защита на личните данни (GDPR)",
    quote: "—",
    why: "Договорът обработва данни на трети лица. Необходимо е DPA приложение по чл. 28 ОРЗД." },
  { level: "medium", title: "Подсъдност — арбитраж в чужбина без право на избор",
    quote: `„Всички спорове се решават от ICC, Париж, на английски език…"`,
    why: "За потребителски/трудови спорове е недопустимо. За B2B — оскъпява защитата. Алтернатива: АС при БТПП, София." },
  { level: "low", title: "Двусмислен срок за уведомление",
    quote: `„в разумен срок"`,
    why: "Замени с конкретен срок (7/14 дни), за да избегнеш спор по тълкуване." },
] as const;

const LEVEL = {
  high: { label: "Висок риск", cls: "border-red-500/40 bg-red-500/10 text-red-300" },
  medium: { label: "Среден риск", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  low: { label: "Нисък риск", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
} as const;

export default function RiskAnalysisDemo() {
  const { user } = useAuth();
  const primaryHref = user ? "/console/analysis?autostart=upload" : "/auth?redirect=/console/analysis";
  const primaryLabel = user ? "Започни анализ сега" : "Анализирайте вашия договор";
  return (
    <div className="min-h-dvh bg-background">
      <Seo
        title="Risk Analysis · Пример за анализ на договор — Dogovori.net"
        description="Вижте как DogovaryAI открива скрити клопки и неравноправни клаузи в договори. Пример с реален анализ — клауза по клауза."
        canonical="/demo/risk-analysis"
      />
      <Header />
      <main className="container max-w-5xl py-10 sm:py-14">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
          <ShieldAlert className="h-3.5 w-3.5" /> Пример · Risk Analysis
        </div>
        <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">
          Анализирайте вашия договор <span className="text-accent-gradient">за минути</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Качете PDF/DOCX. AI открива клопки, неравноправни клаузи, прекомерни неустойки и липсващи защити —
          с препратки към ЗЗД, ТЗ, ЗЗП и съдебна практика на ВКС.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to={primaryHref}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-gold px-5 py-2.5 text-sm font-semibold text-navy shadow-gold hover:opacity-95"
          >
            {user ? <Sparkles className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {primaryLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
          {user ? (
            <Link
              to="/console"
              className="inline-flex items-center gap-2 rounded-lg border border-gold/40 px-5 py-2.5 text-sm font-semibold text-gold hover:bg-gold/10"
            >
              Към моя Workspace
            </Link>
          ) : (
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-lg border border-gold/40 px-5 py-2.5 text-sm font-semibold text-gold hover:bg-gold/10"
            >
              Регистрация · 10 безплатни операции
            </Link>
          )}
        </div>

        <section className="mt-10 rounded-2xl border border-border/60 bg-card/50 p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-gold" />
              <span className="font-medium">Договор за изработка — Пример.docx</span>
            </div>
            <div className="text-xs text-muted-foreground">Анализирани: 14 клаузи · Намерени: 5 риска</div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-red-300">Висок</div>
              <div className="mt-1 font-serif text-2xl font-bold">2</div>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">Среден</div>
              <div className="mt-1 font-serif text-2xl font-bold">2</div>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Нисък</div>
              <div className="mt-1 font-serif text-2xl font-bold">1</div>
            </div>
          </div>

          <ul className="mt-6 space-y-4">
            {FINDINGS.map((f, i) => {
              const lv = LEVEL[f.level];
              return (
                <li key={i} className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-gold" />
                      <h3 className="font-serif text-base font-bold leading-snug">{f.title}</h3>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${lv.cls}`}>
                      {lv.label}
                    </span>
                  </div>
                  {f.quote !== "—" && (
                    <blockquote className="mt-3 border-l-2 border-gold/40 bg-muted/30 px-3 py-2 text-sm italic text-foreground/80">
                      {f.quote}
                    </blockquote>
                  )}
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">Защо е риск: </span>{f.why}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            След регистрация получавате пълен отчет в PDF + предложения за поправени клаузи.
          </div>
        </section>

        <div className="mt-10 rounded-xl border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent p-6 text-center">
          <h2 className="font-serif text-2xl font-bold">
            {user ? "Качете вашия документ за анализ" : "Готови ли сте за вашия договор?"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {user ? "Един клик — отива директно в Risk Analysis workspace-а Ви." : "10 безплатни операции след регистрация. Без карта."}
          </p>
          <Link
            to={primaryHref}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-gold px-6 py-3 text-sm font-semibold text-navy"
          >
            {primaryLabel} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
      <SeoFooter />
    </div>
  );
}
