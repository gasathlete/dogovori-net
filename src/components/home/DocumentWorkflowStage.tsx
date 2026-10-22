import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, FileText, Palette } from "@/icons";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { WorkflowDocument, type WorkflowDocumentKind } from "./WorkflowDocument";

const STEPS = ["Избирате", "Попълвате", "Брандирате", "Преглеждате"] as const;
const NOTES = ["От покана до документ за услуги.", "Вашите условия, подредени в документ.", "Вашето лого. Вашият стил.", "Последен преглед преди следващата стъпка."] as const;

/** Manual, local-only scenes stay mounted. No saving, consent or customer input. */
export function DocumentWorkflowStage() {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<WorkflowDocumentKind>("invitation");
  const track = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (scrollTimer.current) clearTimeout(scrollTimer.current); }, []);
  const reduced = useReducedMotion();
  const go = (index: number) => {
    const next = (index + STEPS.length) % STEPS.length;
    setStep(next);
    track.current?.scrollTo?.({ left: next * track.current.clientWidth, behavior: reduced ? "auto" : "smooth" });
  };
  return (
    <div id="hero-workflow" className="commerce-workflow min-w-0 scroll-mt-28">
      <div className="mb-4 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Илюстрация · не е реална кореспонденция</span><span className="shrink-0 tabular-nums" aria-label="Текуща стъпка">0{step + 1} / 04</span></div>
      <Tabs value={String(step)} onValueChange={(value) => go(Number(value))}>
        <TabsList aria-label="Стъпки на документа" className="workflow-tabs grid h-auto w-full grid-cols-4 gap-1 bg-transparent p-0">
          {STEPS.map((title, index) => <TabsTrigger id={`workflow-tab-${index}`} aria-controls={`workflow-scene-${index}`} key={title} value={String(index)} className="min-h-12 min-w-0 flex-col gap-1 px-1 py-2 text-xs sm:text-sm"><span aria-hidden="true" className="text-xs">0{index + 1}</span>{title}</TabsTrigger>)}
        </TabsList>
        <div className="my-3 flex gap-2" role="group" aria-label="Примерен документ">
          <Button variant={kind === "invitation" ? "secondary" : "ghost"} aria-pressed={kind === "invitation"} className="min-h-11 px-3 text-xs" onClick={() => setKind("invitation")}><FileText className="size-4" />Покана · IM Development</Button>
          <Button variant={kind === "contract" ? "secondary" : "ghost"} aria-pressed={kind === "contract"} className="min-h-11 px-3 text-xs" onClick={() => setKind("contract")}>Документ за услуги</Button>
        </div>
        <div ref={track} className="workflow-scene-track" onScroll={(e) => { const node = e.currentTarget; if (scrollTimer.current) clearTimeout(scrollTimer.current); scrollTimer.current = setTimeout(() => { if (node.clientWidth) setStep(Math.min(STEPS.length - 1, Math.max(0, Math.round(node.scrollLeft / node.clientWidth)))); }, 120); }}>
          {STEPS.map((title, index) => <div key={title} id={`workflow-scene-${index}`} role="tabpanel" aria-labelledby={`workflow-tab-${index}`} aria-hidden={index !== step} ref={(node) => { if (!node) return; if (index !== step) node.setAttribute("inert", ""); else node.removeAttribute("inert"); }} className="workflow-scene">
            <p className="workflow-scene-note font-serif text-lg font-semibold">{NOTES[index]}</p>
            <WorkflowDocument kind={kind} branded={index >= 2} />
          </div>)}
        </div>
      </Tabs>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Button asChild variant="link" className="h-auto min-h-11 whitespace-normal px-0 text-left text-foreground"><Link to={step === 2 ? "/account?tab=branding" : "/build"}>{step === 2 ? <><Palette className="size-4 shrink-0" />Настройте фирмен стил</> : <>Изгответе свой документ <ArrowRight className="shrink-0" /></>}</Link></Button>
        <div className="flex shrink-0 gap-2"><Button variant="outline" size="icon" className="size-11" aria-label="Предишна стъпка" onClick={() => go(step - 1)}><ArrowLeft /></Button><Button variant="outline" size="icon" className="size-11" aria-label="Следваща стъпка" onClick={() => go(step + 1)}><ArrowRight /></Button></div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{step === 2 ? "Логото и фирменият акцент правят документите разпознаваеми. Настройките са в профила Ви; достъпът зависи от плана." : "Адаптиран демонстрационен текст. Не е пълен документ или потвърдено партньорство. Проверете внимателно преди подписване."}</p>
    </div>
  );
}
