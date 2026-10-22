import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check } from "@/icons";

const STEPS = ["Попълнете", "Вашият бранд", "Готово за преглед"] as const;
const SHORT = ["Данни", "Бранд", "Преглед"] as const;
const ACCENTS = [
  { id: "gold", label: "Злато", token: "var(--gold)" },
  { id: "ink", label: "Мастило", token: "var(--brand-ink)" },
  { id: "bronze", label: "Бронз", token: "var(--commerce-gold)" },
] as const;
type AccentId = (typeof ACCENTS)[number]["id"];

/** Local-only interactive demo. Nothing is saved, sent or submitted. */
export function DocumentWorkflowStage() {
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState("IM Development");
  const [project, setProject] = useState("фирмени документи за наеми и услуги");
  const [accent, setAccent] = useState<AccentId>("gold");
  const [showLogo, setShowLogo] = useState(true);
  const [flash, setFlash] = useState<"company" | "project" | "brand" | null>(null);
  const touch = useRef<number | null>(null);
  const uid = useId();
  const go = (i: number) => setStep((i + STEPS.length) % STEPS.length);
  const ping = (f: typeof flash) => { setFlash(f); window.setTimeout(() => setFlash((c) => (c === f ? null : c)), 900); };
  const branded = step >= 1;
  const accentToken = ACCENTS.find((a) => a.id === accent)!.token;
  const name = company.trim() || "Вашата фирма";
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div id="hero-workflow" className="commerce-workflow workspace min-w-0 scroll-mt-28">
      <div className="workspace-toolbar">
        <span className="workspace-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="truncate text-xs">Покана за сътрудничество · пример</span>
        <span className="ml-auto shrink-0 text-xs tabular-nums" aria-label="Текуща стъпка">{step + 1} / {STEPS.length}</span>
      </div>
      <div role="tablist" aria-label="Стъпки на примера" className="workspace-steps">
        {STEPS.map((title, i) => (
          <button key={title} type="button" role="tab" id={`${uid}-t${i}`} aria-selected={i === step} aria-controls={`${uid}-p`} onClick={() => go(i)} className="workspace-step" data-active={i === step} data-done={i < step}>
            <span aria-hidden="true" className="workspace-step-num">{i < step ? <Check className="size-3" /> : i + 1}</span><span className="workspace-step-long">{title}</span><span className="workspace-step-short" aria-hidden="true">{SHORT[i]}</span>
          </button>
        ))}
      </div>
      <div className="workspace-body" onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }} onTouchEnd={(e) => { const s = touch.current; touch.current = null; const end = e.changedTouches[0]?.clientX; if (s !== null && end !== undefined && Math.abs(end - s) > 50) go(step + (end < s ? 1 : -1)); }}>
        <div id={`${uid}-p`} role="tabpanel" aria-labelledby={`${uid}-t${step}`} className="workspace-panel">
          {step === 0 && (
            <div className="workspace-inputs grid gap-3">
              <label className="workspace-field"><span>Фирма</span><input value={company} maxLength={40} onChange={(e) => { setCompany(e.target.value); ping("company"); }} /></label>
              <label className="workspace-field"><span>Относно</span><input value={project} maxLength={60} onChange={(e) => { setProject(e.target.value); ping("project"); }} /></label>
              <p className="workspace-hint text-xs text-muted-foreground">Пишете — документът вдясно се променя веднага. Нищо не се записва.</p>
            </div>
          )}
          {step === 1 && (
            <div className="grid gap-3">
              <p className="workspace-hint text-sm font-medium">Акцентен цвят</p>
              <div className="workspace-brand-row flex flex-wrap gap-2"><div className="flex gap-2" role="radiogroup" aria-label="Акцентен цвят">
                {ACCENTS.map((a) => (
                  <button key={a.id} type="button" role="radio" aria-checked={accent === a.id} aria-label={a.label} onClick={() => { setAccent(a.id); ping("brand"); }} className="workspace-swatch" data-on={accent === a.id}>
                    <span style={{ background: `hsl(${a.token})` }} aria-hidden="true" /><span className="workspace-swatch-label">{a.label}</span>
                  </button>
                ))}
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={showLogo} aria-label="Лого в бланката" onChange={(e) => { setShowLogo(e.target.checked); ping("brand"); }} />Лого</label></div>
              <p className="workspace-hint text-xs text-muted-foreground">Вашето лого. Вашият стил — на всеки документ.</p>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-3">
              <ul className="workspace-hint grid gap-2 text-sm">
                <li className="flex gap-2"><Check className="size-4 shrink-0 text-gold" />Данните са попълнени</li>
                <li className="flex gap-2"><Check className="size-4 shrink-0 text-gold" />Фирменият стил е приложен</li>
                <li className="flex gap-2"><Check className="size-4 shrink-0 text-gold" />PDF или DOCX след преглед</li>
              </ul>
              <Button asChild className="min-h-11 w-full"><Link to="/build">Изгответе свой документ <ArrowRight /></Link></Button>
            </div>
          )}
        </div>
        <article className="workspace-preview" data-branded={branded} style={{ ["--ws-accent" as string]: `hsl(${accentToken})` }} aria-label="Преглед на примерния документ" aria-live="off">
          <header className={`workspace-letterhead ${flash === "brand" ? "ws-flash" : ""}`}>
            {branded && showLogo && <span className="workspace-mono" aria-hidden="true">{initials}</span>}
            <div className="min-w-0">
              <p className={`truncate font-serif text-base font-bold ${flash === "company" ? "ws-flash" : ""}`}>{name}</p>
              <p className="text-[11px] text-muted-foreground">Изх. № ПРИМЕР–01 · 02.09.2026 г.</p>
            </div>
          </header>
          <p className="workspace-addressee mt-3 text-xs text-muted-foreground">До екипа на Договори.нет</p>
          <h3 className="mt-2 font-serif text-lg font-bold leading-tight">Покана за сътрудничество</h3>
          <p className="workspace-copy mt-2 text-[13px] leading-relaxed">
            От името на <mark className={flash === "company" ? "ws-flash" : ""}>{name}</mark> Ви каним да обсъдим подготовката на <mark className={flash === "project" ? "ws-flash" : ""}>{project.trim() || "нашите документи"}</mark> с ясен текст и единен фирмен облик.
          </p>
          <div className="workspace-sig mt-auto flex items-end justify-between gap-3 pt-3 text-[11px] text-muted-foreground">
            <span>С уважение,<span className="mt-3 block w-28 border-b border-border" /></span>
            <span>{step === 2 ? "Готово за преглед" : "Чернова"}</span>
          </div>
        </article>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Пример · не е реална кореспонденция</span>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="icon" className="size-11" aria-label="Предишна стъпка" onClick={() => go(step - 1)}><ArrowLeft /></Button>
          <Button size="icon" className="size-11" aria-label="Следваща стъпка" onClick={() => go(step + 1)}><ArrowRight /></Button>
        </div>
      </div>
    </div>
  );
}
