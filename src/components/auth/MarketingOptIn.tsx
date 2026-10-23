import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FREE_OPS_ON_SIGNUP, FREE_OPS_PER_MONTH } from "@/lib/pricing";

/** Presentation only: consent evidence and once-only grants remain server-owned. */
export function MarketingOptIn({ id, checked, onCheckedChange, disabled = false, bonusOps = FREE_OPS_ON_SIGNUP - FREE_OPS_PER_MONTH }: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  bonusOps?: number;
}) {
  return <div className="mt-4 border-t-2 border-gold/60 bg-muted/40 px-3 py-4">
    <div className="flex items-start gap-3">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(value) => onCheckedChange(value === true)} className="mt-3 shrink-0" />
      <Label htmlFor={id} className="min-h-11 cursor-pointer text-sm font-medium leading-relaxed">
        Искам полезни съвети и предложения по имейл — за работа с документи, новости и бонуси.
        <span className="mt-2 block font-semibold text-foreground">По желание: еднократно още {bonusOps} операции след потвърдено съгласие, ако не сте получавали началния бонус.</span>
      </Label>
    </div>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Без отметка можете да се регистрирате и да продължите. Оттегляте съгласието от профила си, без да губите вече получените операции. <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Поверителност</Link></p>
  </div>;
}