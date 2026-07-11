/**
 * /analiz — Step 3 of the marketing funnel ("aha moment").
 *
 * Three entry modes: Upload, Paste, Interview.
 * Produces an AnalysisSession with risks → first one shown free, the rest are
 * blurred with a paywall CTA that goes to /auth → /plans for non-authed users
 * or to /account?tab=documents&action=upload for authed users (real analysis).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileUp, ClipboardPaste, MessageCircleQuestion, Lock, Loader2, ShieldAlert, Sparkles } from "@/icons";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";

import { PrimaryCTA } from "@/components/funnel/PrimaryCTA";
import { RoiCalculator } from "@/components/funnel/RoiCalculator";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  loadAnalysisSession,
  markFunnelStep,
  mockAnalyze,
  newAnalysisSession,
  saveAnalysisSession,
  trackFunnelEvent,
  type AnalysisSession,
} from "@/lib/funnel";

type Mode = "upload" | "paste" | "interview";

const DOC_KINDS = [
  { id: "rent", label: "Договор за наем" },
  { id: "labor", label: "Трудов договор" },
  { id: "nda", label: "NDA / Конфиденциалност" },
  { id: "service", label: "Договор за услуга" },
  { id: "freelance", label: "Граждански / Изработка" },
];

export default function Analyze() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("paste");
  const [docKind, setDocKind] = useState<string>("rent");
  const [pasted, setPasted] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [session, setSession] = useState<AnalysisSession | null>(null);

  useEffect(() => {
    markFunnelStep(3);
    // Restore a previous session within TTL — gives returning users instant value.
    const prev = loadAnalysisSession();
    if (prev) setSession(prev);
  }, []);

  const docKindLabel = useMemo(
    () => DOC_KINDS.find((d) => d.id === docKind)?.label ?? "Документ",
    [docKind],
  );

  const runAnalyze = async (source: Mode) => {
    setAnalyzing(true);
    trackFunnelEvent("funnel_analyze_start", { source, docKind });
    // Perceived-value pause — research shows 1.5-2s delay raises trust vs. instant.
    await new Promise((r) => setTimeout(r, 1800));
    const risks = mockAnalyze(docKind);
    const s = newAnalysisSession(source, docKindLabel, risks);
    saveAnalysisSession(s);
    setSession(s);
    setAnalyzing(false);
    trackFunnelEvent("funnel_analyze_complete", {
      source,
      docKind,
      score: s.score,
      risks: risks.length,
      recommended: s.recommendedPlan,
    });
  };

  const goToPaywall = () => {
    trackFunnelEvent("funnel_paywall_click", {
      from: "analyze",
      recommended: session?.recommendedPlan,
    });
    if (user) navigate("/plans");
    else navigate("/auth?tab=signup&redirect=%2Fplans%3Ffrom%3Danaliz");
  };

  return (
    <>
      <Seo
        title="Анализирай документа си безплатно — Договори.нет"
        description="Качи PDF или въведи текст. AI открива рисковете в твоя договор за 60 секунди. Първият риск е безплатен."
        canonical="https://dogovori.net/analiz"
      />
      <Header />

      <main className="relative min-h-dvh bg-background pb-24 pt-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[40vh] opacity-50"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 0%, hsl(var(--gold) / 0.18), transparent 70%)",
          }}
        />

        <section className="container relative mx-auto max-w-3xl px-4">
          <header className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
              Безплатен анализ
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">
              Открий рисковете в твоя договор{" "}
              <em className="not-italic text-gold">за 60 секунди</em>
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Без регистрация. Първият риск — безплатно и веднага. Резултатът
              остава достъпен 24 часа.
            </p>
          </header>

          {!session ? (
            <div className="mt-8 rounded-2xl border border-hairline bg-card/60 p-5 shadow-soft sm:p-7">
              {/* Mode tabs */}
              <div
                role="tablist"
                aria-label="Метод за анализ"
                className="grid grid-cols-3 gap-1.5 rounded-xl border border-border/60 bg-background/60 p-1"
              >
                {[
                  { id: "upload" as Mode, icon: FileUp, label: "Качи PDF" },
                  { id: "paste" as Mode, icon: ClipboardPaste, label: "Постави текст" },
                  { id: "interview" as Mode, icon: MessageCircleQuestion, label: "3 въпроса" },
                ].map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={mode === id}
                    onClick={() => setMode(id)}
                    className={cn(
                      "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors",
                      mode === id
                        ? "bg-gold text-navy shadow-gold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>

              {/* Document kind */}
              <div className="mt-5">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Тип документ
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {DOC_KINDS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDocKind(d.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        docKind === d.id
                          ? "border-gold bg-gold/15 text-gold"
                          : "border-border/60 bg-background/40 text-muted-foreground hover:border-gold/40",
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode-specific input */}
              <div className="mt-5">
                {mode === "upload" && (
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gold/40 bg-gold/[0.04] px-6 py-10 text-center transition-colors hover:border-gold/70 hover:bg-gold/[0.08]">
                    <FileUp className="h-8 w-8 text-gold" />
                    <span className="text-sm font-semibold text-foreground">
                      Пусни PDF тук или цъкни за избор
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Демо: файлът няма да бъде качен — генерираме примерен анализ
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      className="hidden"
                      onChange={() => runAnalyze("upload")}
                    />
                  </label>
                )}

                {mode === "paste" && (
                  <div className="space-y-2">
                    <textarea
                      value={pasted}
                      onChange={(e) => setPasted(e.target.value)}
                      placeholder="Постави текста на договора тук… (минимум 200 символа)"
                      rows={6}
                      className="w-full rounded-xl border border-border/60 bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-gold/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={pasted.length < 200 || analyzing}
                      onClick={() => runAnalyze("paste")}
                      className="btn-gold btn-sheen btn-press w-full rounded-xl py-3 text-[15px] font-semibold disabled:opacity-50"
                    >
                      Анализирай безплатно →
                    </button>
                  </div>
                )}

                {mode === "interview" && (
                  <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-4">
                    <p className="text-sm text-muted-foreground">
                      Отговори на 3 кратки въпроса и получи моментален риск-анализ
                      за <strong className="text-foreground">{docKindLabel}</strong>.
                    </p>
                    <button
                      type="button"
                      disabled={analyzing}
                      onClick={() => runAnalyze("interview")}
                      className="btn-gold btn-sheen btn-press w-full rounded-xl py-3 text-[15px] font-semibold"
                    >
                      Започни интервюто →
                    </button>
                  </div>
                )}
              </div>

              {analyzing && (
                <div className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-gold" />
                  Анализираме клаузите…
                </div>
              )}
            </div>
          ) : (
            <ResultPanel session={session} onPaywall={goToPaywall} onRestart={() => setSession(null)} />
          )}
        </section>
      </main>
    </>
  );
}

