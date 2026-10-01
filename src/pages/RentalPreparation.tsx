/**
 * Подготовка за отдаване на обзаведено жилище под наем.
 * Отговорите живеят само в паметта на страницата (без localStorage/analytics).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";
import { ArrowRight, FileText, Package } from "@/icons";
import { allTemplates } from "@/lib/templateIndex";
import { trackFunnelEvent } from "@/lib/funnel";
import type { Ctx } from "@/lib/expressionEvaluator";
import type { ResolvedQuestion } from "@/lib/questionGraph";
import {
  RENTAL_INITIAL_ANSWERS,
  RENTAL_KIT_ID,
  isUnsupportedProperty,
  RENTAL_PREPARATION_GRAPH,
  planRentalDocuments,
  pruneRentalAnswers,
  resolveRentalPreparation,
} from "@/lib/taskPreparation/rentalPreparation";
import { clearPreparation, getPreparation, setPreparationAnswers } from "@/lib/taskPreparation/preparationStore";
import { hasRentalPrefill } from "@/lib/taskPreparation/rentalFieldMap";

function initialAnswers(): Ctx {
  const p = getPreparation();
  return p && p.kitId === RENTAL_KIT_ID ? { ...p.answers } : { ...RENTAL_INITIAL_ANSWERS };
}

const SECTIONS = RENTAL_PREPARATION_GRAPH.sections;
const REVIEW_STEP = SECTIONS.length;

function formatAnswer(q: ResolvedQuestion, v: unknown): string {
  if (v == null || v === "") return "—";
  if (q.field_type === "boolean") return v ? "Да" : "Не";
  if (q.options) return q.options.find((o) => o.value === v)?.label ?? String(v);
  if (q.field_type === "money") return `${v} €`;
  return String(v);
}

function Field({ q, value, onChange }: { q: ResolvedQuestion; value: unknown; onChange: (v: unknown) => void }) {
  const id = `f-${q.id}`;
  const base = "mt-1.5 w-full min-h-[44px] rounded-lg border border-border bg-background px-3 text-base text-foreground focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30";
  let control: JSX.Element;
  if (q.field_type === "boolean") {
    control = (
      <div role="radiogroup" aria-labelledby={`${id}-l`} className="mt-1.5 flex gap-2">
        {[true, false].map((b) => (
          <button key={String(b)} type="button" role="radio" aria-checked={value === b}
            onClick={() => onChange(b)}
            className={`min-h-[44px] flex-1 rounded-lg border px-4 text-sm font-semibold ${value === b ? "border-gold bg-gold/10 text-gold" : "border-border text-foreground"}`}>
            {b ? "Да" : "Не"}
          </button>
        ))}
      </div>
    );
  } else if (q.field_type === "select" && q.options) {
    control = (
      <select id={id} className={base} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Изберете…</option>
        {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else if (q.field_type === "longtext") {
    control = <textarea id={id} rows={3} className={`${base} py-2`} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  } else {
    const type = q.field_type === "date" ? "date" : q.field_type === "number" || q.field_type === "money" ? "number" : "text";
    control = <input id={id} type={type} inputMode={type === "number" ? "decimal" : undefined} className={base}
      value={(value as string | number) ?? ""} onChange={(e) => onChange(type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)} />;
  }
  return (
    <div>
      <label id={`${id}-l`} htmlFor={id} className="text-sm font-semibold text-foreground">
        {q.label}{q.required && <span className="text-gold"> *</span>}
      </label>
      {q.help && <p className="mt-0.5 text-xs text-muted-foreground">{q.help}</p>}
      {control}
    </div>
  );
}

export default function RentalPreparationPage() {
  const [answers, setAnswers] = useState<Ctx>(initialAnswers);
  // Само в паметта — за да оцелеят при отваряне на документ и връщане тук.
  useEffect(() => { setPreparationAnswers(RENTAL_KIT_ID, pruneRentalAnswers(answers)); }, [answers]);
  const unsupported = isUnsupportedProperty(answers);
  const clearAll = () => { clearPreparation(); setAnswers({ ...RENTAL_INITIAL_ANSWERS }); setStep(0); };
  const [step, setStep] = useState(0);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [step]);

  const resolved = useMemo(() => resolveRentalPreparation(answers), [answers]);
  const slugs = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of allTemplates()) m.set(t.doc.name, t.slug);
    return m;
  }, []);
  const docs = useMemo(() => planRentalDocuments(pruneRentalAnswers(answers), slugs), [answers, slugs]);

  const set = (id: string, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }));
  const go = (n: number) => {
    setStep(n);
    // Само номер на стъпка — без отговори/лични данни.
    trackFunnelEvent("task_preparation_step", { task: "furnished-rental", step: n });
  };

  const currentSection = step < REVIEW_STEP ? resolved.sections.find((s) => s.id === SECTIONS[step].id) : undefined;
  const sectionMissing = currentSection?.questions.filter((q) => q.required && resolved.missingRequired.includes(q.id)) ?? [];

  return (
    <>
      <Seo
        title="Подготовка: отдавам обзаведено жилище под наем | Договори.нет"
        description="Въведете общите данни веднъж и вижте кои документи от комплекта за наем на жилище са приложими за Вашия случай."
        canonical="https://dogovori.net/komplekti/naem-zhilishte"
        noindex
      />
      <Header />
      <main className="bg-background pb-24">
        <div className="container max-w-3xl py-10">
          <nav className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Навигация">
            <Link to="/start" className="hover:text-gold">Какво искате да направите?</Link><span>/</span>
            <Link to="/komplekti/naem-zhilishte" className="hover:text-gold">Наем на жилище</Link>
          </nav>
          <h1 className="font-serif text-3xl font-bold leading-tight text-balance">Отдавам обзаведено жилище под наем</h1>
          <p className="mt-2 text-sm text-muted-foreground">Въвеждате общите данни веднъж. Показваме кои документи от комплекта са приложими. Данните остават само в този прозорец и се губят при затварянето му.</p>

          <ol className="mt-6 flex flex-wrap gap-2" aria-label="Стъпки">
            {[...SECTIONS.map((s) => s.title), "Преглед"].map((t, i) => (
              <li key={t}>
                <button type="button" onClick={() => go(i)} aria-current={i === step ? "step" : undefined}
                  className={`min-h-[44px] rounded-full border px-3.5 text-xs font-semibold ${i === step ? "border-gold bg-gold/10 text-gold" : "border-border/60 text-muted-foreground"}`}>
                  {i + 1}. {t}
                </button>
              </li>
            ))}
          </ol>

          {currentSection && (
            <section className="mt-6 space-y-5 rounded-xl border border-border/60 bg-card p-5 sm:p-6" aria-labelledby="sec-h">
              <h2 id="sec-h" className="font-serif text-xl font-bold">{currentSection.title}</h2>
              {currentSection.questions.map((q) => (
                <Field key={q.id} q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} />
              ))}
              {currentSection.id === "property" && unsupported && (
                <p role="alert" className="rounded-lg border border-gold/30 bg-gold/5 p-3 text-xs text-foreground">
                  Тази подготовка е за апартамент или къща. За стая отворете директно{" "}
                  <Link to="/shablon/dogovor-za-naem-na-zhilishte" className="font-semibold text-gold underline">договора за наем на жилище</Link>
                  ; за търговско помещение — комплекта{" "}
                  <Link to="/komplekti/naem-ofis" className="font-semibold text-gold underline">Наем на офис / търговски обект</Link>.
                </p>
              )}
              {sectionMissing.length > 0 && (
                <p className="text-xs text-muted-foreground">Незадължително за продължаване, но ще липсва в обобщението: {sectionMissing.map((q) => q.label).join(", ")}.</p>
              )}
              <div className="flex justify-between gap-3 pt-2">
                <button type="button" disabled={step === 0} onClick={() => go(step - 1)} className="min-h-[44px] rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-40">Назад</button>
                <button type="button" onClick={() => go(step + 1)} className="btn-gold min-h-[44px] rounded-lg px-5 text-sm font-bold">Напред</button>
              </div>
            </section>
          )}

          {step === REVIEW_STEP && (
            <div className="mt-6 space-y-8">
              <section aria-labelledby="sum-h" className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
                <h2 id="sum-h" className="font-serif text-xl font-bold">Обобщение на данните</h2>
                {resolved.sections.map((s, i) => (
                  <div key={s.id} className="mt-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold/80">{s.title}</h3>
                      <button type="button" onClick={() => go(i)} className="min-h-[44px] px-2 text-xs font-semibold text-gold hover:underline">Редактирай</button>
                    </div>
                    <dl className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                      {s.questions.map((q) => (
                        <div key={q.id} className="contents">
                          <dt className="text-muted-foreground">{q.label}</dt>
                          <dd className="font-medium text-foreground">{formatAnswer(q, answers[q.id])}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
                {!resolved.isComplete && (
                  <p className="mt-4 rounded-lg border border-gold/30 bg-gold/5 p-3 text-xs text-foreground">Липсват {resolved.missingRequired.length} задължителни данни. Можете да ги допълните преди да подготвите документите.</p>
                )}
              </section>

              {unsupported ? (
              <section aria-labelledby="docs-h" className="rounded-xl border border-gold/30 bg-gold/5 p-5">
                <h2 id="docs-h" className="font-serif text-xl font-bold">Изберете друг път</h2>
                <p className="mt-1 text-sm text-muted-foreground">Списъкът за обзаведено жилище не се прилага за избрания тип имот. Върнете се към стъпка „Жилище“ или отворете{" "}
                  <Link to="/komplekti/naem-ofis" className="font-semibold text-gold underline">комплекта за търговски обект</Link>.</p>
              </section>
              ) : (
              <section aria-labelledby="docs-h">
                <h2 id="docs-h" className="font-serif text-xl font-bold">Документи за Вашия случай</h2>
                <p className="mt-1 text-sm text-muted-foreground">Всеки документ се отваря на страницата си в каталога. Където е посочено, въпросникът на документа се отваря с предварително попълнени данни от тази подготовка. В останалите въведете данните сами. Изтеглянето следва текущите ограничения на тестовия период.</p>
                <ul className="mt-4 space-y-2" data-testid="prepared-docs">
                  {docs.map((d) => (
                    <li key={d.docName} data-status={d.status} data-included={d.included}
                      className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-3 ${d.status === "planned" ? "border-dashed border-border/60" : "border-border/60 bg-card/40"} ${d.included ? "" : "opacity-75"}`}>
                      <div className="flex min-w-0 gap-3">
                        {d.status === "planned" ? <Package className="mt-0.5 h-4 w-4 shrink-0 text-gold/70" /> : <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold/70" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{d.docName}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {d.stageLabel} · {d.status === "planned" ? "Планирано — още не е в каталога" : d.pending ? "Липсва отговор" : d.included ? "Включен" : d.later ? "По-късно" : d.notAssessed ? "Не е преценен" : "Не е нужен"} · {d.reason}
                          </p>
                          {d.status === "available" && d.slug && hasRentalPrefill(d.slug) && (
                            <p className="mt-0.5 text-xs font-medium text-gold">С предварително попълнени данни във въпросника</p>
                          )}
                        </div>
                      </div>
                      {d.status === "available" && d.slug && (
                        <Link to={`/shablon/${d.slug}`} className="inline-flex min-h-[44px] shrink-0 items-center gap-1 text-sm font-semibold text-gold hover:underline">
                          Отвори <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              )}

              <section aria-labelledby="next-h" className="rounded-xl border border-gold/20 bg-gold/5 p-5">
                <h2 id="next-h" className="font-serif text-lg font-bold">Следващи стъпки</h2>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Отворете включените документи в реда по-горе, проверете предварително попълнените полета и допълнете останалите.</li>
                  <li>Прегледайте текста спрямо конкретния случай преди подписване.</li>
                  <li>При предаване на жилището подпишете протокола и описа заедно с наемателя.</li>
                </ol>
              </section>

              <button type="button" onClick={clearAll} className="min-h-[44px] text-sm font-semibold text-muted-foreground underline hover:text-foreground">Изчисти данните от подготовката</button>

              <LaunchPurchaseBanner source="kit_detail" productId="kit_naem_zhilishte" />
            </div>
          )}
        </div>
      </main>
      <SeoFooter />
    </>
  );
}
