/**
 * Работната част на поправката: изричен избор по всяка поправка.
 *
 * Няма мълчаливо „прието“. Смяната на подхода само подготвя избора — записва се
 * едва когато потребителят приеме поправката. Записът минава през сървъра, който
 * сам изчислява поправения текст.
 */
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2 } from "@/icons";
import { STRATEGY_LABELS_BG } from "@/lib/productResults";
import { Excerpt, spanPlaceBg } from "@/components/product-result/ReviewResult";
import type {
  Correction,
  CorrectionStrategy,
} from "../../../supabase/functions/_shared/product-result-contract";
import type { CorrectionDecision } from "../../../supabase/functions/_shared/product-selections";

const STRATEGY_ORDER: CorrectionStrategy[] = ["conservative", "balanced", "assertive"];

const STRATEGY_HINT: Record<CorrectionStrategy, string> = {
  conservative: "Най-малката промяна, която затваря риска.",
  balanced: "Разумно равновесие между защита и приемливост.",
  assertive: "Търси повече защита за Вас и очаква обсъждане.",
};

export type SaveOutcome =
  | { readonly ok: true; readonly correctedText: string }
  | { readonly ok: false; readonly message: string };

type LocalDecision = { decision: "accept" | "reject"; strategy: CorrectionStrategy | null };

