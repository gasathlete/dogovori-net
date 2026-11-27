import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { FileLock } from "@/icons";
import { getFillLaterPersonalData, setFillLaterPersonalData } from "@/lib/placeholderGate";

/**
 * „Ще попълня личните данни, когато сваля документа."
 *
 * Платформата не събира и не съхранява лични данни — те се вписват локално
 * след сваляне. Когато потребителят потвърди това тук:
 *  - export-гейтът спира да отчита полетата за лични данни като пропуски;
 *  - автоматичната AI ревизия анализира само генерираното съдържание.
 */
export function FillLaterPersonalData({
  value,
  onChange,
}: {
  value?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const [internal, setInternal] = useState<boolean>(() => getFillLaterPersonalData());
  const checked = value ?? internal;

  useEffect(() => {
    setFillLaterPersonalData(checked);
  }, [checked]);

  const toggle = (next: boolean) => {
    setInternal(next);
    setFillLaterPersonalData(next);
    onChange?.(next);
  };

  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
        checked ? "border-gold/50 bg-gold/5" : "border-border/60 bg-card/50 hover:bg-card/80"
      }`}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => toggle(v === true)}
        className="mt-0.5"
        aria-label="Ще попълня личните данни, когато сваля документа"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileLock className="h-3.5 w-3.5 text-gold" />
          Ще попълня личните данни, когато сваля документа
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Договори.нет не събира и не съхранява лични данни. С тази отметка полетата
          за имена, ЕГН/ЕИК, адреси, IBAN и контакти не се отчитат като пропуски при
          сваляне, а автоматичната AI ревизия проверява само генерираното съдържание —
          структура, клаузи и правни основания.
        </p>
      </div>
    </label>
  );
}
