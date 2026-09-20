import { forwardRef, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  AlertTriangle, BadgeCheck, Bot, CheckCircle2, Info, RefreshCcw, Scale, Sparkles,
} from "@/icons";
import { Button } from "@/components/ui/button";
import {
  contractToPlainText, reviewDocument, type DocumentReview,
} from "@/lib/documentReview";
import {
  assessReviewTrust, canShowReady, completenessNotice,
  type ReviewContextInput,
} from "@/lib/reviewSnapshot";
import { useReviewLifecycle } from "@/hooks/useReviewLifecycle";
import { useAuth } from "@/hooks/useAuth";
import { isPersonalDataPlaceholder } from "@/lib/placeholderGate";
import { trackQualityReview, trackQualityReviewFail } from "@/lib/metrics";

/**
 * „Автоматична AI ревизия" — втори независим проход върху готовия документ.
 *
 * Резултатът се показва САМО когато носи отпечатъка на ТОЧНО този текст и е от
 * последно стартираната заявка. Промяна на документа, нова заявка или изход от
 * екрана обезсилват закъснял отговор.
 */

interface Props {
  contract: {
    title?: string;
    preamble?: string;
    clauses?: Array<{ number?: string; title?: string; body?: string }>;
    closing?: string;
  };
  documentType?: string;
  /** Версия на генерирания документ, ако потокът я знае. */
  documentVersion?: string;
  /** Минимален изричен контекст от реалния поток на генератора. */
  reviewContext?: ReviewContextInput | null;
  /** Стартира ревизията автоматично при монтиране (по подразбиране: да). */
  auto?: boolean;
  /**
   * Потребителят е потвърдил, че ще попълни личните данни след сваляне —
   * ревизията анализира само генерираното съдържание.
   */
  ignorePersonalData?: boolean;
  /**
   * Q4a — подписан манифест за качество за ТОЧНО този документ. Подава се само
   * ако не е остарял след редакция; иначе се пропуска и документът се ревизира
   * като външен.
   */
  qualityManifest?: unknown;
  /**
   * ЕДНОКРАТЕН пропуск, ИЗДАДЕН ОТ СЪРВЪРА при изготвянето на този документ.
   * Браузърът само го препраща непроменен — не може да си издаде достъп сам.
   */
  reviewGrant?: unknown;
  /** Запазен документ, чиято собственост сървърът проверява сам. */
  savedDocumentId?: string;
  /** Конкретна версия на запазения документ, ако потокът я знае. */
  savedDocumentVersionNo?: number;
}

const VERDICT = {
  ready: {
    label: "Документът преминава автоматичната ревизия",
    tone: "border-success/30 bg-success/5",
    text: "text-success",
    Icon: BadgeCheck,
  },
  needs_fixes: {
    label: "Ревизията откри места за прецизиране",
    tone: "border-warning/30 bg-warning/5",
    text: "text-warning",
    Icon: AlertTriangle,
  },
  blocked: {
    label: "Ревизията не може да потвърди документа",
    tone: "border-danger/30 bg-danger/5",
    text: "text-danger",
    Icon: AlertTriangle,
  },
} as const;

const STATUS_ICON = {
  pass: { Icon: CheckCircle2, cls: "text-success" },
  warn: { Icon: Info, cls: "text-warning" },
  fail: { Icon: AlertTriangle, cls: "text-danger" },
} as const;

