import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Sparkles, FileDown, FileText } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getSector, type Question } from "@/data/sectors";
import { QuestionField } from "@/components/wizard/QuestionField";
import { LiveDraft } from "@/components/wizard/LiveDraft";
import { RiskMeter, type RiskLevel } from "@/components/wizard/RiskMeter";
import { RiskReport, type RiskIssue } from "@/components/wizard/RiskReport";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { type GeneratedContract } from "@/lib/exporters";
import { downloadDocument } from "@/lib/downloadDocument";
import { useAuth } from "@/hooks/useAuth";

interface AIResult {
  risk: {
    level: RiskLevel;
    score: number;
    summary: string;
    issues: RiskIssue[];
    recommendations: string[];
  };
  contract: GeneratedContract;
}

export default function WizardPage() {
  const { sectorId } = useParams();
  const navigate = useNavigate();
  const sector = sectorId ? getSector(sectorId) : undefined;

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stepIdx, setStepIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);

  // Filter questions based on conditional logic
  const visibleQuestions = useMemo<Question[]>(() => {
    if (!sector) return [];
    return sector.questions.filter((q) => !q.showIf || q.showIf(answers));
  }, [sector, answers]);

  if (!sector) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Невалиден сектор.</p>
          <Button onClick={() => navigate("/")} className="mt-4">
            Към началото
          </Button>
        </div>
      </div>
    );
  }

  const total = visibleQuestions.length;
  const safeIdx = Math.min(stepIdx, total - 1);
  const current = visibleQuestions[safeIdx];
  const progress = result ? 100 : ((safeIdx + (current && answers[current.id] ? 1 : 0)) / total) * 100;
  const canNext = current ? !current.required || !!answers[current.id]?.trim() : false;
  const isLast = safeIdx === total - 1;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-contract", {
        body: {
          sector: sector.title,
          contractName: sector.contractName,
          parties: sector.parties,
          answers,
          questions: visibleQuestions.map((q) => ({ id: q.id, label: q.label })),
        },
      });
      if (error) throw error;
      if (!data || data.error) throw new Error(data?.error || "Неуспешно създаване");
      setResult(data as AIResult);
      toast.success("Договорът е готов", { description: "Прегледайте Краен Договор отдясно." });
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("429")) toast.error("Достигнат е лимитът. Опитайте след малко.");
      else if (msg.includes("402")) toast.error("Изчерпан лимит на системата. Опитайте по-късно.");
      else toast.error("Възникна грешка", { description: msg });
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async (kind: "pdf" | "docx") => {
    if (!result) return;
    setExporting(kind);
    try {
      if (kind === "pdf") await exportPDF(result.contract);
      else await exportDOCX(result.contract);
      toast.success(kind === "pdf" ? "PDF изтеглен" : "DOCX изтеглен");
    } catch (e: any) {
      toast.error("Грешка при експорт", { description: String(e?.message ?? e) });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />

      {/* Progress strip */}
      <div className="sticky top-16 z-30 border-b border-border/60 bg-navy/90 backdrop-blur-xl">
        <div className="container py-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-gold"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Сектори
              </button>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium text-foreground">{sector.title}</span>
              <span className="hidden text-muted-foreground sm:inline">·</span>
              <span className="hidden font-serif italic text-gold sm:inline">{sector.contractName}</span>
            </div>
            <div className="text-muted-foreground">
              {result ? "Готово" : `Стъпка ${safeIdx + 1} от ${total}`}
            </div>
          </div>
          <Progress value={progress} className="h-1.5 bg-secondary" />
        </div>
      </div>

      <main className="container py-6 md:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* LEFT — interview / risk report */}
          <section className="space-y-5">
            <RiskMeter
              level={result?.risk.level ?? "unknown"}
              score={result?.risk.score}
              summary={result?.risk.summary}
            />

            {!result && current && (
              <div className="rounded-xl border border-border/60 bg-gradient-card p-6 shadow-soft animate-fade-in">
                <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-wider text-gold">
                  <span>Въпрос {safeIdx + 1}</span>
                  <span className="text-muted-foreground">/ {total}</span>
                </div>
                <QuestionField
                  q={current}
                  value={answers[current.id] ?? ""}
                  onChange={(v) => setAnswers((p) => ({ ...p, [current.id]: v }))}
                />

                <div className="mt-8 flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                    disabled={safeIdx === 0}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="mr-1 h-4 w-4" /> Назад
                  </Button>
                  {isLast ? (
                    <Button
                      onClick={handleGenerate}
                      disabled={!canNext || generating}
                      size="lg"
                      className="bg-gradient-gold text-navy shadow-gold hover:shadow-[0_15px_50px_-10px_hsl(43_55%_54%_/_0.5)]"
                    >
                      {generating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Изготвяне…
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Анализирай и създай
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setStepIdx((i) => i + 1)}
                      disabled={!canNext}
                      className="bg-gradient-gold text-navy hover:shadow-gold"
                    >
                      Напред <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-5 animate-fade-in">
                <div className="rounded-xl border border-border/60 bg-gradient-card p-6 shadow-soft">
                  <RiskReport
                    level={result.risk.level}
                    issues={result.risk.issues || []}
                    recommendations={result.risk.recommendations || []}
                  />
                </div>

                <div className="rounded-xl border border-gold/30 bg-gradient-card p-6 shadow-soft">
                  <h3 className="mb-1 font-serif text-lg font-bold">Експорт на договора</h3>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Сваляне в PDF или редактируем DOCX формат.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      onClick={() => handleExport("pdf")}
                      disabled={!!exporting}
                      className="flex-1 bg-gradient-gold text-navy hover:shadow-gold"
                    >
                      {exporting === "pdf" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileDown className="mr-2 h-4 w-4" />
                      )}
                      Свали PDF
                    </Button>
                    <Button
                      onClick={() => handleExport("docx")}
                      disabled={!!exporting}
                      variant="outline"
                      className="flex-1 border-gold/40 hover:bg-gold/10 hover:text-gold"
                    >
                      {exporting === "docx" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="mr-2 h-4 w-4" />
                      )}
                      Свали DOCX
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setResult(null);
                      setStepIdx(0);
                    }}
                    className="mt-3 w-full text-xs text-muted-foreground hover:text-gold"
                  >
                    Започни нов договор
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* RIGHT — Live draft */}
          <section className="lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold">
                <FileText className="h-3.5 w-3.5" />
                Работен договор
              </div>
              {!result && (
                <span className="text-xs text-muted-foreground">Актуализация в реално време</span>
              )}
            </div>
            <LiveDraft sector={sector} answers={answers} generated={result?.contract} />
          </section>
        </div>
      </main>
    </div>
  );
}
