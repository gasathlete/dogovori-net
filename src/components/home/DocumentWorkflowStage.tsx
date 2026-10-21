import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandLogo";
import { ArrowLeft, ArrowRight, Check, FileText } from "@/icons";
import { SAMPLE_DOC, CHECK_LEDGER } from "@/components/products/previewData";

const STEPS = ["Избирате", "Попълвате", "Преглеждате"] as const;

/** Local illustration only: no save, generation, consent or customer input. */
export function DocumentWorkflowStage() {
  const [step, setStep] = useState("0");
  const touch = useRef<number | null>(null);
  const next = (direction: number) => setStep(String((Number(step) + direction + STEPS.length) % STEPS.length));
  return (
    <div id="hero-workflow" className="commerce-workflow min-w-0 scroll-mt-28">
      <div className="mb-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Демонстрация · измислен документ</span>
        <span>0{Number(step) + 1} / 03</span>
      </div>
      <Tabs value={step} onValueChange={setStep}>
        <TabsList aria-label="Стъпки на документа" className="workflow-tabs grid h-auto w-full grid-cols-3 gap-1 bg-transparent p-0">
          {STEPS.map((title, index) => <TabsTrigger key={title} value={String(index)} className="min-h-12 gap-2 px-2 py-3 text-xs sm:text-sm"><span aria-hidden="true">0{index + 1}</span>{title}</TabsTrigger>)}
        </TabsList>
        <div className="workflow-paper mt-5" onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }} onTouchEnd={(e) => { const start = touch.current; touch.current = null; const end = e.changedTouches[0]?.clientX; if (start !== null && end !== undefined && Math.abs(end - start) > 60) next(end < start ? 1 : -1); }}>
          <div className="flex items-center justify-between border-b border-border pb-4"><span className="font-serif text-sm font-semibold">Договори.нет</span><BrandMark decorative className="h-12 w-14" /></div>
          <TabsContent value="0" className="workflow-page-content">
            <p className="text-xs text-muted-foreground">Документ за Вашата работа</p>
            <h2 className="mt-3 font-serif text-3xl font-bold leading-tight">{SAMPLE_DOC.title}</h2>
            <div className="mt-6 space-y-3">{[SAMPLE_DOC.title, "Приемно-предавателен протокол", "Пълномощно"].map((title, i) => <div key={title} className={`flex items-center gap-3 border p-3 text-sm ${i === 0 ? "border-gold bg-secondary" : "border-border"}`}><FileText className="size-4 shrink-0 text-gold" /><span className="flex-1">{title}</span>{i === 0 && <Check className="size-4 text-gold" />}</div>)}</div>
            <p className="mt-5 text-xs text-muted-foreground">Образецът е отправна точка. Условията зависят от Вашия случай.</p>
          </TabsContent>
          <TabsContent value="1" className="workflow-page-content">
            <p className="text-xs text-muted-foreground">Примерни параметри</p><h2 className="mt-3 font-serif text-3xl font-bold">Детайлите имат значение.</h2>
            <dl className="mt-6 space-y-4">{CHECK_LEDGER.slice(0, 3).map((row) => <div key={row.label} className="border-b border-border pb-3"><dt className="text-xs text-muted-foreground">{row.label}</dt><dd className="mt-1 text-sm font-semibold">{row.value}</dd></div>)}</dl>
            <p className="mt-5 text-xs text-muted-foreground">Измислени стойности — не се изпращат и не се запазват.</p>
          </TabsContent>
          <TabsContent value="2" className="workflow-page-content">
            <p className="text-xs text-muted-foreground">Илюстративен преглед</p><h2 className="mt-3 font-serif text-3xl font-bold">{SAMPLE_DOC.title}</h2>
            <p className="mt-4 font-serif text-sm leading-relaxed">{SAMPLE_DOC.parties}</p>
            <dl className="mt-5 space-y-3">{CHECK_LEDGER.slice(0, 2).map((row, i) => <div key={row.label}><dt className="text-sm font-semibold">{i + 1}. {row.label}</dt><dd className="mt-1 font-serif text-sm text-muted-foreground">{row.value}</dd></div>)}</dl>
            <div className="workflow-lines mt-6" aria-hidden="true"><span /><span /><span /></div>
            <p className="mt-5 text-xs text-muted-foreground">Проверете внимателно преди подписване. Примерът не е пълен документ.</p>
          </TabsContent>
          <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground"><span>Пример, не Вашият документ</span><span aria-hidden="true">ДН / 01</span></div>
        </div>
      </Tabs>
      <div className="mt-5 flex items-center justify-between gap-3">
        <Button asChild variant="link" className="h-auto min-h-11 whitespace-normal px-0 text-foreground"><Link to="/build">Изгответе свой документ <ArrowRight /></Link></Button>
        <div className="flex gap-2"><Button variant="outline" size="icon" className="size-11" aria-label="Предишна стъпка" onClick={() => next(-1)}><ArrowLeft /></Button><Button variant="outline" size="icon" className="size-11" aria-label="Следваща стъпка" onClick={() => next(1)}><ArrowRight /></Button></div>
      </div>
    </div>
  );
}