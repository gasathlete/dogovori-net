import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "@/icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RegistrationCTA } from "./RegistrationCTA";
import { StoryCapabilityDemo } from "./StoryCapabilityDemo";
import { drainBufferedEvents } from "@/lib/bufferedEvents";
import { START_STORY_EVENT } from "@/lib/startStory";
import { clearBufferedEvents } from "@/lib/bufferedEvents";
import { trackMetric } from "@/lib/metrics";
import { CATALOG_REVIEW_STATUS } from "@/lib/templateReviewStatus";
export { openStartStory } from "@/lib/startStory";

const SCENES = [
  { label: "Задача", title: "Повече време за Вас.", text: "Опишете какво Ви е необходимо. Изберете образец или започнете изготвяне с Вашите параметри." },
  { label: "Вашият стил", title: "Вашето лого. Вашият стил.", text: "Попълнете страните и условията. Добавете Вашата фирмена идентичност към документа." },
  { label: "Анализ", title: "Вижте клаузата в контекст.", text: "При анализ на документ виждате извадка, последица и следваща стъпка. Изберете една от двете примерни клаузи." },
  { label: "DogovaryAI", title: "Уточнете въпроса си.", text: "Помощникът може да Ви помогне да подредите задачата и въпросите си. Тук отговорите са само демонстрация." },
  { label: "Образци", title: "Не започвайте от празен лист.", text: "Разгледайте образец или документи, подредени по сектор. Разглеждането не изисква регистрация." },
  { label: "Резултат", title: "Прочетете. Проверете. Допълнете.", text: "Уточнете липсващите данни преди изтегляне в PDF или DOCX. Достъпът зависи от Вашите права и налични операции. AI резултатът не е правен съвет или адвокатска проверка." },
  { label: "Начало", title: "Продължете с Вашия документ.", text: "Създайте безплатен профил. Платените продукти и планове се избират отделно — няма автоматичен абонамент." },
] as const;