export function CorrectionWorkspace({
  corrections,
  savedDecisions,
  onSave,
  onDecision,
  onPreviewOpened,
  exportsSlot,
}: {
  corrections: readonly Correction[];
  savedDecisions: readonly CorrectionDecision[];
  onSave: (decisions: readonly CorrectionDecision[]) => Promise<SaveOutcome>;
  onDecision?: (decision: "accept" | "reject", strategy: CorrectionStrategy | null) => void;
  onPreviewOpened?: () => void;
  /** Изтеглянията се показват само след изричен избор. */
  exportsSlot?: React.ReactNode;
}) {
  const [globalStrategy, setGlobalStrategy] = useState<CorrectionStrategy>("balanced");
  const [decisions, setDecisions] = useState<Record<string, LocalDecision>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [correctedText, setCorrectedText] = useState<string | null>(null);
  const [showFullText, setShowFullText] = useState(false);

  useEffect(() => {
    const next: Record<string, LocalDecision> = {};
    for (const saved of savedDecisions) {
      next[saved.correction_id] = { decision: saved.decision, strategy: saved.strategy };
    }
    setDecisions(next);
  }, [savedDecisions]);

  const decidedCount = useMemo(
    () => corrections.filter((c) => decisions[c.id] !== undefined).length,
    [corrections, decisions],
  );
  const complete = corrections.length > 0 && decidedCount === corrections.length;

  const accepted = useMemo(
    () =>
      corrections
        .map((c) => {
          const d = decisions[c.id];
          if (!d || d.decision !== "accept" || !d.strategy) return null;
          const option = c.options.find((o) => o.stance === d.strategy);
          return option ? { correction: c, option, strategy: d.strategy } : null;
        })
        .filter((v): v is { correction: Correction; option: Correction["options"][number]; strategy: CorrectionStrategy } => v !== null),
    [corrections, decisions],
  );

  const setDecision = (id: string, decision: "accept" | "reject", strategy: CorrectionStrategy | null) => {
    setDecisions((prev) => ({ ...prev, [id]: { decision, strategy } }));
    setCorrectedText(null);
    onDecision?.(decision, strategy);
  };

  const acceptAll = () => {
    const next: Record<string, LocalDecision> = {};
    for (const c of corrections) {
      const available = c.options.some((o) => o.stance === globalStrategy)
        ? globalStrategy
        : c.options[0].stance;
      next[c.id] = { decision: "accept", strategy: available };
    }
    setDecisions(next);
    setCorrectedText(null);
    onDecision?.("accept", globalStrategy);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const payload: CorrectionDecision[] = corrections.map((c) => {
      const d = decisions[c.id];
      return d.decision === "accept"
        ? { correction_id: c.id, decision: "accept", strategy: d.strategy }
        : { correction_id: c.id, decision: "reject", strategy: null };
    });
    const outcome = await onSave(payload);
    setSaving(false);
    if (outcome.ok === true) {
      setCorrectedText(outcome.correctedText);
      setMessage("Изборът е записан.");
    } else {
      setMessage(outcome.message);
    }
  };

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold md:text-xl">Поправки по документа</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        По всяка поправка решавате Вие. Изберете вариант и приемете или откажете.
      </p>

      <Card className="mt-4 p-4 md:p-5">
        <h3 className="text-sm font-semibold">Подход по подразбиране</h3>
        <RadioGroup
          value={globalStrategy}
          onValueChange={(v) => setGlobalStrategy(v as CorrectionStrategy)}
          className="mt-3 grid gap-3 sm:grid-cols-3"
        >
          {STRATEGY_ORDER.map((s) => (
            <div key={s} className="flex items-start gap-3 rounded-lg border border-border p-3">
              <RadioGroupItem value={s} id={`strategy-${s}`} className="mt-1" />
              <Label htmlFor={`strategy-${s}`} className="cursor-pointer">
                <span className="block text-sm font-medium">{STRATEGY_LABELS_BG[s]}</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {STRATEGY_HINT[s]}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={acceptAll}>
          Приеми всички с избрания подход
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Това записва изрично решение по всяка поправка. Можете да промените всяко от тях.
        </p>
      </Card>

      <ul className="mt-5 space-y-4">
        {corrections.map((c) => {
          const d = decisions[c.id];
          return (
            <li key={c.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{c.title}</h3>
                {d && (
                  <Badge variant="outline">
                    {d.decision === "accept"
                      ? `Прието — ${STRATEGY_LABELS_BG[d.strategy ?? "balanced"]}`
                      : "Отказано"}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{spanPlaceBg(c.span)}</p>
              <p className="mt-2 text-sm">{c.rationale}</p>
              <Excerpt span={c.span} />

              <div className="mt-4 space-y-3">
                {STRATEGY_ORDER.map((s) => {
                  const option = c.options.find((o) => o.stance === s);
                  if (!option) return null;
                  const selected = d?.decision === "accept" && d.strategy === s;
                  return (
                    <div
                      key={s}
                      className={`rounded-md border p-3 ${selected ? "border-gold bg-gold/5" : "border-border"}`}
                    >
                      <p className="text-sm font-medium">{STRATEGY_LABELS_BG[s]}</p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                        {option.replacement_text}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Компромис: {option.trade_off}
                      </p>
                      <Button
                        type="button"
                        variant={selected ? "default" : "outline"}
                        size="sm"
                        className="mt-3 min-h-11"
                        onClick={() => setDecision(c.id, "accept", s)}
                      >
                        {selected ? "Избрано" : "Приеми този вариант"}
                      </Button>
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3 min-h-11"
                onClick={() => setDecision(c.id, "reject", null)}
              >
                Откажи поправката
              </Button>
            </li>
          );
        })}
      </ul>

      <Card className="mt-5 p-4 md:p-5">
        <p className="text-sm">
          Решени: {decidedCount} от {corrections.length}
        </p>
        <Button
          type="button"
          className="mt-3 min-h-11 w-full sm:w-auto"
          disabled={!complete || saving}
          onClick={() => void save()}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Запиши избора
        </Button>
        <p aria-live="polite" className="mt-3 min-h-5 text-sm text-muted-foreground">
          {message ?? ""}
        </p>
      </Card>

      {accepted.length > 0 && (
        <section className="mt-8">
          <h3 className="text-base font-semibold">Преди и след</h3>
          <ul className="mt-3 space-y-3">
            {accepted.map(({ correction, option, strategy }) => (
              <li key={correction.id} className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium">
                  {correction.title} — {STRATEGY_LABELS_BG[strategy]}
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-border bg-muted/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Преди</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                      {correction.original_text}
                    </p>
                  </div>
                  <div className="rounded-md border border-gold/40 bg-gold/5 p-3">
                    <p className="text-xs font-medium text-muted-foreground">След</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                      {option.replacement_text}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {correctedText !== null && (
        <section className="mt-6">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            aria-expanded={showFullText}
            onClick={() => {
              setShowFullText((v) => !v);
              if (!showFullText) onPreviewOpened?.();
            }}
          >
            {showFullText ? "Скрий поправения документ" : "Виж поправения документ"}
          </Button>
          {showFullText && (
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-4 text-sm">
              {correctedText}
            </pre>
          )}
        </section>
      )}

      {correctedText !== null && exportsSlot}
    </section>
  );
}
