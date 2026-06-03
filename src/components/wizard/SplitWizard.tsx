/**
 * SplitWizard — Sprint 2 of the dynamic decision tree.
 *
 * Left pane: sectioned, branching question list driven by `resolveGraph()`.
 * Right pane: live preview of the assembled document, with newly-added /
 * newly-removed clauses highlighted (diff vs. the previous answer set).
 *
 * Persists answers to localStorage under `splitwizard:<slug>`.
 *
 * The component is intentionally self-contained — it does not call any
 * Supabase edge functions on its own. Parent pages decide what to do with
 * the final answers + assembled markdown via `onComplete`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResizableHandle, ResizablePanel, ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { GraphQuestionField } from "./GraphQuestionField";
import { assembleDocument, diffInclusion, type ClauseDefinition } from "@/lib/clauseEngine";
import {
  pruneAnswers, resolveGraph, type QuestionGraph,
} from "@/lib/questionGraph";
import type { Ctx } from "@/lib/expressionEvaluator";
import { AlertCircle, CheckCircle2, Sparkles, Eye, EyeOff, ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  graph: QuestionGraph;
  clauses: ClauseDefinition[];
  initialAnswers?: Ctx;
  storageKey?: string;
  onComplete?: (payload: { answers: Ctx; body_md: string }) => void;
  ctaLabel?: string;
}

const DIFF_TTL_MS = 2500;

export function SplitWizard({
  graph, clauses, initialAnswers, storageKey, onComplete, ctaLabel = "Продължи",
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

  // Persist on every change.
  useEffect(() => {
    try { localStorage.setItem(persistKey, JSON.stringify(answers)); } catch { /* noop */ }
  }, [answers, persistKey]);

  const resolved = useMemo(() => resolveGraph(graph, answers), [graph, answers]);
  const assembled = useMemo(() => assembleDocument(clauses, answers), [clauses, answers]);

  // Track diff between previous and current answers; pulse for DIFF_TTL_MS.
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
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      // Drop answers that no longer belong to any visible branch.
      return pruneAnswers(graph, next);
    });
  };

  const handleComplete = () => {
    if (!resolved.isComplete) return;
    const cleaned = pruneAnswers(graph, answers);
    const finalDoc = assembleDocument(clauses, cleaned);
    onComplete?.({ answers: cleaned, body_md: finalDoc.body_md });
  };

  return (
    <ResizablePanelGroup direction="horizontal" className="min-h-[calc(100vh-4rem)] rounded-lg border bg-card">
      {/* LEFT — questions */}
      <ResizablePanel defaultSize={55} minSize={35}>
        <div className="flex h-full flex-col">
          <header className="border-b p-4">
            <h1 className="text-lg font-semibold">{graph.title}</h1>
            <div className="mt-3 flex items-center gap-3">
              <Progress value={resolved.progress} className="h-2 flex-1" />
              <span className="text-xs tabular-nums text-muted-foreground">{resolved.progress}%</span>
            </div>
            {!resolved.isComplete && resolved.missingRequired.length > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5" />
                Остават {resolved.missingRequired.length} задължителни въпроса.
              </p>
            )}
            {resolved.isComplete && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Готови сте да продължите.
              </p>
            )}
          </header>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-6">
              {resolved.sections.map((section) => (
                <section key={section.id} className="space-y-3">
                  <div className="sticky top-0 z-10 -mx-1 bg-card/95 px-1 py-1 backdrop-blur">
                    <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
                    {section.description && (
                      <p className="text-xs text-muted-foreground">{section.description}</p>
                    )}
                  </div>
                  <div className="space-y-3">
                    {section.questions.map((q) => (
                      <GraphQuestionField
                        key={q.id}
                        q={q}
                        value={answers[q.id]}
                        onChange={(v) => setAnswer(q.id, v)}
                        invalid={q.required && resolved.missingRequired.includes(q.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <footer className="flex items-center justify-between border-t p-4">
            <div className="text-xs text-muted-foreground">
              {resolved.active.length} активни въпроса · {assembled.clauses.length}/
              {assembled.clauses.length + assembled.excluded.length} клаузи
            </div>
            <Button onClick={handleComplete} disabled={!resolved.isComplete}>
              <Sparkles className="h-4 w-4" /> {ctaLabel}
            </Button>
          </footer>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* RIGHT — live preview */}
      <ResizablePanel defaultSize={45} minSize={30}>
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b p-4">
            <div>
              <h2 className="text-sm font-semibold">Жив преглед</h2>
              <p className="text-xs text-muted-foreground">
                Документът се обновява в реално време според отговорите.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowExcluded((v) => !v)}
              title={showExcluded ? "Скрий изключените клаузи" : "Покажи изключените клаузи"}
            >
              {showExcluded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="ml-1.5 hidden sm:inline">
                {showExcluded ? "Скрий изключени" : "Покажи изключени"}
              </span>
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto bg-muted/30 p-4">
            {assembled.unfilledTokens.length > 0 && (
              <div className="mb-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                Незапълнени полета: {assembled.unfilledTokens.join(", ")}
              </div>
            )}

            <Card className="space-y-5 p-6 font-serif text-[15px] leading-relaxed">
              {assembled.clauses.length === 0 && (
                <p className="text-sm italic text-muted-foreground">
                  Започнете да отговаряте на въпросите, за да видите документа.
                </p>
              )}
              {assembled.clauses.map((c) => {
                const isAdded = diffHighlight.added.has(c.clause_id);
                return (
                  <article
                    key={c.clause_id}
                    className={cn(
                      "rounded-md p-2 transition-colors",
                      isAdded && "bg-emerald-100/70 ring-1 ring-emerald-300 dark:bg-emerald-950/30",
                    )}
                  >
                    {c.title && <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-foreground">{c.title}</h3>}
                    <p className="whitespace-pre-wrap text-foreground/90">{c.body}</p>
                  </article>
                );
              })}

              {showExcluded && assembled.excluded.length > 0 && (
                <div className="mt-6 space-y-3 border-t pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Изключени клаузи ({assembled.excluded.length})
                  </p>
                  {assembled.excluded.map((c) => {
                    const wasRemoved = diffHighlight.removed.has(c.clause_id);
                    return (
                      <article
                        key={c.clause_id}
                        className={cn(
                          "rounded-md p-2 opacity-50 transition-colors",
                          wasRemoved && "bg-rose-100/70 opacity-100 ring-1 ring-rose-300 dark:bg-rose-950/30",
                        )}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">изключена</Badge>
                          {c.title && <span className="text-xs font-medium">{c.title}</span>}
                        </div>
                        <p className="whitespace-pre-wrap text-xs italic text-muted-foreground">{c.body}</p>
                      </article>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
