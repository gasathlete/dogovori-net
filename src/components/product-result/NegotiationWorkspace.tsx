/**
 * Пакетът за преговори: план, действия, две готови писма и едно уточнение.
 *
 * Писмата само се копират — нищо не се изпраща от тук. Уточнението е едно и
 * ако не успее, предишният резултат остава непокътнат.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Copy, Loader2 } from "@/icons";
import { SEVERITY_LABELS_BG } from "@/lib/productResults";
import { TONE_LABELS_BG } from "@/lib/productResultLabels";
import type { NegotiationPayload } from "../../../supabase/functions/_shared/product-result-contract";

export type RefineOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string };

const MIN_INSTRUCTION = 12;
const MAX_INSTRUCTION = 1200;

function List({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={`${title}-${i}`}>{item}</li>
        ))}
      </ul>
    </Card>
  );
}

export function NegotiationWorkspace({
  payload,
  documentSlot,
  exportsSlot,
  onRefine,
  onRefinementSubmitted,
}: {
  payload: NegotiationPayload;
  /** Проверката и поправките се показват в раздел „Документ“. */
  documentSlot: React.ReactNode;
  exportsSlot?: React.ReactNode;
  onRefine: (instruction: string) => Promise<RefineOutcome>;
  onRefinementSubmitted?: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const remaining = payload.refinement.included - payload.refinement.used;
  const canRefine =
    remaining > 0 &&
    instruction.trim().length >= MIN_INSTRUCTION &&
    instruction.trim().length <= MAX_INSTRUCTION;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      setCopied(null);
      setStatus("Копирането не се получи. Маркирайте текста и го копирайте ръчно.");
    }
  };

  const submit = async () => {
    setBusy(true);
    setStatus(null);
    onRefinementSubmitted?.();
    const outcome = await onRefine(instruction.trim());
    setBusy(false);
    if (outcome.ok === true) {
      setStatus("Уточнението е готово и резултатът е обновен.");
      setInstruction("");
    } else {
      setStatus(outcome.message);
    }
  };

  const materialCorrections = payload.corrections.length;
  const findingsCount = payload.findings.length;

  return (
    <>
    <Card className="mt-6 border-gold/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Документът е готов за преговори</h2>
        <Badge variant="outline">Готово</Badge>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        <li>
          Открити находки по клаузите: <strong>{findingsCount}</strong>
        </li>
        <li>
          Поправки с три варианта: <strong>{materialCorrections}</strong>
        </li>
        <li>
          Действия със срокове: <strong>{payload.actions.length}</strong>
        </li>
        <li>
          Готови писма: <strong>{payload.messages.length}</strong>
        </li>
      </ul>
      <h3 className="mt-4 text-sm font-semibold">Какво да направите сега</h3>
      <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
        <li>В „Документ“ прегледайте находките и изберете вариант за всяка поправка.</li>
        <li>В „Преговори“ вижте целите, червените линии и действията със срокове.</li>
        <li>В „Съобщения“ копирайте писмото, което отговаря на тона на разговора.</li>
        <li>При нужда поискайте включеното уточнение в „Уточнение“.</li>
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Резултатът е автоматичен и не е правен съвет. Нищо не се изпраща без Вас.
      </p>
    </Card>
    <Tabs defaultValue="document" className="mt-6">
      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
        <TabsTrigger value="document" className="min-h-11">
          Документ
        </TabsTrigger>
        <TabsTrigger value="negotiation" className="min-h-11">
          Преговори
        </TabsTrigger>
        <TabsTrigger value="messages" className="min-h-11">
          Съобщения
        </TabsTrigger>
        <TabsTrigger value="refinement" className="min-h-11">
          Уточнение
        </TabsTrigger>
      </TabsList>

      <TabsContent value="document">{documentSlot}</TabsContent>

      <TabsContent value="negotiation" className="mt-6 space-y-4">
        <List title="Цели" items={payload.objectives} />
        <List title="Червени линии" items={payload.red_lines} />
        <List title="Приемливи отстъпки" items={payload.acceptable_concessions} />
        <List title="Ако не се съгласят" items={payload.fallbacks} />
        <List title="Въпроси за разговора" items={payload.negotiation_questions} />
        {payload.actions.length > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold">Действия и срокове</h3>
            <ul className="mt-3 space-y-3">
              {payload.actions.map((a) => (
                <li key={a.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{a.action}</p>
                    <Badge variant="outline">{SEVERITY_LABELS_BG[a.priority]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Отговорник: {a.owner}
                    {a.due ? ` · Срок: ${a.due}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {exportsSlot}
      </TabsContent>

      <TabsContent value="messages" className="mt-6 space-y-4">
        {payload.messages.map((m) => (
          <Card key={m.tone} className="p-4">
            <h3 className="text-sm font-semibold">{TONE_LABELS_BG[m.tone]}</h3>
            <p className="mt-2 text-sm font-medium">{m.subject}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-11"
              onClick={() => void copy(m.tone, `${m.subject}\n\n${m.body}`)}
            >
              <Copy className="mr-2 h-4 w-4" />
              Копирай текста
            </Button>
            <p aria-live="polite" className="mt-2 min-h-5 text-xs text-muted-foreground">
              {copied === m.tone ? "Текстът е копиран." : ""}
            </p>
          </Card>
        ))}
        <p className="text-xs text-muted-foreground">
          Писмата остават при Вас. Нищо не се изпраща от тази страница.
        </p>
      </TabsContent>

      <TabsContent value="refinement" className="mt-6">
        <Card className="p-4 md:p-5">
          <h3 className="text-sm font-semibold">Едно включено уточнение</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {remaining > 0
              ? "Можете да поискате едно уточнение по резултата. Опишете кратко какво да се прецизира."
              : "Включеното уточнение вече е използвано (1 от 1)."}
          </p>
          <div className="mt-4">
            <Label htmlFor="refine-instruction" className="text-sm">
              Какво да прецизираме
            </Label>
            <Textarea
              id="refine-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              maxLength={MAX_INSTRUCTION}
              rows={5}
              disabled={remaining === 0 || busy}
              className="mt-2"
              placeholder="Например: съкратете писмото до отсрещната страна и наблегнете на срока за плащане."
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {instruction.trim().length} от {MAX_INSTRUCTION} знака (най-малко {MIN_INSTRUCTION}).
            </p>
          </div>
          <Button
            type="button"
            className="mt-4 min-h-11 w-full sm:w-auto"
            disabled={!canRefine || busy}
            onClick={() => void submit()}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Поискай уточнението
          </Button>
          <p aria-live="polite" className="mt-3 min-h-5 text-sm text-muted-foreground">
            {busy ? "Подготвяме уточнението." : (status ?? "")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Ако уточнението не успее, сегашният резултат остава непроменен.
          </p>
        </Card>
      </TabsContent>
    </Tabs>
    </>
  );
}
