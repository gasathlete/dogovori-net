import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "@/icons";
import { Button } from "@/components/ui/button";
import { taskRecommendation, type DocumentTask, type NewDocumentChoice } from "@/lib/taskRecommendation";
import { trackMetric } from "@/lib/metrics";

export function TaskChooser() {
  const [task, setTask] = useState<DocumentTask | null>(null);
  const [choice, setChoice] = useState<NewDocumentChoice | null>(null);
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const recommendation = task && (task !== "new" || choice) ? taskRecommendation(task, choice ?? "template") : null;
  const select = (nextTask: DocumentTask, nextChoice?: NewDocumentChoice) => {
    setTask(nextTask); setChoice(nextChoice ?? null);
    if (nextTask !== "new" || nextChoice) trackMetric("guide_completed", { recommendation: taskRecommendation(nextTask, nextChoice).id, source: "home" });
    requestAnimationFrame(() => heading.current?.focus());
  };
  return <div className="mt-3 max-w-xl border-y border-border py-2">
    <Button variant="link" className="min-h-11 whitespace-normal px-0 text-left text-base" aria-expanded={open} aria-controls="home-task-chooser" onClick={() => { setOpen(!open); }}>Не знаете откъде да започнете? <ArrowRight className="size-4 shrink-0" /></Button>
    {open && <section id="home-task-chooser" className="pb-4" aria-labelledby="guide-heading">
      <p className="text-xs text-muted-foreground">{recommendation ? "Вашият избор" : task === "new" ? "Въпрос 2 от 2" : "Въпрос 1 от най-много 2"}</p>
      <h2 id="guide-heading" ref={heading} tabIndex={-1} className="mt-2 font-serif text-xl font-semibold focus:outline-none">{recommendation?.title ?? (task === "new" ? "Как искате да започнете?" : "Какво Ви предстои?")}</h2>
      {recommendation ? <>
        <p className="mt-2 text-sm leading-relaxed">{recommendation.reason}</p>
        <p className="mt-2 text-sm font-semibold">{recommendation.price}</p>
        <p className="mt-1 text-sm text-muted-foreground">{recommendation.next}{!recommendation.available && " Новата обработка е временно недостъпна; можете да разгледате."}</p>
        <Button asChild className="mt-3 min-h-12 w-full"><Link to={recommendation.to} onClick={() => trackMetric("guide_recommendation_clicked", { recommendation: recommendation.id, source: "home" })}>Разгледайте избора <ArrowRight className="size-4" /></Link></Button>
        <Link to="/produkti" className="mt-2 inline-flex min-h-11 items-center text-sm underline">Сравнете еднократните продукти</Link>
      </> : <div className="mt-3 grid gap-2">
        {task === "new" ? <>
          <Button variant="outline" className="min-h-12 justify-start whitespace-normal text-left" onClick={() => select("new", "template")}>Искам образец, който да разгледам</Button>
          <Button variant="outline" className="min-h-12 justify-start whitespace-normal text-left" onClick={() => select("new", "tailored")}>Искам да задам свои условия</Button>
        </> : <>
          <Button variant="outline" className="min-h-12 justify-start" onClick={() => select("new")}>Трябва ми нов документ</Button>
          <Button variant="outline" className="min-h-12 justify-start" onClick={() => select("existing")}>Имам документ за проверка</Button>
          <Button variant="outline" className="min-h-12 justify-start" onClick={() => select("sequence")}>Трябват ми няколко документа</Button>
        </>}
      </div>}
      {task && <Button variant="ghost" className="mt-2 min-h-11" onClick={() => { if (choice) setChoice(null); else setTask(null); requestAnimationFrame(() => heading.current?.focus()); }}><ArrowLeft className="size-4" /> Назад</Button>}
    </section>}
  </div>;
}