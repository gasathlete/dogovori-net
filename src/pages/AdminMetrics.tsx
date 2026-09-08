/**
 * /admin/metrics — „Growth & Quality" табло.
 *
 * Обединява двете страни на едно продуктово решение:
 *  1) Конверсия — посетители → регистрации → документ → плащане.
 *  2) Качество (guardrails) — AI ревизия, блокирани непопълнени полета,
 *     провали при генериране, завършени подписвания, обратна връзка.
 *
 * Целта: всяка оптимизация за конверсия да се чете заедно с ефекта ѝ върху
 * качеството, за да не растат приходите за сметка на юридическата стойност.
 *
 * Данните идват от public.metrics_overview / metrics_event_timeseries
 * (staff-only SECURITY DEFINER, агрегирани, без лични данни).
 */
import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, TrendingUp, ShieldCheck } from "@/icons";
import { cn } from "@/lib/utils";

type Range = "7d" | "30d" | "90d";

interface Overview {
  acquisition: { visitors: number; pageviews: number; signups: number; signup_rate: number };
  activation: { start: number; fill: number; generate: number; download: number; sign: number; start_to_download: number };
  continuity: {
    draft_created: number; draft_restore_offered: number; draft_restored: number;
    claim_started: number; claim_succeeded: number; claim_blocked: number; claim_success_rate: number;
    blocked_expired: number; blocked_already_claimed: number; blocked_invalid_token: number;
    blocked_network: number; draft_expired: number;
  };
  conversion: {
    plans_views: number; checkout_started: number; upgrade_completed: number;
    paid_subscriptions: number; visitor_to_paid: number; signup_to_paid: number; checkout_completion: number;
    /** Налично след прилагане на миграцията за checkout_failed — толерираме липсата. */
    checkout_failed?: number;
  };
  segments: { business: number; freelancer: number };
  quality: {
    reviews: number; avg_review_score: number; clean_review_rate: number;
    placeholder_blocks: number; corrections_applied: number;
    generate_started: number; generate_fail: number; generate_fail_rate: number;
    generate_blocked: number; generate_blocked_rate: number;
    signing_requests: number; signing_completed: number; signing_failed: number; signing_completion_rate: number;
    feedback_total: number; feedback_bugs: number; feedback_avg_rating: number;
  };
}

const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

