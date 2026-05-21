import { useState } from "react";
import { ARBITRATION_COURTS, ARBITRATION_DEFINITION, getCourtById } from "@/data/arbitrationCourts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Info, Gavel, ExternalLink } from "lucide-react";

export interface ArbitrationValue {
  enabled: boolean;
  courtId?: string;
  customName?: string;
  customLink?: string;
}

interface Props {
  value: ArbitrationValue;
  onChange: (v: ArbitrationValue) => void;
}

/**
 * Wizard control for arbitration clause selection.
 * Lets user toggle arbitration on/off, pick a specific Bulgarian court,
 * and (for the custom option) enter a name + link.
 */
export function ArbitrationSelector({ value, onChange }: Props) {
  const [defOpen, setDefOpen] = useState(false);
  const court = getCourtById(value.courtId);

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-card p-4 shadow-soft">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-gold" />
          <h4 className="font-serif text-sm font-bold">Арбитражна клауза</h4>
        </div>
        <Popover open={defOpen} onOpenChange={setDefOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <Info className="mr-1 h-3 w-3" /> Какво е?
            </Button>
          </PopoverTrigger>
          <PopoverContent className="max-w-sm whitespace-pre-line text-xs leading-relaxed">
            {ARBITRATION_DEFINITION}
          </PopoverContent>
        </Popover>
      </div>

      <label className="mb-3 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          className="h-3.5 w-3.5"
        />
        <span>Включи арбитражна клауза вместо държавна подсъдност</span>
      </label>

      {value.enabled && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Арбитражен съд</Label>
            <Select
              value={value.courtId ?? ""}
              onValueChange={(v) => onChange({ ...value, courtId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Изберете съд..." />
              </SelectTrigger>
              <SelectContent>
                {ARBITRATION_COURTS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.shortName} {c.city && `(${c.city})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {court?.notes && (
              <p className="mt-1 text-[11px] text-muted-foreground">{court.notes}</p>
            )}
          </div>

          {court && court.id !== "custom" && (
            <div className="space-y-1 rounded-md border border-border/40 bg-muted/30 p-2 text-[11px]">
              <p className="font-medium text-foreground">{court.name}</p>
              {court.website && (
                <a
                  href={court.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-gold hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Официален сайт
                </a>
              )}
              <details className="mt-1">
                <summary className="cursor-pointer text-muted-foreground">
                  Покажи официалната клауза
                </summary>
                <p className="mt-1 whitespace-pre-line italic text-muted-foreground">
                  {court.clauseTemplate}
                </p>
              </details>
            </div>
          )}

          {court?.id === "custom" && (
            <div className="grid gap-2">
              <div>
                <Label className="text-xs">Име на арбитражен съд</Label>
                <Input
                  value={value.customName ?? ""}
                  onChange={(e) => onChange({ ...value, customName: e.target.value })}
                  placeholder="напр. Арбитражен съд при ..."
                />
              </div>
              <div>
                <Label className="text-xs">Линк към съда (по избор)</Label>
                <Input
                  value={value.customLink ?? ""}
                  onChange={(e) => onChange({ ...value, customLink: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
          )}

          <p className="rounded-md border border-amber-400/40 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            ⚠ Арбитражна клауза не обвързва потребители (физически лица за лична нужда) съгласно ЗЗП.
          </p>
        </div>
      )}
    </div>
  );
}
