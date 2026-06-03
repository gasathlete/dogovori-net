/**
 * SplitWizard — graph-driven wizard with the legacy visual language.
 *
 * Layout: two-column grid (matches the legacy /wizard/:sector page).
 *  - LEFT  : one question per step, "ВЪПРОС X / N" badge, gold gradient CTA.
 *  - RIGHT : sticky "Работен документ" preview, serif body, centered title.
 *
 * Logic is driven by the resolved question graph + conditional clause engine.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraphQuestionField } from "./GraphQuestionField";
import { assembleDocument, diffInclusion, type ClauseDefinition } from "@/lib/clauseEngine";
import { pruneAnswers, resolveGraph, type QuestionGraph } from "@/lib/questionGraph";
import type { Ctx } from "@/lib/expressionEvaluator";
import {
  AlertCircle, CheckCircle2, Sparkles, Eye, EyeOff,
  ArrowLeft, ArrowRight, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  graph: QuestionGraph;
  clauses: ClauseDefinition[];
  initialAnswers?: Ctx;
  storageKey?: string;
  onComplete?: (payload: { answers: Ctx; body_md: string }) => void;
  ctaLabel?: string;
  /** Called whenever step/progress changes; lets the page render legacy chrome. */
  onProgress?: (info: { stepIdx: number; total: number; progress: number }) => void;
  /** Slot rendered above the question card (used for RiskMeter in legacy chrome). */
  leftHeader?: React.ReactNode;
}

const DIFF_TTL_MS = 2500;

