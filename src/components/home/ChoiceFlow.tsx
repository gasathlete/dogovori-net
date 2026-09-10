/**
 * ChoiceFlow — визуализация на процеса след избора „Какво искате да направите?“.
 * Мобилно: вертикална времева линия със стъпки. Десктоп: същите стъпки в таблица.
 * Съзнателно НЕ обещаваме време за изпълнение — показваме само последователността
 * и резултата от всяка стъпка.
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, Workflow, ChevronDown } from "@/icons";

export type FlowId = "build" | "catalog" | "analyze";

interface Step {
  title: string;
  detail: string;
  output: string;
}

export const FLOWS: Record<FlowId, { label: string; to: string; cta: string; steps: Step[] }> = {
  build: {
    label: "Изготвяне на документ",
    to: "/build",
    cta: "Започнете изготвяне",
    steps: [
      { title: "Избирате вид документ", detail: "Договор, анекс, пълномощно, протокол.", output: "Подбран шаблон по ЗЗД/ТЗ/КТ" },
      { title: "Отговаряте на въпроси", detail: "Страни, суми, срокове — с подсказки за всяко поле.", output: "Попълнени параметри" },
      { title: "Преглеждате и сваляте", detail: "Преглед с воден знак, после DOCX или PDF.", output: "Готов документ" },
      { title: "Подписвате (по избор)", detail: "Е-подпис, качен подпис или КЕП.", output: "Подписан екземпляр" },
    ],
  },
  catalog: {
    label: "Шаблони",
    to: "/catalog",
    cta: "Отворете каталога",
    steps: [
      { title: "Филтрирате по сфера", detail: "Търговски, трудови, наем, услуги, строителство.", output: "Кратък списък" },
      { title: "Сравнявате образци", detail: "Виждате клаузите, риска и правното основание.", output: "Избран образец" },
      { title: "Продължавате към попълване", detail: "Шаблонът се отваря директно за попълване.", output: "Персонализиран документ" },
    ],
  },
  analyze: {
    label: "Проверка на Ваш договор",
    to: "/analiz",
    cta: "Качете за проверка",
    steps: [
      { title: "Качвате документа", detail: "PDF, DOCX или поставен текст.", output: "Извлечен текст" },
      { title: "Проверяваме клаузите", detail: "Посочваме неизгодните и липсващите клаузи.", output: "Оценка на риска" },
      { title: "Получавате корекции", detail: "Предложени редакции клауза по клауза.", output: "План за преговори" },
    ],
  },
};

export function ChoiceFlow({ active, expanded, onToggle }: { active: FlowId; expanded: boolean; onToggle: () => void }) {
  const flow = FLOWS[active];

  return (
    <div className="mx-auto mt-6 max-w-4xl rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-6">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="choice-flow-steps"
        className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
      >
        <div>
          <div className="eyebrow mb-1">Какво се случва</div>
          <h3 className="font-serif text-lg font-bold text-foreground">{flow.label}</h3>
        </div>
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/[0.07] px-2.5 py-1 text-[11px] font-semibold text-gold">
            <Workflow className="h-3.5 w-3.5" />
            {flow.steps.length} стъпки
          </span>
          <ChevronDown
            className={
              "h-4 w-4 text-gold transition-transform " + (expanded ? "rotate-180" : "")
            }
          />
        </span>
      </button>

      {!expanded && (
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          Вижте стъпките и какъв е резултатът от всяка от тях.
        </p>
      )}

      <div id="choice-flow-steps" hidden={!expanded} className="mt-4">

      {/* Мобилно: времева линия */}
      <ol className="relative space-y-3 border-l border-gold/25 pl-5 sm:hidden">
        {flow.steps.map((s, i) => (
          <li key={s.title} className="relative">
            <span className="absolute -left-[1.6rem] flex h-5 w-5 items-center justify-center rounded-full border border-gold/40 bg-background text-[10px] font-bold text-gold">
              {i + 1}
            </span>
            <div className="text-sm font-semibold text-foreground">{s.title}</div>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{s.detail}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded border border-emerald-600/30 bg-emerald-600/10 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">
                {s.output}
              </span>
            </div>
          </li>
        ))}
      </ol>

      {/* Десктоп: табличен преглед */}
      <div className="hidden sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Стъпка</th>
              <th className="py-2 pr-3 font-medium">Какво правите</th>
              <th className="py-2 font-medium">Резултат</th>
            </tr>
          </thead>
          <tbody>
            {flow.steps.map((s, i) => (
              <tr key={s.title} className="border-b border-border/40 last:border-0 align-top">
                <td className="py-3 pr-3">
                  <span className="mr-2 font-serif text-gold/70">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-semibold text-foreground">{s.title}</span>
                </td>
                <td className="py-3 pr-3 text-muted-foreground">{s.detail}</td>
                <td className="py-3">
                  <span className="rounded border border-emerald-600/30 bg-emerald-600/10 px-1.5 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                    {s.output}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

        <Link to={flow.to} className="btn-gold mt-5 w-full justify-center sm:w-auto">
          {flow.cta}
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
