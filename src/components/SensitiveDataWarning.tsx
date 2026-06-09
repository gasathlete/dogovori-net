import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClassificationSummary } from "@/lib/aiSensitiveData";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  classification: ClassificationSummary | null;
  /** When true, the user CANNOT proceed (special category data on disallowed op). */
  blocked?: boolean;
  operationLabel?: string;
}

const REASON_LABELS: Record<string, string> = {
  egn: "ЕГН (единен граждански номер)",
  iban: "Банкова сметка (IBAN)",
  id_card: "Лична карта / документ за самоличност",
  email: "Имейл адрес",
  phone: "Телефонен номер",
  address: "Адрес",
  name: "Лични имена",
  "special:health_diagnosis": "Здравна информация / диагноза",
  "special:health_specific": "Специфични здравословни състояния",
  "special:health_disability": "Информация за увреждания",
  "special:health_sickleave": "Болничен лист",
  "special:trade_union": "Синдикално членство",
  "special:religion": "Религиозни убеждения",
  "special:political": "Политически убеждения",
  "special:racial_ethnic": "Расов / етнически произход",
  "special:sexual_orientation": "Сексуална ориентация",
  "special:biometric_genetic": "Биометрични / генетични данни",
  "special:minor": "Данни за непълнолетно лице",
};

function summarizeReasons(reasons: string[] = []): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of reasons) {
    const base = r.includes(":") ? r.split(":").slice(0, 2).join(":") : r.split(":")[0];
    const key = r.startsWith("special:") ? r : base;
    const label = REASON_LABELS[key] ?? REASON_LABELS[base] ?? key;
    if (!seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

export function SensitiveDataWarning({
  open,
  onClose,
  onConfirm,
  classification,
  blocked = false,
  operationLabel = "обработка",
}: Props) {
  const reasons = summarizeReasons(classification?.reasons);
  const hasSpecial = !!classification?.contains_special_category_data;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {blocked ? (
              <ShieldAlert className="h-5 w-5 text-destructive" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            )}
            {blocked
              ? "Операцията не е разрешена"
              : "Документът съдържа лични данни"}
          </DialogTitle>
          <DialogDescription>
            {blocked
              ? "Документът съдържа специални категории лични данни (по чл. 9 GDPR). Тази операция не може да се извърши автоматично върху такива данни."
              : "Преди да продължим с AI " +
                operationLabel +
                ", моля прегледайте каква лична информация сме открили и потвърдете, че сте съгласни тя да бъде обработена."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {reasons.length > 0 && (
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="mb-1 font-medium">
                {hasSpecial ? "Специални категории данни:" : "Открити лични данни:"}
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                {reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {!blocked && (
            <div className="space-y-2 text-muted-foreground">
              <p>
                Преди изпращане към AI модела личните данни ще бъдат заменени с
                плейсхолдъри (напр. <code>&lt;EGN_1&gt;</code>,{" "}
                <code>&lt;NAME_1&gt;</code>). Оригиналните стойности се пазят
                само в паметта на текущата заявка и се връщат в крайния резултат.
              </p>
              <p>
                Доставчик на AI инфраструктурата: Lovable AI Gateway (с подизпълнители
                Google/Anthropic). Подробности — в Политиката за поверителност.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отказ
          </Button>
          {!blocked && (
            <Button onClick={onConfirm}>Потвърждавам и продължавам</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
