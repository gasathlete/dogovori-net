import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CHECK_FINDINGS } from "@/components/products/previewData";

const QUESTIONS = [
  { question: "Какво да уточним за проекта?", answer: "Опишете резултата, срока, възнаграждението и начина за приемане на работата. Отбележете как ще се уговарят допълнителните задачи." },
  { question: "Как да подготвим прегледа?", answer: "Съберете уговорените условия и отбележете неясните места. За конкретната правна преценка се обърнете към юрист." },
] as const;

/** Fixed illustrative choices only: no requests, uploads, exports or persisted state. */
export function StoryCapabilityDemo({ kind }: { kind: "analysis" | "assistant" | "catalog" }) {
  const [selected, setSelected] = useState(0);
  const shell = "border-l-2 border-gold bg-muted/40 p-4 text-sm leading-relaxed sm:p-5";
  if (kind === "analysis") {
    const finding = CHECK_FINDINGS[selected];
    if (!finding) return null;
    return <section className={shell} aria-label="Демонстрация на анализ">
      <p className="mb-3 font-semibold">Примерен договор за изработка</p>
      <div className="flex flex-wrap gap-2">
        {CHECK_FINDINGS.slice(0, 2).map((item, index) => <Button key={item.title} variant={selected === index ? "secondary" : "outline"} aria-pressed={selected === index} className="min-h-11 h-auto whitespace-normal text-left" onClick={() => setSelected(index)}>{index === 0 ? "Неустойка" : "Плащане"}</Button>)}
      </div>
      <div aria-live="polite">
        <p className="mt-4 font-semibold text-gold">{finding.location} · {finding.severity} тежест</p>
        <blockquote className="my-3 border-l-2 border-gold pl-3">{finding.excerpt}</blockquote>
        <p>{finding.consequence}</p>
        <p className="mt-3"><strong>За обсъждане: </strong>{finding.nextStep}</p>
      </div>
      <p className="mt-4 border-t border-border pt-3 text-muted-foreground">Измислен документ. Примерната находка не е правна оценка на Вашия случай.</p>
    </section>;
  }
  if (kind === "assistant") return <section className={shell} aria-label="Демонстрация на DogovaryAI">
    <p className="mb-3 font-semibold">DogovaryAI · проект „Нов офис“</p>
    <div className="space-y-2">{QUESTIONS.map((item, index) => <Button key={item.question} variant={selected === index ? "secondary" : "outline"} aria-pressed={selected === index} className="min-h-11 h-auto w-full justify-start whitespace-normal text-left" onClick={() => setSelected(index)}>{item.question}</Button>)}</div>
    <p className="mt-4 border-t border-border pt-3" aria-live="polite">{QUESTIONS[selected]?.answer}</p>
    <p className="mt-4 text-muted-foreground">Предварително написан примерен отговор, не реална AI заявка.</p>
  </section>;
  return <section className={shell} aria-label="Демонстрация на каталог">
    <p className="mb-3 font-semibold">Документи за Вашата задача</p>
    <div className="flex flex-wrap gap-2">
      <Button variant={selected === 0 ? "secondary" : "outline"} aria-pressed={selected === 0} className="min-h-11" onClick={() => setSelected(0)}>Образец</Button>
      <Button variant={selected === 1 ? "secondary" : "outline"} aria-pressed={selected === 1} className="min-h-11" onClick={() => setSelected(1)}>Секторен пакет</Button>
    </div>
    <div className="mt-4" aria-live="polite">{selected === 0 ? <><h3 className="font-serif text-xl font-bold">Договор за изработка</h3><p className="mt-2">Отворете образеца в каталога и прегледайте условията, преди да го адаптирате.</p></> : <><h3 className="font-serif text-xl font-bold">Услуги и свободни професии</h3><p className="mt-2">Разгледайте документите и последователността за сектора. Предстоящите позиции са означени отделно.</p></>}</div>
  </section>;
}