/**
 * /admin/scorecard — „Табло за растеж" (само за администратори).
 *
 * Показва САМО агрегатния отговор на RPC `public.owner_scorecard`. Няма
 * резервен път към `metrics_overview` и няма клиентски заявки към таблици със
 * сурови редове. Никакви лични данни, платежни редове или идентификатори.
 *
 * Достъп: изричен `has_role(user.id, 'admin')` (модератори са отказани),
 * fail-closed при грешка, и данните се зареждат само вътре в `AdminMFAGuard`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { AdminMFAGuard } from "@/components/admin/AdminMFAGuard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, ArrowLeft, Loader2, RefreshCw } from "@/icons";
import { cn } from "@/lib/utils";
import {
  FUNNEL_STAGE_KEYS,
  PURCHASE_KIND_KEYS,
  SCORECARD_RANGE_DAYS,
  SUBSCRIBER_GOAL,
  WEEKLY_PACE_REFERENCE,
  classifyScorecardError,
  computeCoverage,
  formatBgDateTime,
  formatCoveredDays,
  parseOwnerScorecard,
  weeklyPace,
  type FunnelStageKey,
  type OwnerScorecard,
  type PurchaseKindKey,
  type ScorecardErrorKind,
  type ScorecardRangeKey,
} from "@/lib/ownerScorecard";

/**
 * Минимален локален типов мост: генерираните типове на базата още не съдържат
 * `owner_scorecard`, защото функцията не е инсталирана. Без `any` и без
 * регенериране на типовете.
 */
interface OwnerScorecardRpcArgs {
  _from: string;
  _to: string;
}
interface OwnerScorecardRpcResult {
  data: unknown;
  error: unknown;
}
interface OwnerScorecardRpcClient {
  rpc: (fn: "owner_scorecard", args: OwnerScorecardRpcArgs) => PromiseLike<OwnerScorecardRpcResult>;
}
const ownerScorecardRpc = supabase as unknown as OwnerScorecardRpcClient;

const RANGE_LABEL: Record<ScorecardRangeKey, string> = {
  "7d": "7 дни",
  "30d": "30 дни",
  "90d": "90 дни",
};

const FUNNEL_LABEL: Record<FunnelStageKey, string> = {
  doc_start: "Започнат документ",
  result_viewed: "Видян резултат",
  signup_or_claim: "Регистрация или запазване на чернова",
  checkout_started: "Започнато плащане",
  confirmed_checkout_return: "Връщане след checkout",
  doc_download_success: "Успешно изтегляне",
};

const PURCHASE_KIND_LABEL: Record<PurchaseKindKey, string> = {
  team: "Екип",
  subscription: "Абонамент",
  strict_unlock: "Отключен строг документ",
  branding: "Брандиране",
  entry_pack: "Пакет за конкретен документ",
  topup: "Допълнителни действия",
  one_time: "Еднократна покупка",
  unknown: "Некласифицирано",
};

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-hairline bg-card/70 p-5", className)}>
      <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-serif text-2xl text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-hairline bg-muted/40 p-4 text-sm text-muted-foreground">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
      <div>{children}</div>
    </div>
  );
}

function num(value: number): string {
  return value.toLocaleString("bg-BG");
}

interface ScorecardResult {
  /** Ключ на заявката: потребител + избран период + брояч на обновяванията. */
  key: string;
  card: OwnerScorecard | null;
  error: ScorecardErrorKind | null;
}