export function SplitWizard({
  graph, clauses, initialAnswers, storageKey, onComplete,
  ctaLabel = "Финализирай документа",
  onProgress, leftHeader,
}: Props) {
  const persistKey = storageKey ?? `splitwizard:${graph.template_slug}`;

  const [answers, setAnswers] = useState<Ctx>(() => {
    if (initialAnswers) return initialAnswers;
    try {
      const raw = localStorage.getItem(persistKey);
      return raw ? (JSON.parse(raw) as Ctx) : {};
    } catch { return {}; }
  });
  const [showExcluded, setShowExcluded] = useState(false);
  const [diffHighlight, setDiffHighlight] = useState<{ added: Set<string>; removed: Set<string> }>(
    { added: new Set(), removed: new Set() },
  );
  const prevAnswersRef = useRef<Ctx>(answers);
  const diffTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try { localStorage.setItem(persistKey, JSON.stringify(answers)); } catch { /* noop */ }
  }, [answers, persistKey]);

  const resolved = useMemo(() => resolveGraph(graph, answers), [graph, answers]);
  const assembled = useMemo(() => assembleDocument(clauses, answers), [clauses, answers]);

  // Diff pulse for clause add/remove between answer changes.
  useEffect(() => {
    const { added, removed } = diffInclusion(clauses, prevAnswersRef.current, answers);
    if (added.length || removed.length) {
      setDiffHighlight({ added: new Set(added), removed: new Set(removed) });
      if (diffTimerRef.current) window.clearTimeout(diffTimerRef.current);
      diffTimerRef.current = window.setTimeout(() => {
        setDiffHighlight({ added: new Set(), removed: new Set() });
      }, DIFF_TTL_MS);
    }
    prevAnswersRef.current = answers;
    return () => {
      if (diffTimerRef.current) window.clearTimeout(diffTimerRef.current);
    };
  }, [answers, clauses]);

  const setAnswer = (id: string, value: unknown) => {
    setAnswers((prev) => pruneAnswers(graph, { ...prev, [id]: value }));
  };

  // ---- Step = single active question (legacy "Въпрос X / N" UX) ---------
  const total = resolved.active.length;
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    if (stepIdx > Math.max(0, total - 1)) setStepIdx(Math.max(0, total - 1));
  }, [total, stepIdx]);
  useEffect(() => {
    onProgress?.({ stepIdx: Math.min(stepIdx, Math.max(total - 1, 0)), total, progress: resolved.progress });
  }, [stepIdx, total, resolved.progress, onProgress]);

  const current = resolved.active[stepIdx];
  const currentSection = useMemo(
    () => graph.sections.find((s) => s.id === current?.section),
    [graph.sections, current?.section],
  );

  const isLast = stepIdx === total - 1;
  const canAdvance = !current?.required || !resolved.missingRequired.includes(current.id);

  const handleNext = () => {
    if (!canAdvance) return;
    if (isLast) {
      if (!resolved.isComplete) return;
      const cleaned = pruneAnswers(graph, answers);
      const finalDoc = assembleDocument(clauses, cleaned);
      onComplete?.({ answers: cleaned, body_md: finalDoc.body_md });
      return;
    }
    setStepIdx((i) => i + 1);
  };

  const handleBack = () => setStepIdx((i) => Math.max(0, i - 1));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* LEFT — interview ------------------------------------------------ */}
      <section className="space-y-5">
        <div className="rounded-xl border border-border/60 bg-gradient-card p-6 shadow-soft animate-fade-in">
          {/* Heading */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gold">
              <span>Въпрос {Math.min(stepIdx + 1, Math.max(total, 1))}</span>
              <span className="text-muted-foreground">/ {Math.max(total, 1)}</span>
            </div>
            {currentSection && (
              <Badge variant="outline" className="border-gold/30 text-[10px] uppercase tracking-wider text-gold/90">
                {currentSection.title}
              </Badge>
            )}
          </div>

          {/* Progress */}
          <div className="mb-5 flex items-center gap-3">
            <Progress value={resolved.progress} className="h-1.5 flex-1" />
            <span className="text-xs tabular-nums text-muted-foreground">{resolved.progress}%</span>
          </div>

          {/* Question */}
          {current ? (
            <GraphQuestionField
              q={current}
              value={answers[current.id]}
              onChange={(v) => setAnswer(current.id, v)}
              invalid={current.required && resolved.missingRequired.includes(current.id)}
            />
          ) : (
            <p className="text-sm italic text-muted-foreground">Няма активни въпроси.</p>
          )}

          {/* Footer status */}
          {!resolved.isComplete && resolved.missingRequired.length > 0 && (
            <p className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" />
              Остават {resolved.missingRequired.length} задължителни въпроса.
            </p>
          )}
          {resolved.isComplete && (
            <p className="mt-5 flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Готови сте да продължите.
            </p>
          )}

          {/* Nav */}
          <div className="mt-8 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={stepIdx === 0}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Назад
            </Button>
            {isLast ? (
              <Button
                onClick={handleNext}
                disabled={!resolved.isComplete}
                size="lg"
                className="bg-gradient-gold text-navy shadow-gold hover:shadow-[0_15px_50px_-10px_hsl(43_55%_54%_/_0.5)]"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {ctaLabel}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={!canAdvance}
                className="bg-gradient-gold text-navy hover:shadow-gold"
              >
                Напред <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* RIGHT — live preview ------------------------------------------- */}
      <section className="lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold">
            <FileText className="h-3.5 w-3.5" />
            Работен документ
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Актуализация в реално време
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowExcluded((v) => !v)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-gold"
              title={showExcluded ? "Скрий изключените клаузи" : "Покажи изключените клаузи"}
            >
              {showExcluded ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card shadow-soft">
          {assembled.unfilledTokens.length > 0 && (
            <div className="m-4 rounded-md border border-amber-300/40 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-200">
              Незапълнени полета: {assembled.unfilledTokens.slice(0, 8).join(", ")}
              {assembled.unfilledTokens.length > 8 && ` … +${assembled.unfilledTokens.length - 8}`}
            </div>
          )}

          <article className="mx-auto max-w-[640px] px-6 py-8 font-serif text-[15px] leading-relaxed text-foreground/90 sm:px-10 sm:py-10">
            <h1 className="mb-8 text-center font-serif text-2xl font-bold uppercase tracking-wide">
              {graph.title}
            </h1>

            {assembled.clauses.length === 0 && (
              <p className="text-center text-sm italic text-muted-foreground">
                Започнете да отговаряте на въпросите, за да видите документа.
              </p>
            )}

            <div className="space-y-5">
              {assembled.clauses.map((c, idx) => {
                const isAdded = diffHighlight.added.has(c.clause_id);
                return (
                  <section
                    key={c.clause_id}
                    className={cn(
                      "rounded-md px-2 py-1 transition-colors",
                      isAdded && "bg-emerald-100/60 ring-1 ring-emerald-300/60 dark:bg-emerald-950/30",
                    )}
                  >
                    {c.title && (
                      <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-foreground">
                        {idx + 1}. {c.title}
                      </h3>
                    )}
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </section>
                );
              })}
            </div>

            {showExcluded && assembled.excluded.length > 0 && (
              <div className="mt-8 space-y-3 border-t border-border/60 pt-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Изключени клаузи ({assembled.excluded.length})
                </p>
                {assembled.excluded.map((c) => {
                  const wasRemoved = diffHighlight.removed.has(c.clause_id);
                  return (
                    <section
                      key={c.clause_id}
                      className={cn(
                        "rounded-md px-2 py-1 opacity-50 transition-colors",
                        wasRemoved && "bg-rose-100/60 opacity-100 ring-1 ring-rose-300/60 dark:bg-rose-950/30",
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">изключена</Badge>
                        {c.title && <span className="text-[11px] font-medium">{c.title}</span>}
                      </div>
                      <p className="whitespace-pre-wrap text-xs italic text-muted-foreground">{c.body}</p>
                    </section>
                  );
                })}
              </div>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
