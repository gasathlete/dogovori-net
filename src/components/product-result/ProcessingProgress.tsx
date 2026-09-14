/**
 * Видим напредък по време на изготвянето.
 *
 * Показва САМО стъпката, която сървърът е потвърдил. Няма проценти, няма
 * измислени срокове и няма движение напред без потвърждение.
 */
import { Card } from "@/components/ui/card";
import { Check, Loader2 } from "@/icons";

export type FulfillmentStage =
  | "awaiting_generation"
  | "review"
  | "corrections"
  | "negotiation"
  | "messages"
  | "synthesis"
  | "ready";

const LABELS: Readonly<Record<FulfillmentStage, string>> = Object.freeze({
  awaiting_generation: "Разчитаме документа",
  review: "Проверяваме клаузите",
  corrections: "Подготвяме поправките",
  negotiation: "Съставяме плана за преговори",
  messages: "Изготвяме писмата",
  synthesis: "Подреждаме резултата",
  ready: "Готово",
});

const BY_PRODUCT: Readonly<Record<string, readonly FulfillmentStage[]>> = Object.freeze({
  contract_check: ["awaiting_generation", "review", "synthesis"],
  contract_improve: ["awaiting_generation", "review", "corrections", "synthesis"],
  negotiation_package: [
    "awaiting_generation",
    "review",
    "corrections",
    "negotiation",
    "messages",
    "synthesis",
  ],
});

export function stagesFor(productId: string): readonly FulfillmentStage[] {
  return BY_PRODUCT[productId] ?? BY_PRODUCT.contract_check;
}

export function isFulfillmentStage(value: unknown): value is FulfillmentStage {
  return typeof value === "string" && value in LABELS;
}

interface Props {
  readonly productId: string;
  readonly stage: FulfillmentStage | null;
  /** Показва се само когато прекъсването е било преходно и продължаваме сами. */
  readonly resuming?: boolean;
}

export function ProcessingProgress({ productId, stage, resuming = false }: Props) {
  const stages = stagesFor(productId);
  const activeIndex = stage ? stages.indexOf(stage) : -1;

  return (
    <Card className="mt-5 p-5">
      <p className="flex items-center gap-3 text-sm font-medium" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin text-gold" aria-hidden />
        {resuming ? "Обработката прекъсна. Продължаваме автоматично." : "Плащането е потвърдено. Подготвяме резултата."}
      </p>
      <ol className="mt-4 space-y-2.5">
        {stages.map((item, index) => {
          const done = activeIndex > index;
          const active = activeIndex === index;
          return (
            <li key={item} className="flex items-center gap-3 text-sm">
              <span
                className={[
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  done
                    ? "border-gold/50 bg-gold/15 text-gold"
                    : active
                      ? "border-gold text-gold"
                      : "border-border text-muted-foreground",
                ].join(" ")}
                aria-hidden
              >
                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className={done || active ? "text-foreground" : "text-muted-foreground"}>
                {LABELS[item]}
              </span>
              {active ? <span className="sr-only">— изпълнява се сега</span> : null}
              {done ? <span className="sr-only">— готово</span> : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-sm text-muted-foreground">
        Страницата се обновява сама. Може да я оставите отворена.
      </p>
    </Card>
  );
}