/** Съдържанието с данни се рендерира само вътре в AdminMFAGuard. */
function ScorecardContent({ userId }: { userId: string }) {
  const [range, setRange] = useState<ScorecardRangeKey>("90d");
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<ScorecardResult | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const requestRef = useRef(0);

  // Данните са валидни само за точния ключ на текущата заявка. Смяна на период
  // или обновяване веднага скрива предишните числа, още преди новия отговор.
  const requestKey = `${userId}|${range}|${nonce}`;
  const current = result && result.key === requestKey ? result : null;
  const card = current?.card ?? null;
  const errorKind = current?.error ?? null;
  const loading = current === null;

  useEffect(() => {
    const requestId = ++requestRef.current;
    const key = requestKey;
    const settle = (next: Omit<ScorecardResult, "key">) => {
      // Изостаналите отговори не пренаписват по-новото състояние.
      if (requestId !== requestRef.current) return;
      setResult({ key, ...next });
    };
    const to = new Date();
    const from = new Date(to.getTime() - SCORECARD_RANGE_DAYS[range] * 86_400_000);
    // Promise.resolve().then(...) улавя и синхронни изключения от клиента.
    Promise.resolve()
      .then(() => ownerScorecardRpc.rpc("owner_scorecard", { _from: from.toISOString(), _to: to.toISOString() }))
      .then(({ data, error }) => {
        if (error) {
          settle({ card: null, error: classifyScorecardError(error) });
          return;
        }
        const parsed = parseOwnerScorecard(data);
        if (!parsed) {
          settle({ card: null, error: "generic" });
          return;
        }
        if (requestId !== requestRef.current) return;
        setRefreshedAt(new Date().toISOString());
        settle({ card: parsed, error: null });
      })
      .catch(() => {
        // Отхвърлено обещание също трябва да завърши в състояние с повторен опит.
        settle({ card: null, error: "generic" });
      });
    return () => {
      // Всяка смяна на период, потребител или обновяване обезсилва предишния отговор.
      requestRef.current += 1;
    };
  }, [requestKey, range]);

  const coverage = useMemo(() => (card ? computeCoverage(card) : null), [card]);
  const pace = useMemo(
    () => (card && coverage ? weeklyPace(card.paymentTruth.newProvenPayersPeriod, coverage.coveredDays) : null),
    [card, coverage],
  );

  const cutoverText = card ? formatBgDateTime(card.paymentTruthCutover) : null;
  const refreshedText = formatBgDateTime(refreshedAt);

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin">
            <ArrowLeft className="mr-2 h-4 w-4" /> Админ
          </Link>
        </Button>
        <h1 className="font-serif text-2xl font-bold">Табло за растеж</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(RANGE_LABEL) as ScorecardRangeKey[]).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={key === range ? "default" : "outline"}
            aria-pressed={key === range}
            onClick={() => setRange(key)}
          >
            {RANGE_LABEL[key]}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => setNonce((n) => n + 1)} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" /> Обнови
        </Button>
        <p className="text-xs text-muted-foreground">
          Избран период: {RANGE_LABEL[range]}
          {refreshedText ? ` · Последно успешно обновяване: ${refreshedText}` : " · Още няма успешно обновяване"}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-gold" /> Зареждане на данните…
        </div>
      ) : null}

      {!loading && errorKind === "permission" ? (
        <Notice>Нямате право да виждате това табло.</Notice>
      ) : null}

      {!loading && errorKind === "missing_function" ? (
        <Notice>
          Справката още не е инсталирана в базата. Таблото очаква одобрение и внедряване на агрегатната
          функция. Това не означава нулеви данни.
        </Notice>
      ) : null}

      {!loading && errorKind === "generic" ? (
        <div className="space-y-3">
          <Notice>
            Данните не могат да бъдат заредени в момента. Това е грешка при зареждането, а не липса на
            данни.
          </Notice>
          <Button size="sm" variant="outline" onClick={() => setNonce((n) => n + 1)}>
            Опитай отново
          </Button>
        </div>
      ) : null}

      {!loading && !errorKind && card ? (
        <div className="space-y-6">
          <Card title="Цел: 60 абоната">
            <p className="text-sm text-foreground">
              Текущ брой: предстои потвърждение
            </p>
            <p className="text-xs text-muted-foreground">
              Тази справка не съдържа броя на активните абонати. Той се проверява отделно в списъка с
              абонаменти. Целта е {num(SUBSCRIBER_GOAL)} абоната.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/subscriptions">Виж абонаментите</Link>
            </Button>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card title="Период">
              <Metric label="Нови платили клиенти" value={num(card.paymentTruth.newProvenPayersPeriod)} />
              <Metric label="Потвърдени покупки" value={num(card.paymentTruth.automatedProvenOrdersPeriod)} />
            </Card>
            <Card title="От началото на надеждното измерване">
              <Metric
                label="Платили клиенти от началото на надеждното измерване"
                value={num(card.paymentTruth.provenPayersTotal)}
                hint="Платените покупки може да са еднократни или абонаменти. Това не са активни абонати."
              />
              {cutoverText ? (
                <p className="text-[11px] text-muted-foreground">
                  Надеждното измерване на плащанията започва на {cutoverText}
                </p>
              ) : null}
            </Card>
            <Card title="Оперативно темпо">
              {pace === null ? (
                <p className="text-sm text-muted-foreground">
                  Периодът е покрит по-малко от 7 дни, затова темпо не се изчислява и не се прогнозира.
                </p>
              ) : (
                <Metric
                  label="Нови платили клиенти на седмица"
                  value={pace.toLocaleString("bg-BG")}
                  hint={`Оперативен ориентир: ${num(WEEKLY_PACE_REFERENCE)} на седмица. Това е работен ритъм, а не целта за абонати, и не дава срок за нейното достигане.`}
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                Покрит период: {formatCoveredDays(coverage?.coveredDays ?? null)}
              </p>
            </Card>
          </div>

          <Card title="Обеми по стъпки">
            <p className="text-xs text-muted-foreground">
              Броят сесии по стъпки не доказва преминаване на едни и същи хора през целия процес.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Обеми на сесиите по стъпки за избрания период</caption>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">Стъпка</th>
                    <th scope="col" className="py-2 font-medium">Отделни сесии</th>
                  </tr>
                </thead>
                <tbody>
                  {FUNNEL_STAGE_KEYS.map((key) => (
                    <tr key={key} className="border-t border-hairline">
                      <td className="py-2 pr-4">{FUNNEL_LABEL[key]}</td>
                      <td className="py-2 tabular-nums">{num(card.funnel[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              „Връщане след checkout" е събитие от браузъра на клиента и е отделно от потвърдените
              покупки.
            </p>
          </Card>

          <Card title="Контекст на трафика">
            {card.trafficContext.trackedSessions === 0 && card.trafficContext.pageviews === 0 ? (
              <p className="text-sm text-muted-foreground">Няма отчетени събития за периода</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Metric label="Проследени сесии" value={num(card.trafficContext.trackedSessions)} />
                <Metric label="Прегледи" value={num(card.trafficContext.pageviews)} />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Отчита се само при дадено съгласие, затова покритието е непълно. Това не са уникални
              посетители.
            </p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Първа покупка на новите платили клиенти">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Абонамент" value={num(card.firstPurchaseCohorts.firstModeSubscriptionPeriod)} />
                <Metric label="Еднократно" value={num(card.firstPurchaseCohorts.firstModeOneTimePeriod)} />
                <Metric label="Некласифицирано" value={num(card.firstPurchaseCohorts.firstModeUnknownPeriod)} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Числата по-долу са за целия период от началото на надеждното измерване и не се съотнасят
                към данните за избрания период.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric
                  label="Започнали с еднократна покупка (от началото на надеждното измерване)"
                  value={num(card.firstPurchaseCohorts.oneTimeFirstTotal)}
                />
                <Metric
                  label="От еднократно към абонамент (от началото на надеждното измерване)"
                  value={num(card.firstPurchaseCohorts.oneOffToSubscriptionTotal)}
                />
              </div>
            </Card>

            <Card title="Потвърдени покупки по вид">
              <ul className="divide-y divide-hairline text-sm">
                {PURCHASE_KIND_KEYS.map((key) => (
                  <li key={key} className="flex items-baseline justify-between py-2">
                    <span className="text-muted-foreground">{PURCHASE_KIND_LABEL[key]}</span>
                    <span className="tabular-nums">{num(card.purchaseKinds[key])}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card title="Историческа основа">
            <Metric
              label="Стари абонаменти в Stripe (непотвърдено плащане)"
              value={num(card.paymentTruth.legacySubscriptionUsersUnverified)}
            />
            {!card.paymentTruth.historicalPaymentBaselineVerified ? (
              <p className="text-xs text-muted-foreground">
                Историческата основа не е потвърдена и затова НЕ е включена в общия брой платили клиенти.
                Липсата на потвърдени покупки след началото на надеждното измерване не означава, че не е
                имало клиенти преди това.
              </p>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminScorecard() {
  const { user, loading } = useAuth();
  const [role, setRole] = useState<{ uid: string; allowed: boolean } | null>(null);

  useEffect(() => {
    if (loading) return;
    const uid = user?.id;
    if (!uid) {
      setRole(null);
      return;
    }
    let cancelled = false;
    // Ролята е обвързана с текущия потребител: смяна на профил не показва кеш.
    setRole(null);
    supabase
      .rpc("has_role", { _user_id: uid, _role: "admin" })
      .then(({ data, error }) => {
        if (cancelled) return;
        // Fail-closed: всяка грешка означава отказ.
        setRole({ uid, allowed: !error && data === true });
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);

  const allowed = user && role && role.uid === user.id ? role.allowed : null;

  if (loading || (user && allowed === null)) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!user || allowed !== true) {
    return (
      <div className="min-h-dvh bg-background">
        <Seo title="Табло за растеж" description="Административно табло за растеж." noindex />
        <Header />
        <div className="container py-20 text-center">
          <h1 className="mb-2 font-serif text-2xl font-bold">Достъпът е отказан</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Таблото е достъпно само за администратори.
          </p>
          <Button asChild variant="outline">
            <Link to="/">Начало</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <Seo title="Табло за растеж" description="Административно табло за растеж." noindex />
      <Header />
      <AdminMFAGuard>
        <ScorecardContent userId={user.id} />
      </AdminMFAGuard>
    </div>
  );
}
