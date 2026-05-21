import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";

interface SuggestedQ {
  id: string;
  question: string;
  type: string;
  options: unknown;
  importance: number;
}

interface Props {
  sectorId?: string;
  contractType?: string;
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
}

/**
 * Pulls staff-curated follow-up questions from contract_question_bank
 * via the suggest-followup-questions edge function, based on the
 * user's current answers. Renders inline so users can refine the
 * draft before generation.
 */
export function FollowupSuggestions({ sectorId, contractType, answers, onAnswer }: Props) {
  const [questions, setQuestions] = useState<SuggestedQ[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase.functions.invoke("suggest-followup-questions", {
        body: { sector_id: sectorId, contract_type: contractType, answers, limit: 4 },
      });
      if (!cancelled) {
        setQuestions(((data as { questions?: SuggestedQ[] })?.questions) ?? []);
        setLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [sectorId, contractType, JSON.stringify(answers)]);

  if (!loading && questions.length === 0) return null;

  return (
    <div className="rounded-xl border border-gold/30 bg-gold/5 p-5 animate-fade-in">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gold">
        <Sparkles className="h-4 w-4" />
        Допълнителни въпроси (по избор)
        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Тези въпроси са препоръчани от експерти за вашия казус. Отговорите ще направят договора по-точен.
      </p>
      <div className="space-y-3">
        {questions.map((q) => (
          <div key={q.id}>
            <Label className="text-sm">{q.question}</Label>
            <Input
              value={answers[`fu_${q.id}`] ?? ""}
              onChange={(e) => onAnswer(`fu_${q.id}`, e.target.value)}
              placeholder="Отговор…"
              className="mt-1"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