function Kpi({
  label, value, suffix, hint, tone = "neutral",
}: {
  label: string; value: number | string; suffix?: string; hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good" ? "text-success" : tone === "warn" ? "text-warning" : tone === "bad" ? "text-danger" : "text-foreground";
  return (
    <div className="rounded-xl border border-hairline bg-card/70 p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-serif text-2xl", toneCls)}>
        {value}
        {suffix ? <span className="ml-1 text-sm text-muted-foreground">{suffix}</span> : null}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function FunnelBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{value} <span className="text-muted-foreground">· {pct}%</span></span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-gradient-brand transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AdminMetrics() {
  const [range, setRange] = useState<Range>("30d");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const to = new Date();
    const from = new Date(to.getTime() - RANGE_DAYS[range] * 86400000);
    supabase
      .rpc("metrics_overview", { _from: from.toISOString(), _to: to.toISOString() })
      .then(({ data: d, error }) => {
        if (cancelled) return;
        if (error) setErr(error.message);
        else setData(d as unknown as Overview);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [range]);

  const qualityIndex = useMemo(() => {
    if (!data) return 0;
    const q = data.quality;
    // Метрики без данни се пропускат, за да не изкривяват индекса надолу.
    const parts: number[] = [];
    if (q.reviews > 0) parts.push(q.avg_review_score, q.clean_review_rate);
    if (q.generate_started > 0) parts.push(100 - q.generate_fail_rate);
    if (q.signing_requests > 0) parts.push(q.signing_completion_rate);
    if (parts.length === 0) return 0;
    return Math.round(parts.reduce((x, y) => x + y, 0) / parts.length);
  }, [data]);

  const a = data?.activation;
  const maxStage = a ? Math.max(a.start, 1) : 1;

  return (
    <>
      <Seo title="Growth & Quality метрики — админ" description="Конверсия и качествени guardrails." noindex />
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl text-foreground">Growth &amp; Quality</h1>
            <p className="text-sm text-muted-foreground">
              Конверсия и качество в един изглед. Агрегирани данни, без лични данни.
            </p>
            <Link to="/admin/scorecard" className="mt-2 inline-block text-xs font-medium text-gold underline">
              Табло за растеж
            </Link>
          </div>
          <div className="flex gap-1 rounded-full border border-hairline bg-card/70 p-1">
            {(["7d", "30d", "90d"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  range === r ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r === "7d" ? "7 дни" : r === "30d" ? "30 дни" : "90 дни"}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Зареждане…
          </div>
        )}
        {err && (
          <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4" /> {err}
          </div>
        )}

        {data && !loading && (
          <div className="space-y-8">
            {/* North star */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Посетители" value={data.acquisition.visitors} hint={`${data.acquisition.pageviews} прегледа`} />
              <Kpi label="Регистрации" value={data.acquisition.signups} suffix={`· ${data.acquisition.signup_rate}%`} hint="от посетители" />
              <Kpi
                label="Платени абонаменти"
                value={data.conversion.paid_subscriptions}
                suffix={`· ${data.conversion.signup_to_paid}%`}
                hint="от регистрациите"
                tone={data.conversion.signup_to_paid >= 5 ? "good" : "warn"}
              />
              <Kpi
                label="Индекс качество"
                value={qualityIndex}
                suffix="/100"
                hint="ревизия · провали · подписи"
                tone={qualityIndex >= 85 ? "good" : qualityIndex >= 70 ? "warn" : "bad"}
              />
            </section>

            {/* Activation funnel */}
            <section className="rounded-2xl border border-hairline bg-card/60 p-5">
              <h2 className="mb-4 flex items-center gap-2 font-serif text-lg text-foreground">
                <TrendingUp className="h-4 w-4 text-brand" /> Документна фуния
              </h2>
              <div className="space-y-3">
                <FunnelBar label="Старт" value={a!.start} max={maxStage} />
                <FunnelBar label="Попълване" value={a!.fill} max={maxStage} />
                <FunnelBar label="Генериране" value={a!.generate} max={maxStage} />
                <FunnelBar label="Сваляне" value={a!.download} max={maxStage} />
                <FunnelBar label="Подпис" value={a!.sign} max={maxStage} />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Старт → Сваляне: <span className="font-semibold text-foreground">{a!.start_to_download}%</span>
              </p>
            </section>

            {/* Activation continuity (анонимна чернова → акаунт) */}
            {(() => {
              const c = data.continuity;
              if (!c) return null;
              return (
                <section className="rounded-2xl border border-hairline bg-card/60 p-5">
                  <h2 className="mb-4 font-serif text-lg text-foreground">Непрекъснатост на започнатия документ</h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Kpi label="Създадени чернови" value={c.draft_created} hint="анонимен старт" />
                    <Kpi label="Предложено възстановяване" value={c.draft_restore_offered} />
                    <Kpi label="Възстановени" value={c.draft_restored} />
                    <Kpi
                      label="Успешно присвояване"
                      value={c.claim_success_rate}
                      suffix="%"
                      hint={`${c.claim_succeeded} от ${c.claim_started} след вход`}
                      tone={c.claim_started === 0 ? "neutral" : c.claim_success_rate >= 95 ? "good" : c.claim_success_rate >= 85 ? "warn" : "bad"}
                    />
                    <Kpi label="Отказани · изтекла" value={c.blocked_expired} />
                    <Kpi label="Отказани · вече присвоена" value={c.blocked_already_claimed} />
                    <Kpi label="Отказани · невалиден ключ" value={c.blocked_invalid_token} tone={c.blocked_invalid_token > 0 ? "warn" : "neutral"} />
                    <Kpi label="Отказани · мрежа" value={c.blocked_network} />
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Ориентир: над 95% успешно присвояване. Черновите пазят само отговорите по документа,
                    без идентификация на потребителя. Непотърсените изтичат след 24 часа; присвоените, но
                    недовършени — след 30 дни. Готовият резултат се прехвърля в „Моите документи“ и
                    съдържанието на черновата се изчиства веднага след това. Тези показатели идват от
                    продуктовата фуния (без лични данни) и са отделни от доброволното маркетингово съгласие.
                  </p>
                </section>
              );
            })()}


            {/* Conversion */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Прегледи на планове" value={data.conversion.plans_views} />
              <Kpi label="Стартиран checkout" value={data.conversion.checkout_started} />
              <Kpi
                label="Завършен checkout"
                value={data.conversion.upgrade_completed}
                suffix={`· ${data.conversion.checkout_completion}%`}
                tone={data.conversion.checkout_completion >= 50 ? "good" : "warn"}
              />
              <Kpi
                label="Неуспешен checkout"
                value={data.conversion.checkout_failed ?? "—"}
                hint="сесията не беше създадена (без плащане)"
                tone={(data.conversion.checkout_failed ?? 0) > 0 ? "warn" : "neutral"}
              />
              <Kpi label="Посетител → платящ" value={data.conversion.visitor_to_paid} suffix="%" />
            </section>

            {/* Segments */}
            <section className="rounded-2xl border border-hairline bg-card/60 p-5">
              <h2 className="mb-3 font-serif text-lg text-foreground">Сегменти</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Kpi label="Малки фирми" value={data.segments.business} hint="уникални сесии" />
                <Kpi label="Фрийлансъри" value={data.segments.freelancer} hint="уникални сесии" />
              </div>
            </section>

            {/* Quality guardrails */}
            <section className="rounded-2xl border border-gold/30 bg-gold/5 p-5">
              <h2 className="mb-4 flex items-center gap-2 font-serif text-lg text-foreground">
                <ShieldCheck className="h-4 w-4 text-gold" /> Качествени предпазители
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  label="Средна оценка ревизия"
                  value={data.quality.avg_review_score}
                  suffix="/100"
                  hint={`${data.quality.reviews} ревизии`}
                  tone={data.quality.avg_review_score >= 85 ? "good" : data.quality.avg_review_score >= 70 ? "warn" : "bad"}
                />
                <Kpi label="Чисти документи" value={data.quality.clean_review_rate} suffix="%" hint="без открити пропуски" />
                <Kpi
                  label="Технически провали"
                  value={data.quality.generate_fail_rate}
                  suffix="%"
                  hint={`${data.quality.generate_fail} от ${data.quality.generate_started} опита`}
                  tone={data.quality.generate_fail_rate <= 5 ? "good" : data.quality.generate_fail_rate <= 15 ? "warn" : "bad"}
                />
                <Kpi
                  label="Прекъснати от преграда"
                  value={data.quality.generate_blocked_rate}
                  suffix="%"
                  hint={`${data.quality.generate_blocked} × потвърждение / лимит / вход`}
                />
                <Kpi label="Блокирани експорти" value={data.quality.placeholder_blocks} hint="непопълнени полета" />
                <Kpi label="Приложени корекции" value={data.quality.corrections_applied} />
                <Kpi
                  label="Завършени подписвания"
                  value={data.quality.signing_completion_rate}
                  suffix="%"
                  hint={`${data.quality.signing_completed} от ${data.quality.signing_requests}`}
                  tone={data.quality.signing_completion_rate >= 60 ? "good" : "warn"}
                />
                <Kpi label="Сигнали „бъг“" value={data.quality.feedback_bugs} hint={`${data.quality.feedback_total} общо`} tone={data.quality.feedback_bugs === 0 ? "good" : "warn"} />
                <Kpi label="Средна оценка от клиенти" value={data.quality.feedback_avg_rating} suffix="/5" />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Правило: ръст на конверсията се приема за успешен само ако индексът на качеството
                не спада спрямо предходния период.
              </p>
            </section>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Обработваме само псевдонимни, агрегирани технически събития (случаен идентификатор на
              сесия, тип документ, формат, резултат). Няма имена, имейли, съдържание на документи или
              IP адреси. Аналитичните събития се изпращат само след изрично съгласие за категория
              „аналитични бисквитки“ (чл. 6, § 1, буква „а“ GDPR).
            </p>
          </div>
        )}
      </main>
    </>
  );
}