/** Voluntary, local-only manual story. Radix owns focus trap, Escape and restoration. */
export function StartStoryOverlay() {
  const [open, setOpen] = useState(false);
  const [scene, setScene] = useState(0);
  const [branded, setBranded] = useState(true);
  const originFocus = useRef<HTMLElement | null>(null);
  const completed = useRef(false);
  const opened = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const show = () => {
      clearBufferedEvents(START_STORY_EVENT);
      if (opened.current) return;
      opened.current = true;
      originFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setScene(0); setBranded(true); completed.current = false; setOpen(true);
      trackMetric("story_opened", { source: "hero" });
    };
    window.addEventListener(START_STORY_EVENT, show);
    drainBufferedEvents(START_STORY_EVENT, show);
    return () => window.removeEventListener(START_STORY_EVENT, show);
  }, []);
  const move = (next: number) => {
    const bounded = Math.max(0, Math.min(SCENES.length - 1, next));
    setScene(bounded);
    if (bounded === SCENES.length - 1 && !completed.current) {
      completed.current = true; trackMetric("story_completed", { source: "hero" });
    }
  };
  const current = SCENES[scene];
  const close = () => { opened.current = false; setOpen(false); };
  return <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
    <DialogContent className="!inset-0 !h-dvh !max-h-dvh !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-none grid-rows-[auto_minmax(0,1fr)_auto] gap-3 !overflow-hidden px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(3.75rem,env(safe-area-inset-top))] motion-reduce:!animate-none [&>.dialog-close]:size-11 sm:!inset-auto sm:!left-1/2 sm:!top-1/2 sm:!h-auto sm:!max-h-[90dvh] sm:!max-w-3xl sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:!rounded-md sm:p-8"
      onCloseAutoFocus={(event) => { event.preventDefault(); if (originFocus.current?.isConnected) originFocus.current.focus(); }}
      onKeyDown={(event) => {
        if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && !(event.target instanceof HTMLElement && event.target.closest("input, textarea, select"))) {
          event.preventDefault(); move(scene + (event.key === "ArrowRight" ? 1 : -1));
        }
      }}>
      <DialogHeader className="text-left sm:pr-10">
        <DialogTitle className="font-serif text-2xl font-bold sm:text-3xl">Как работи Договори.нет</DialogTitle>
        <DialogDescription className="text-sm leading-relaxed">Демонстрация с измислени данни — не изпраща и не записва документ.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 min-w-0 overflow-y-auto" onTouchStart={(event) => { const point = event.touches[0]; if (point) touch.current = { x: point.clientX, y: point.clientY }; }} onTouchEnd={(event) => {
        const point = event.changedTouches[0]; const start = touch.current; touch.current = null;
        if (point && start && Math.abs(point.clientX - start.x) > 50 && Math.abs(point.clientX - start.x) > Math.abs(point.clientY - start.y)) move(scene + (point.clientX < start.x ? 1 : -1));
      }}>
        <nav aria-label="Стъпки на демонстрацията" className="mb-4 grid grid-cols-4 gap-1 border-b border-border pb-2 sm:grid-cols-7">
          {SCENES.map((item, index) => <Button key={item.label} variant="ghost" aria-current={index === scene ? "step" : undefined} className={`min-h-11 whitespace-normal rounded-none px-1 text-sm ${index === scene ? "border-b-2 border-gold text-foreground" : "text-muted-foreground"}`} onClick={() => move(index)}>{item.label}</Button>)}
        </nav>
        <div className="grid gap-5 sm:min-h-[310px] sm:grid-cols-[1fr_1.1fr] sm:items-start">
          <div><h2 className="font-serif text-2xl font-bold leading-tight">{current.title}</h2><p className="mt-3 text-base leading-relaxed text-muted-foreground">{current.text}</p>
            {scene === 1 && <Button variant="outline" className="mt-4 min-h-11" aria-pressed={branded} onClick={() => setBranded((value) => !value)}>{branded ? "Без брандиране" : "Добавете брандиране"}</Button>}
          </div>
          {scene >= 2 && scene <= 4 ? <StoryCapabilityDemo key={scene} kind={scene === 2 ? "analysis" : scene === 3 ? "assistant" : "catalog"} /> : <div className="border-l-2 border-gold bg-muted/40 p-4 text-sm leading-relaxed sm:p-5" aria-label="Примерна покана">
            <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
              {scene > 0 && branded && <span className="flex size-11 shrink-0 items-center justify-center border border-gold text-base font-bold text-gold" aria-label="Примерен монограм">IM</span>}
              <p className="font-semibold">{scene === 0 ? "Нова задача" : "IM Development"}<span className="block font-normal text-muted-foreground">Примерна покана за сътрудничество</span></p>
            </div>
            <p className="font-semibold">До: Договори.нет</p>
            <p className="mt-3">Предлагаме да обсъдим подготовката на документи за проект „Нов офис“.</p>
            {scene !== SCENES.length - 1 && <p className="mt-3"><strong>Обхват:</strong> уточняване на задачите, условията и начина на приемане на работата.</p>}
            {scene >= 5 && <p className="mt-3 flex items-start gap-2 text-foreground"><Check className="mt-1 size-4 shrink-0" />За допълване: срок, възнаграждение и данни на страните.</p>}
            {scene === 5 && <p className="mt-3 font-semibold">PDF · за споделяне / DOCX · за редактиране</p>}
            <p className="mt-4 border-t border-border pt-3 text-muted-foreground">Адаптиран фиктивен пример — не е реално партньорство или готов за подпис документ.</p>
          </div>}
        </div>
        {scene === 5 && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{CATALOG_REVIEW_STATUS.notice}</p>}
      </div>
      <div className="border-t border-border pt-4">
        {scene === SCENES.length - 1 ? <div onClick={close}><RegistrationCTA source="story" destination="/build" className="btn-gold mb-3 min-h-12 w-full text-base" /></div> : <Button variant="link" className="mb-2 min-h-11 w-full text-sm" onClick={() => move(SCENES.length - 1)}>Към началото с Ваш документ<ArrowRight className="ml-2 size-4" /></Button>}
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" disabled={scene === 0} className="min-h-11" onClick={() => move(scene - 1)} aria-label="Предишна стъпка"><ArrowLeft className="mr-2 size-4" />Назад</Button>
          <span className="text-sm tabular-nums text-muted-foreground" aria-live="polite">{scene + 1} / {SCENES.length}</span>
          <Button variant="ghost" className="min-h-11" onClick={() => scene === SCENES.length - 1 ? move(0) : move(scene + 1)} aria-label={scene === SCENES.length - 1 ? "Отначало" : "Следваща стъпка"}>{scene === SCENES.length - 1 ? "Отначало" : "Напред"}<ArrowRight className="ml-2 size-4" /></Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
