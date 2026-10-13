/** „Какво ми трябва?“ за комплекти с кратък въпросник. Отговорите са само в паметта. */
import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";
import { ArrowRight, FileText } from "@/icons";
import { allTemplates } from "@/lib/templateIndex";
import { KIT_GUIDES } from "@/lib/catalogMatrix";
import {
  CHECKLIST_PREPARATIONS, DECISION_LABEL, planChecklist, type TriAnswer,
} from "@/lib/taskPreparation/checklistPreparation";

const OPTIONS: { value: TriAnswer; label: string }[] = [
  { value: "yes", label: "Да" }, { value: "no", label: "Не" }, { value: "unknown", label: "Не е преценено" },
];

export default function KitChecklistPreparation() {
  const { slug = "" } = useParams();
  const def = CHECKLIST_PREPARATIONS[slug];
  const [answers, setAnswers] = useState<Record<string, TriAnswer>>({});
  const slugByName = useMemo(() => new Map(allTemplates().map((t) => [t.doc.name, t.slug])), []);
  const plan = useMemo(() => (def ? planChecklist(def, answers) : []), [def, answers]);
  if (!def) return <Navigate to={`/komplekti/${slug}`} replace />;
  const guide = KIT_GUIDES[def.kitId];

  return (
    <>
      <Seo title={`${def.title} | Подготовка`} description="Отговорете на няколко въпроса и вижте кои документи от комплекта са нужни." canonical={`https://dogovori.net/komplekti/${def.kitId}`} noindex />
      <Header />
      <main className="bg-background">
        <div className="container max-w-3xl py-10">
          <nav className="mb-5 text-xs text-muted-foreground"><Link to={`/komplekti/${def.kitId}`} className="hover:text-gold">← Към комплекта</Link></nav>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/80">Какво ми трябва?</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">{def.title}</h1>
          {guide && <p className="mt-3 text-sm text-muted-foreground"><span className="text-gold">Подгответе:</span> {guide.whatYouNeed}</p>}

          <section aria-labelledby="q-heading" className="mt-8 rounded-xl border border-border/60 bg-card p-5">
            <h2 id="q-heading" className="font-serif text-lg font-bold">Въпроси</h2>
            <p className="mt-1 text-xs text-muted-foreground">Не въвеждате лични данни. Отговорите не се записват.</p>
            <div className="mt-4 space-y-5">
              {def.questions.map((q) => (
                <fieldset key={q.id}>
                  <legend className="text-sm font-medium">{q.label}</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {OPTIONS.map((o) => {
                      const active = (answers[q.id] ?? "unknown") === o.value;
                      return (
                        <button key={o.value} type="button" aria-pressed={active}
                          onClick={() => setAnswers((p) => ({ ...p, [q.id]: o.value }))}
                          className={`min-h-11 rounded-lg border px-4 text-sm ${active ? "border-gold bg-gold/10 text-gold" : "border-border/60 text-muted-foreground"}`}>
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>

          <section aria-labelledby="docs-heading" className="mt-8">
            <h2 id="docs-heading" className="font-serif text-lg font-bold">Документите за Вашия случай</h2>
            <ul className="mt-4 space-y-2">
              {plan.map((item) => {
                const docSlug = slugByName.get(item.docName);
                return (
                  <li key={item.docName} data-decision={item.decision} className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      {docSlug ? (
                        <Link to={`/shablon/${docSlug}`} className="inline-flex items-center gap-2 text-sm font-semibold hover:text-gold"><FileText className="size-4 text-gold" />{item.docName}</Link>
                      ) : (
                        <span className="text-sm font-semibold">{item.docName} · В подготовка</span>
                      )}
                      {item.note && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}
                    </div>
                    <span className="text-xs font-semibold text-gold/90">{DECISION_LABEL[item.decision]}</span>
                  </li>
                );
              })}
            </ul>
            {guide && <p className="mt-5 text-sm text-muted-foreground"><span className="text-gold">Какво следва:</span> {guide.nextStep}</p>}
            <p className="mt-3 text-xs text-muted-foreground">Списъкът е ориентир, не правен съвет. Данните въвеждате във всеки документ.</p>
            <Link to={`/komplekti/${def.kitId}`} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold">Целият комплект <ArrowRight className="size-4" /></Link>
          </section>
          <LaunchPurchaseBanner className="mt-8" source="kit_detail" productId={`kit_${def.kitId.replace(/-/g, "_")}`} />
        </div>
      </main>
      <SeoFooter />
    </>
  );
}
