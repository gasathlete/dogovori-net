/**
 * SplitWizard — graph-driven wizard with the legacy visual language.
 *
 * Step granularity = SECTION (multiple visible questions per page),
 * matching the "Изготви документ" (BuildContract) UX.
 *
 * Layout: two-column grid.
 *  - LEFT  : section stepper + all visible questions in the current section,
 *            gold gradient CTA, back/next.
 *  - RIGHT : sticky "Работен документ" preview.
 *
 * Logic is driven by the resolved question graph + conditional clause engine.
 * Visibility & required-ness are re-evaluated on every change, so empty
 * sections collapse automatically and "Next" waits only for truly missing
 * required fields *in the current section*.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraphQuestionField } from "./GraphQuestionField";
import { assembleDocument, diffInclusion, type ClauseDefinition } from "@/lib/clauseEngine";
import { pruneAnswers, resolveGraph, resolveQuestionDefault, type QuestionGraph } from "@/lib/questionGraph";
import type { Ctx } from "@/lib/expressionEvaluator";
import {
  AlertCircle, CheckCircle2, Sparkles, Eye, EyeOff,
  ArrowLeft, ArrowRight, FileText, Check, Feather,
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
  /** Triggered by the fade-gate "или изтеглете като бланка" pill. */
  onDownloadBlank?: () => void;
  /** User's saved contacts — fed into party_list questions for one-click party fill. */
  contacts?: Array<{ id: string; name: string; type?: string }>;
}

const DIFF_TTL_MS = 2500;

/**
 * Скрива долната част на дълъг превю-документ зад градиент + лек blur.
 * Активира се докато документът не е окончателно завършен. Идентично с legacy LiveDraft.
 */
function PreviewFadeGate({
  children,
  active,
  onDownloadBlank,
}: {
  children: ReactNode;
  active: boolean;
  onDownloadBlank?: () => void;
}) {
  if (!active) return <>{children}</>;
  return (
    <div className="relative">
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[25%] rounded-b-md"
        style={{
          background:
            "linear-gradient(to bottom, hsl(var(--card) / 0) 0%, hsl(var(--card) / 0.55) 25%, hsl(var(--card) / 0.92) 55%, hsl(var(--card)) 75%, hsl(var(--card)) 100%)",
          backdropFilter: "blur(2px)",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,1) 100%)",
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,1) 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-[58%] flex flex-col items-center gap-2 px-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-gradient-gold px-5 py-2.5 text-sm font-semibold text-navy shadow-elegant">
          <Sparkles className="h-4 w-4" />
          Завършете въпросника, за да генерирате пълния документ
        </div>
        {onDownloadBlank && (
          <button
            type="button"
            onClick={onDownloadBlank}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-gold/40 bg-card/90 px-4 py-2 text-xs font-medium text-foreground shadow-sm backdrop-blur transition hover:bg-card hover:border-gold"
          >
            <Feather className="h-3.5 w-3.5 text-gold" />
            или изтеглете като бланка
          </button>
        )}
      </div>
    </div>
  );
}

