import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ddsKalkulator } from "@/data/calculators/dds-kalkulator";
import { notarialnaTaksa } from "@/data/calculators/notarialna-taksa";
import { platenOtpusk } from "@/data/calculators/platen-otpusk";
import type { Calculator } from "@/data/calculators/types";
import { ArrowRight } from "@/icons";

const TOOLS = [ddsKalkulator, notarialnaTaksa, platenOtpusk];
function WorkingCalculator({ calculator }: { calculator: Calculator }) {
  const [values, setValues] = useState<Record<string, string | number>>(() => Object.fromEntries(calculator.fields.map((f) => [f.key, f.default ?? (f.type === "select" ? f.options[0]?.value ?? "" : f.type === "number" ? 0 : "")])));
  const result = calculator.compute(values);
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div><h3 className="font-serif text-2xl font-bold">{calculator.shortTitle}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{calculator.description}</p><div className="mt-6 grid gap-4 sm:grid-cols-2">{calculator.fields.map((field) => <div key={field.key}><label htmlFor={`home-calc-${calculator.slug}-${field.key}`} className="mb-2 block text-sm font-medium">{field.label}{"unit" in field && field.unit ? ` (${field.unit})` : ""}</label>{field.type === "select" ? <select id={`home-calc-${calculator.slug}-${field.key}`} value={values[field.key]} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))} className="min-h-11 w-full rounded border border-input bg-background px-3 text-foreground">{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input id={`home-calc-${calculator.slug}-${field.key}`} type={field.type} min={field.type === "number" ? field.min : undefined} max={field.type === "number" ? field.max : undefined} step={field.type === "number" ? field.step ?? .01 : undefined} value={values[field.key]} onChange={(e) => setValues((v) => ({ ...v, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value }))} className="min-h-11 w-full rounded border border-input bg-background px-3 text-foreground" />}</div>)}</div></div>
      <div className="border-l-2 border-gold bg-card p-6 sm:p-8"><p className="text-sm text-muted-foreground">{result.main.label}</p><p className="mt-3 font-serif text-4xl font-bold text-gold" data-testid="home-calculator-result">{result.main.value}</p><dl className="mt-6 space-y-3">{result.breakdown.map((row, i) => <div key={i} className="flex flex-wrap justify-between gap-2 border-b border-border pb-3 text-sm"><dt className="text-muted-foreground">{row.label}</dt><dd className="font-semibold">{row.value}</dd></div>)}</dl>{result.notes?.map((note) => <p key={note} className="mt-4 text-sm leading-relaxed text-muted-foreground">{note}</p>)}<Button asChild variant="outline" className="mt-6 min-h-11"><Link to={`/tools/${calculator.slug}`}>Пълен калкулатор и основания<ArrowRight /></Link></Button></div>
    </div>
  );
}
export function ToolExperience() {
  return (
    <section className="brand-plans-band border-b border-border py-14 sm:py-20" aria-labelledby="home-tools-heading"><div className="container"><div className="mb-8 flex items-start gap-5"><div><h2 id="home-tools-heading" className="font-serif text-3xl font-bold sm:text-4xl">Инструменти за ежедневните сметки</h2><p className="mt-3 text-muted-foreground">Изчислете с Ваши стойности. Резултатът е ориентировъчен; условията и основанията са в пълния инструмент.</p></div></div><Tabs defaultValue={TOOLS[0].slug}><TabsList aria-label="Изберете калкулатор" className="mb-8 flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">{TOOLS.map((c) => <TabsTrigger key={c.slug} value={c.slug} className="min-h-11 whitespace-normal border border-border px-4 py-3">{c.shortTitle}</TabsTrigger>)}</TabsList>{TOOLS.map((c) => <TabsContent key={c.slug} value={c.slug}><WorkingCalculator calculator={c} /></TabsContent>)}</Tabs><div className="mt-8 flex flex-wrap gap-6 border-t border-border pt-5"><Link className="link-ink min-h-11 py-3" to="/tools">Всички инструменти →</Link><Link className="link-ink min-h-11 py-3" to="/sravni">Сравнение на образци →</Link></div></div></section>
  );
}