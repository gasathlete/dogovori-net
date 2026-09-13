import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ShieldAlert } from "@/icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ClassificationSummary } from "@/lib/aiSensitiveData";
import { trackMetric } from "@/lib/metrics";

const REASON_LABELS: Record<string, string> = {
  egn: "ЕГН",
  iban: "IBAN банкова сметка",
  id_card: "Данни от документ за самоличност",
  email: "Имейл адрес",
  phone: "Телефонен номер",
  address: "Адрес",
  name: "Имена на физически лица",
  "special:health_diagnosis": "Здравна информация или диагноза",
  "special:health_specific": "Здравословно състояние",
  "special:health_disability": "Информация за увреждане",
  "special:health_sickleave": "Болничен лист",
  "special:trade_union": "Синдикално членство",
  "special:religion": "Религиозни убеждения",
  "special:political": "Политически убеждения",
  "special:racial_ethnic": "Расов или етнически произход",
  "special:sexual_orientation": "Сексуална ориентация",
  "special:biometric_genetic": "Биометрични или генетични данни",
  "special:minor": "Данни за непълнолетно лице",
};

export function sensitiveDataLabels(classification: ClassificationSummary | null): string[] {
  const keys = new Set<string>();
  for (const [key, count] of Object.entries(classification?.pii_counts ?? {})) {
    if (count > 0) keys.add(key);
  }
  for (const reason of classification?.reasons ?? []) {
    keys.add(reason.startsWith("special:") ? reason.split(":").slice(0, 2).join(":") : reason.split(":")[0]);
  }
  return [...keys].map((key) => REASON_LABELS[key] ?? "Лични данни");
}

interface SensitiveDataNoticeProps {
  classification: ClassificationSummary | null;
  blocked?: boolean;
  operationLabel?: string;
  busy?: boolean;
  onConfirm?: () => void;
  onDismiss?: () => void;
}

export function SensitiveDataNotice({
  classification,
  blocked = false,
  operationLabel = "обработка на документа",
  busy = false,
  onConfirm,
  onDismiss,
}: SensitiveDataNoticeProps) {
  const [accepted, setAccepted] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const labels = sensitiveDataLabels(classification);
  const Icon = blocked ? ShieldAlert : AlertTriangle;

  useEffect(() => {
    setAccepted(false);
    trackMetric("sensitive_notice_shown", { state: blocked ? "sensitive_blocked" : "needs_confirmation" });
    noticeRef.current?.focus({ preventScroll: true });
    noticeRef.current?.scrollIntoView({ block: "nearest" });
  }, [blocked]);

  const confirm = () => {
    trackMetric("sensitive_notice_confirmed", { state: "needs_confirmation" });
    onConfirm?.();
  };

  return (
    <div
      ref={noticeRef}
      role="alert"
      tabIndex={-1}
      className="scroll-mt-24 rounded-lg border border-gold/40 bg-gold/5 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <Icon className={blocked ? "mt-0.5 h-5 w-5 shrink-0 text-destructive" : "mt-0.5 h-5 w-5 shrink-0 text-gold"} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {blocked ? "Редактирайте чувствителните данни" : "Нужно е Вашето потвърждение"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {blocked
              ? "Открита е специална категория лични данни. Тази операция не може да продължи. Премахнете или заменете данните в съответното поле и опитайте отново."
              : `За ${operationLabel} е нужно изрично съгласие за обработка само за тази заявка.`}
          </p>
          {labels.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-md border border-border/60 bg-background/60 p-3 text-sm text-foreground">
              {labels.map((label) => <li key={label}>• {label}</li>)}
            </ul>
          )}
          {!blocked && onConfirm && (
            <>
              <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-foreground">
                <Checkbox checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} className="mt-0.5 h-5 w-5" />
                <span>Съгласен/на съм тези данни да бъдат обработени само за {operationLabel}.</span>
              </label>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button className="min-h-11" disabled={!accepted || busy} onClick={confirm}>
                  Потвърждавам данните и продължавам
                </Button>
                {onDismiss && <Button className="min-h-11" variant="outline" onClick={onDismiss}>Назад към редакция</Button>}
              </div>
            </>
          )}
          {blocked && onDismiss && (
            <Button className="mt-3 min-h-11" variant="outline" onClick={onDismiss}>
              Към редакцията
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}