export function SplitWizard({
  graph, clauses, initialAnswers, storageKey, onComplete,
  ctaLabel = "Финализирай документа",
  onProgress, leftHeader, onDownloadBlank, contacts,
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
  const assembled = useMemo(() => assembleDocument(clauses, answers, graph), [clauses, answers, graph]);

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

  // ---- Step = SECTION (legacy "Изготви документ" UX) -------------------
  const visibleSections = resolved.sections; // already filtered to sections with active qs
  const total = Math.max(visibleSections.length, 1);

  // Persist current section by id so it survives changes in visible set.
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(
    () => visibleSections[0]?.id ?? null,
  );
  useEffect(() => {
    if (!visibleSections.length) return;
    if (!currentSectionId || !visibleSections.some((s) => s.id === currentSectionId)) {
      setCurrentSectionId(visibleSections[0].id);
    }
  }, [visibleSections, currentSectionId]);

  const stepIdx = Math.max(
    0,
    visibleSections.findIndex((s) => s.id === currentSectionId),
  );
  const currentSection = visibleSections[stepIdx];

  // Per-section completion (for stepper tab states & next-enabled).
  const sectionStatus = useMemo(() => {
    const missingSet = new Set(resolved.missingRequired);
    return visibleSections.map((s) => {
      const requiredQs = s.questions.filter((q) => q.required);
      const missingCount = requiredQs.filter((q) => missingSet.has(q.id)).length;
      return {
        id: s.id,
        title: s.title,
        total: s.questions.length,
        required: requiredQs.length,
        missing: missingCount,
        complete: missingCount === 0,
      };
    });
  }, [visibleSections, resolved.missingRequired]);

  useEffect(() => {
    onProgress?.({ stepIdx, total, progress: resolved.progress });
  }, [stepIdx, total, resolved.progress, onProgress]);

  const isLast = stepIdx === total - 1;
  const canAdvance = currentSection ? sectionStatus[stepIdx]?.complete : false;

  // Show red highlighting on missing required fields after a failed Next attempt.
  const [attemptedNext, setAttemptedNext] = useState(false);
  useEffect(() => { setAttemptedNext(false); }, [currentSectionId]);
  const missingIds = useMemo(() => new Set(resolved.missingRequired), [resolved.missingRequired]);
  const missingInCurrent = useMemo(() => {
    if (!currentSection) return [] as { id: string; label: string }[];
    return currentSection.questions
      .filter((q) => q.required && missingIds.has(q.id))
      .map((q) => ({ id: q.id, label: q.label }));
  }, [currentSection, missingIds]);

  const goToSection = (idx: number) => {
    const target = visibleSections[idx];
    if (!target) return;
    setAttemptedNext(false);
    setCurrentSectionId(target.id);
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
  };

  const handleNext = () => {
    if (!canAdvance) {
      // Auto-accept suggested defaults for any missing required fields.
      const filled: Ctx = { ...answers };
      let appliedAny = false;
      let stillMissing = false;
      for (const m of missingInCurrent) {
        const q = currentSection?.questions.find((x) => x.id === m.id);
        if (!q) { stillMissing = true; continue; }
        const def = resolveQuestionDefault(q, filled);
        if (def == null || def === "") { stillMissing = true; continue; }
        filled[q.id] = def;
        appliedAny = true;
      }
      if (appliedAny && !stillMissing) {
        setAnswers(pruneAnswers(graph, filled));
        // Defer navigation until state propagates.
        setTimeout(() => {
          if (isLast) {
            const cleaned = pruneAnswers(graph, filled);
            const finalDoc = assembleDocument(clauses, cleaned);
            onComplete?.({ answers: cleaned, body_md: finalDoc.body_md });
          } else {
            goToSection(stepIdx + 1);
          }
        }, 0);
        return;
      }
      setAttemptedNext(true);
      const firstMissing = missingInCurrent[0]?.id;
      if (firstMissing) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`q-${firstMissing}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
      return;
    }
    if (isLast) {
      if (!resolved.isComplete) { setAttemptedNext(true); return; }
      const cleaned = pruneAnswers(graph, answers);
      const finalDoc = assembleDocument(clauses, cleaned);
      onComplete?.({ answers: cleaned, body_md: finalDoc.body_md });
      return;
    }
    goToSection(stepIdx + 1);
  };

  const handleBack = () => goToSection(Math.max(0, stepIdx - 1));

  // A section tab can be jumped to if it's already complete OR is one we've
  // passed. To keep things simple: complete sections are always clickable;
  // future incomplete sections require linear progression.
  const canJumpTo = (idx: number) => {
    if (idx <= stepIdx) return true;
    // allow jumping over sections that are already complete in order
    for (let i = 0; i < idx; i++) {
      if (!sectionStatus[i]?.complete) return false;
    }
    return true;
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* LEFT — interview ------------------------------------------------ */}
      <section className="space-y-5">
        {leftHeader}
        <div className="rounded-xl border border-border/60 bg-gradient-card p-6 shadow-soft animate-fade-in">
          {/* Section stepper — flat, integrated into the parent card */}
          <div className="mb-5 border-b border-border/40 pb-4">
            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.18em]">
              <span className="text-muted-foreground">
                Стъпка {stepIdx + 1} от {total}
              </span>
              <span className="font-semibold text-gold">
                {currentSection?.title ?? "—"}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-gradient-gold transition-all"
                style={{ width: `${Math.round(((stepIdx + 1) / total) * 100)}%` }}
              />
            </div>
            {visibleSections.length > 1 && (
              <div className="mt-3 hidden flex-wrap gap-1.5 sm:flex">
                {visibleSections.map((s, i) => {
                  const isCurrent = i === stepIdx;
                  const status = sectionStatus[i];
                  const isDone = status?.complete && i < stepIdx;
                  const jumpable = canJumpTo(i);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => jumpable && goToSection(i)}
                      disabled={!jumpable}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors",
                        isCurrent && "bg-gold/15 text-gold",
                        !isCurrent && isDone && "text-foreground/70 hover:bg-card/40 hover:text-gold",
                        !isCurrent && !isDone && jumpable && "text-muted-foreground/80 hover:bg-card/40 hover:text-foreground",
                        !jumpable && "cursor-not-allowed text-muted-foreground/40",
                      )}
                      title={s.title}
                    >
                      {isDone && <Check className="h-3 w-3" />}
                      <span className="truncate">{i + 1}. {s.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>


          {/* Section title row */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-serif text-xl font-semibold text-foreground">
              {currentSection?.title}
            </h2>
            {currentSection?.questions.length ? (
              <Badge variant="outline" className="border-gold/30 text-[10px] uppercase tracking-wider text-gold/90">
                {currentSection.questions.length} {currentSection.questions.length === 1 ? "въпрос" : "въпроса"}
              </Badge>
            ) : null}
          </div>
          {currentSection?.description && (
            <p className="mb-5 text-sm text-muted-foreground">{currentSection.description}</p>
          )}

          {/* Questions in this section */}
          {currentSection && currentSection.questions.length > 0 ? (
            <div className="space-y-6">
              {currentSection.questions.map((q) => (
                <GraphQuestionField
                  key={q.id}
                  q={q}
                  value={answers[q.id]}
                  onChange={(v) => setAnswer(q.id, v)}
                  invalid={attemptedNext && missingIds.has(q.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-muted-foreground">Няма активни въпроси в тази секция.</p>
          )}

          {/* Footer status */}
          {currentSection && !canAdvance && attemptedNext && missingInCurrent.length > 0 && (
            <div className="mt-6 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-xs text-destructive">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="h-3.5 w-3.5" />
                Моля, попълнете задължителните полета:
              </div>
              <ul className="ml-5 mt-1 list-disc space-y-0.5">
                {missingInCurrent.map((m) => (
                  <li key={m.id}>{m.label}</li>
                ))}
              </ul>
            </div>
          )}
          {currentSection && !canAdvance && !attemptedNext && (
            <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" />
              Остават {sectionStatus[stepIdx]?.missing ?? 0} задължителни в тази секция.
            </p>
          )}
          {isLast && resolved.isComplete && (
            <p className="mt-6 flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Всички секции са попълнени.
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
                size="lg"
                className="bg-gradient-gold text-navy shadow-gold hover:shadow-[0_15px_50px_-10px_hsl(43_55%_54%_/_0.5)]"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {ctaLabel}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
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

        <PreviewFadeGate active={!resolved.isComplete} onDownloadBlank={onDownloadBlank}>
        <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">


          <div className="mb-2 text-center text-[10px] uppercase tracking-[0.2em] text-foreground/50">
            Създадено с изкуствен интелект
          </div>
          <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
            {graph.title}
          </h1>
          <div className="my-4 gold-divider" />


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
                      <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-neutral-900">
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
        </PreviewFadeGate>
      </section>

    </div>
  );
}