export function AIReviewCard({
  contract,
  documentType,
  documentVersion,
  reviewContext = null,
  auto = true,
  ignorePersonalData = false,
  qualityManifest = null,
  reviewGrant = null,
  savedDocumentId,
  savedDocumentVersionNo,
}: Props) {
  const { user } = useAuth();
  const userScope = user?.id ?? "";
  const text = useMemo(() => contractToPlainText(contract), [contract]);

  const input = useMemo(
    () => ({
      documentText: text,
      documentTitle: contract.title,
      documentType,
      documentVersion,
      context: reviewContext,
      ignorePersonalData,
      userScope,
      ...(qualityManifest ? { qualityManifest } : {}),
      // Оторизацията е СЪРВЪРНА: пропуск, издаден при изготвянето, или запазен
      // документ, чиято собственост сървърът проверява сам.
      ...(reviewGrant ? { grant: reviewGrant } : {}),
      ...(savedDocumentId ? { document_id: savedDocumentId } : {}),
      ...(savedDocumentVersionNo ? { document_version_no: savedDocumentVersionNo } : {}),
    }),
    [
      text, contract.title, documentType, documentVersion, reviewContext,
      ignorePersonalData, userScope, qualityManifest, reviewGrant,
      savedDocumentId, savedDocumentVersionNo,
    ],
  );

  const life = useReviewLifecycle({ input, runner: reviewDocument, auto });
  const { loading, review, error, needsConfirm } = {
    loading: life.loading,
    review: life.review,
    error: life.error,
    needsConfirm: life.confirmationRequired,
  };
  const run = life.run;

  // Отчитаме резултата веднъж, когато вече е приет за текущата снимка.
  const trackedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (life.phase !== "done" && life.phase !== "error") return;
    if (trackedKeyRef.current === `${life.key}|${life.phase}`) return;
    trackedKeyRef.current = `${life.key}|${life.phase}`;
    if (life.review) {
      const r = life.review;
      trackQualityReview(
        {
          verdict: r.verdict,
          checksPass: (r.checks ?? []).filter((c) => c.status === "pass").length,
          checksTotal: (r.checks ?? []).length,
          missing: (r.missing_requisites ?? []).length,
          contradictions: (r.contradictions ?? []).length,
          unfilled: (r.unfilled_fields ?? []).length,
        },
        documentType,
      );
    } else if (life.phase === "error") {
      trackQualityReviewFail(life.confirmationRequired ? "confirmation_required" : "review_error");
    }
  }, [life.phase, life.key, life.review, life.confirmationRequired, documentType]);

  // Доверието се преценява СИНХРОННО: резултат от текущата снимка + точен отпечатък.
  const trust = review
    ? assessReviewTrust({
        responseSource: review.source ?? null,
        expectedDigest: life.requestedDigest ?? "",
        currentInput: true,
      })
    : null;
  const showVerdict = !!trust?.showVerdict;
  const staleNotice = life.stale
    ? "Документът е променен след последната проверка. Предишният резултат не се отнася за текущия текст — направете нова проверка."
    : null;
  const notice = review ? trust?.notice ?? null : staleNotice;
  const completeness = review?.completeness ?? null;
  const completeNote = review ? completenessNotice(completeness) : null;

  const verdictKey =
    review && showVerdict
      ? canShowReady({ verdict: review.verdict, completeness, trust: "verified" })
        ? "ready"
        : review.verdict === "blocked"
          ? "blocked"
          : "needs_fixes"
      : null;
  const v = verdictKey ? VERDICT[verdictKey] : null;

  // Защитен филтър и на клиента: при потвърдена отметка полетата за лични
  // данни не се показват като пропуски.
  const visibleUnfilled = (review?.unfilled_fields ?? []).filter(
    (f) => !ignorePersonalData || !isPersonalDataPlaceholder(f),
  );



  return (
    <div className="rounded-xl border border-border/60 bg-gradient-card p-6 shadow-soft">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 text-[10px] uppercase tracking-wider text-gold">
            <Sparkles className="h-3 w-3" /> Втори автоматичен проход
          </div>
          <h3 className="font-serif text-lg font-bold">Автоматична AI ревизия</h3>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
            Независим модел преглежда готовия документ ред по ред — реквизити,
            вътрешни противоречия, непопълнени полета и приложими правни основания.
            Всяка проверка се изпълнява по един и същ начин при всеки документ.
          </p>
        </div>
        {!loading && (
          <Button variant="outline" size="sm" onClick={() => void run()} className="shrink-0">
            <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
            {review ? "Провери отново" : "Стартирай ревизия"}
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-3 rounded-lg border border-gold/30 bg-gold/5 p-4">
          <Bot className="h-4 w-4 flex-shrink-0 animate-pulse text-gold" />
          <div className="text-sm">
            <div className="font-medium text-foreground">Ревизията е в ход…</div>
            <div className="text-xs text-muted-foreground">
              Съпоставяме документа със задължителните реквизити и приложимите норми.
            </div>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs text-muted-foreground">
          Ревизията не можа да бъде извършена: {error}
          {needsConfirm && (
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => void run(true)}>
                Потвърждавам и продължавам
              </Button>
            </div>
          )}
        </div>
      )}

      {notice && (
        <div className="mb-3 rounded-lg border border-border/60 bg-card/50 p-3 text-xs text-muted-foreground">
          {notice}
        </div>
      )}

      {!loading && review && completeNote && (
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
          {completeNote}
        </div>
      )}

      {!loading && review && v && (

        <div className="space-y-4">
          <div className={`flex items-start gap-3 rounded-lg border p-4 ${v.tone}`}>
            <v.Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${v.text}`} />
            <div className="min-w-0">
              <div className={`text-sm font-semibold ${v.text}`}>{v.label}</div>
              {review.summary && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {review.summary}
                </p>
              )}
              {review.confidence > 0 && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Увереност на ревизията: <strong>{review.confidence}%</strong>
                </div>
              )}
            </div>
          </div>

          {review.checks.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {review.checks.map((c, i) => {
                const s = STATUS_ICON[c.status] ?? STATUS_ICON.warn;
                return (
                  <li
                    key={c.id ?? i}
                    className="flex gap-2 rounded-lg border border-border/60 bg-card/50 p-3"
                  >
                    <s.Icon className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${s.cls}`} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-foreground">{c.label}</div>
                      {c.note && (
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                          {c.note}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {review.missing_requisites.length > 0 && (
            <Block title="Липсващи реквизити" tone="warning">
              {review.missing_requisites.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </Block>
          )}

          {review.contradictions.length > 0 && (
            <Block title="Вътрешни противоречия" tone="danger">
              {review.contradictions.map((c, i) => (
                <li key={i}>
                  {c.detail}
                  {c.where && <span className="text-muted-foreground"> ({c.where})</span>}
                  {c.quote && (
                    <div className="mt-1 border-l-2 border-border/60 pl-2 text-[11px] italic text-muted-foreground">
                      „{c.quote}"
                    </div>
                  )}
                </li>
              ))}

            </Block>
          )}

          {visibleUnfilled.length > 0 && (
            <Block title="Непопълнени полета" tone="warning">
              {visibleUnfilled.map((f, i) => (
                <li key={i}><code className="text-[11px]">{f}</code></li>
              ))}
            </Block>
          )}

          {review.legal_basis.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-card/50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Scale className="h-4 w-4 text-gold" />
                <h4 className="text-sm font-semibold text-foreground">Приложими основания</h4>
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {review.legal_basis.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-gold">§</span>
                    <span>
                      <strong className="text-foreground">
                        {b.act}
                        {b.article ? `, ${b.article}` : ""}
                      </strong>
                      {b.why ? ` — ${b.why}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Ревизията е автоматична техническа проверка и не представлява правен съвет.
            При значими сделки се консултирайте с адвокат или нотариус.
          </p>
        </div>
      )}
    </div>
  );
}

const Block = forwardRef<
  HTMLDivElement,
  {
    title: string;
    tone: "warning" | "danger";
    children: ReactNode;
  }
>(function Block({ title, tone, children }, ref) {
  const cls =
    tone === "danger"
      ? "border-danger/30 bg-danger/5 text-danger"
      : "border-warning/30 bg-warning/5 text-warning";
  return (
    <div ref={ref} className={`rounded-lg border p-4 ${cls}`}>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">{children}</ul>
    </div>
  );
});
