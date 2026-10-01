/**
 * Пренася данните от подготовката за комплект в съществуващия въпросник.
 * Само изрично мапнати полета; редакциите на потребителя не се презаписват
 * без потвърждение. Данните живеят само в паметта (preparationStore).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  usePreparation, clearPreparation, getAppliedPrefill, recordAppliedPrefill,
} from "@/lib/taskPreparation/preparationStore";
import { RENTAL_KIT_ID, pruneRentalAnswers } from "@/lib/taskPreparation/rentalPreparation";
import { buildRentalPrefill, hasRentalPrefill, planPrefill } from "@/lib/taskPreparation/rentalFieldMap";

interface Props {
  slug: string;
  answers: Record<string, string>;
  onApply: (patch: Record<string, string>) => void;
}

export function KitPrefillBridge({ slug, answers, onApply }: Props) {
  const prep = usePreparation();
  const active = !!prep && prep.kitId === RENTAL_KIT_ID && hasRentalPrefill(slug);
  const next = useMemo(
    () => (active && prep ? buildRentalPrefill(slug, pruneRentalAnswers(prep.answers)) : {}),
    [active, prep, slug],
  );
  const [conflicts, setConflicts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!active || !prep) return;
    const prev = getAppliedPrefill(slug);
    if (prev && prev.revision === prep.revision) return;
    const plan = planPrefill(next, answers, prev?.values);
    if (Object.keys(plan.apply).length) onApply(plan.apply);
    // Отчитаме само реално приложеното; конфликтите чакат решение.
    recordAppliedPrefill(slug, { revision: prep.revision, values: { ...(prev?.values ?? {}), ...plan.apply } });
    setConflicts(plan.conflicts);
    // answers нарочно не е зависимост — решението се взема при нова ревизия.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, prep?.revision, slug, next]);

  if (!active) return null;
  const applied = getAppliedPrefill(slug)?.values ?? {};
  const count = Object.keys(applied).filter((k) => answers[k] === applied[k]).length;
  const conflictIds = Object.keys(conflicts);

  const replace = () => {
    onApply(conflicts);
    const prev = getAppliedPrefill(slug);
    recordAppliedPrefill(slug, { revision: prev?.revision ?? 0, values: { ...(prev?.values ?? {}), ...conflicts } });
    setConflicts({});
  };

  return (
    <aside aria-label="Данни от подготовката" data-testid="kit-prefill"
      className="mb-4 rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm">
      <p className="font-semibold text-foreground">
        {count > 0 ? `Предварително попълнени данни от подготовката: ${count} полета.` : "Има активна подготовка за наем на жилище."}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Проверете ги. Полетата, които не са в подготовката, попълнете тук. Данните са само в този прозорец.
      </p>
      {conflictIds.length > 0 && (
        <div role="alert" className="mt-3 rounded-lg border border-border bg-background p-3">
          <p className="text-xs text-foreground">
            Подготовката е променена, а Вие сте редактирали {conflictIds.length} от същите полета в документа. Да заменим ли Вашите стойности?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={replace} className="btn-gold min-h-[44px] rounded-lg px-4 text-xs font-bold">Замени с данните от подготовката</button>
            <button type="button" onClick={() => setConflicts({})} className="min-h-[44px] rounded-lg border border-border px-4 text-xs font-semibold">Запази моите</button>
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4">
        <Link to="/komplekti/naem-zhilishte/podgotovka" className="inline-flex min-h-[44px] items-center text-xs font-semibold text-gold hover:underline">Обратно към подготовката</Link>
        <button type="button" onClick={() => { clearPreparation(); setConflicts({}); }}
          className="min-h-[44px] text-xs font-semibold text-muted-foreground hover:text-foreground">Изчисти данните от подготовката</button>
      </div>
    </aside>
  );
}