function ResultPanel({
  session,
  onPaywall,
  onRestart,
}: {
  session: AnalysisSession;
  onPaywall: () => void;
  onRestart: () => void;
}) {
  const premiumCount = session.risks.filter((r) => r.premium).length;
  const freeRisk = session.risks.find((r) => !r.premium)!;

  // Live countdown to session expiry
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remainingMs = Math.max(0, session.expiresAt - now);
  const hh = Math.floor(remainingMs / 3_600_000);
  const mm = Math.floor((remainingMs % 3_600_000) / 60_000);
  const ss = Math.floor((remainingMs % 60_000) / 1000);

  return (
    <div className="mt-8 space-y-5">
      {/* Hero summary */}
      <div className="rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-card/80 to-card/60 p-5 shadow-elegant sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
              Резултат от анализа
            </p>
            <h2 className="mt-1 font-serif text-2xl font-bold leading-tight sm:text-3xl">
              Открихме <span className="text-gold">{session.risks.length} риска</span>{" "}
              в твоя {session.documentKind?.toLowerCase()}
            </h2>
          </div>
          <RiskScoreBadge score={session.score} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          По-внимателно от 73% от анализираните договори в твоята категория.
          Запазваме този анализ за{" "}
          <span className="tabular-nums font-semibold text-gold">
            {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}:
            {String(ss).padStart(2, "0")}
          </span>
          .
        </p>
      </div>

      {/* Free risk (full reveal) */}
      <article className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-5 shadow-soft sm:p-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400">
            <Sparkles className="h-3 w-3" /> Безплатно
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Риск 1 от {session.risks.length}
          </span>
        </div>
        <h3 className="mt-2 font-serif text-lg font-bold leading-snug text-foreground">
          {freeRisk.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{freeRisk.body}</p>
      </article>

      {/* Blurred premium risks */}
      <div className="relative">
        <div className="space-y-3" aria-hidden="true">
          {session.risks
            .filter((r) => r.premium)
            .map((r) => (
              <article
                key={r.id}
                className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-soft"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]",
                      r.severity === "high"
                        ? "bg-destructive/15 text-destructive"
                        : r.severity === "medium"
                        ? "bg-gold/15 text-gold"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {r.severity === "high"
                      ? "Висок риск"
                      : r.severity === "medium"
                      ? "Среден"
                      : "Нисък"}
                  </span>
                </div>
                <h3 className="mt-2 select-none font-serif text-lg font-bold leading-snug text-foreground blur-md">
                  {r.title}
                </h3>
                <p className="mt-2 select-none text-sm leading-relaxed text-muted-foreground blur-sm">
                  {r.body}
                </p>
              </article>
            ))}
        </div>

        {/* Paywall overlay */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
          <div className="mx-auto max-w-lg rounded-2xl border border-gold/40 bg-card/95 p-6 text-center shadow-elegant backdrop-blur-sm">
            <Lock className="mx-auto h-7 w-7 text-gold" />
            <h3 className="mt-2 font-serif text-xl font-bold">
              Отключи още {premiumCount} риска
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Регистрирай се безплатно и виж пълния анализ + AI препоръки за
              корекция.
            </p>
            <div className="mt-4">
              <PrimaryCTA step={3} overrideLabel="Започни безплатно — отключи всичко" />
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Препоръчан план:{" "}
              <span className="font-semibold text-gold">
                {session.recommendedPlan === "entrepreneur"
                  ? "Предприемач"
                  : session.recommendedPlan === "professional"
                  ? "Професионалист"
                  : "Безплатен"}
              </span>{" "}
              · 7 дни trial без карта
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl pt-2">
        <RoiCalculator />
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="mx-auto block text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-gold"
      >
        ← Анализирай нов документ
      </button>
    </div>
  );
}


function RiskScoreBadge({ score }: { score: number }) {
  const color =
    score >= 60 ? "text-destructive" : score >= 30 ? "text-gold" : "text-emerald-400";
  const ring =
    score >= 60
      ? "border-destructive/50"
      : score >= 30
      ? "border-gold/50"
      : "border-emerald-500/50";
  return (
    <div
      className={cn(
        "flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 bg-background/60 shadow-soft",
        ring,
      )}
      aria-label={`Риск скор ${score} от 100`}
    >
      <span className={cn("font-serif text-xl font-bold tabular-nums", color)}>
        {score}
      </span>
      <span className="text-[8px] uppercase tracking-[0.18em] text-muted-foreground">
        Риск
      </span>
    </div>
  );
}
