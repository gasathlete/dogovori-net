/**
 * /start — единна входна точка към създаване на документ.
 *
 * Вместо потребителят да избира между технически инструменти
 * (каталог / wizard / build / асистент / анализ), тук той избира
 * НАМЕРЕНИЕ, а приложението го отвежда към правилния инструмент.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";
import { LIFE_SCENARIOS } from "@/data/lifeScenarios";
import { ArrowRight, Search, Sparkles, FileUp, Layers } from "@/icons";
import { trackDocStart } from "@/lib/docFunnel";

const UPLOAD_ROUTE = "/account?tab=documents&action=upload";

const INTENTS = [
  {
    id: "know",
    icon: Search,
    title: "Знам какъв документ ми трябва",
    desc: "Търси в над 600 шаблона по име или ситуация и започни веднага.",
    to: "/catalog",
    cta: "Намери шаблон",
  },
  {
    id: "describe",
    icon: Sparkles,
    title: "Опиши ми ситуацията",
    desc: "DogovaryAI задава въпроси и сам избира правилния документ за случая.",
    to: "/assistant",
    cta: "Питай асистента",
  },
  {
    id: "have",
    icon: FileUp,
    title: "Имам готов документ",
    desc: "Качи PDF или Word и получи анализ на риска със сверка по ЗЗД и ТЗ.",
    to: UPLOAD_ROUTE,
    cta: "Качи за анализ",
    requiresAuth: true,
  },
] as const;

/** Най-честите житейски ситуации — пряк път без преминаване през каталога. */
const QUICK_SCENARIOS = LIFE_SCENARIOS.filter((s) =>
  ["rent-out", "hire", "freelance", "nda", "poa", "loan"].includes(s.id),
);

export default function StartPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const hrefFor = (intent: (typeof INTENTS)[number]) => {
    if ("requiresAuth" in intent && intent.requiresAuth && !user) {
      return `/auth?tab=signup&redirect=${encodeURIComponent(intent.to)}`;
    }
    return intent.to;
  };

  return (
    <>
      <Seo
        title="Откъде да започна — Договори.нет"
        description="Изберете как да започнете: намерете готов шаблон, опишете ситуацията си на AI асистента или качете съществуващ документ за анализ на риска."
        canonical="https://dogovori.net/start"
      />
      <Header />

      <main className="relative min-h-dvh bg-background pb-24 pt-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[36vh] opacity-50"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 0%, hsl(var(--gold) / 0.16), transparent 70%)",
          }}
        />

        <div className="container relative mx-auto max-w-4xl px-4">
          <header className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
              Стъпка 1 от 3
            </p>
            <h1 className="mt-3 font-serif text-3xl font-bold leading-tight text-balance md:text-4xl">
              Откъде да започнем?
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Изберете едно от трите. Отвеждаме Ви директно до документа — без
              междинни менюта.
            </p>
          </header>

          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {INTENTS.map((intent, i) => (
              <li key={intent.id}>
                <Link
                  to={hrefFor(intent)}
                  onClick={() => trackDocStart({ source: "start", intent: intent.id })}
                  className="group flex h-full flex-col rounded-xl border border-border/60 bg-card p-6 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-gold/20"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
                    <intent.icon className="h-5 w-5" />
                  </span>
                  <span className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="mt-1 font-serif text-lg font-bold leading-snug">
                    {intent.title}
                  </h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {intent.desc}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gold">
                    {intent.cta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <section className="mt-12" aria-labelledby="quick-scenarios">
            <h2
              id="quick-scenarios"
              className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
            >
              Или тръгнете от типична ситуация
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_SCENARIOS.map((s) => (
                <Link
                  key={s.id}
                  to={s.kitId ? `/komplekti/${s.kitId}` : (s.href ?? "/komplekti")}
                  onClick={() => trackDocStart({ source: "start_scenario", doc_key: s.id })}
                  className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3.5 py-2 text-sm text-foreground/85 transition-colors hover:border-gold/50 hover:text-gold"
                >
                  <Layers className="h-3.5 w-3.5 text-gold" />
                  {s.label}
                </Link>
              ))}
            </div>
          </section>

          {!user && (
            <p className="mt-10 text-center text-xs text-muted-foreground">
              Разглеждането е свободно.{" "}
              <button
                type="button"
                onClick={() => navigate("/auth?tab=signup&redirect=%2Fstart")}
                className="font-semibold text-gold hover:underline"
              >
                Регистрирайте се
              </button>{" "}
              за 5 безплатни операции — без карта.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
