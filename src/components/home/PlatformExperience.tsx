import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/BrandLockup";
import { ArrowLeft, ArrowRight, FileText, Search, Folder, Palette } from "@/icons";
import { CATALOG_REVIEW_STATUS } from "@/lib/templateReviewStatus";

const WORKFLOWS = [
  { title: "Намерете образец", description: "Категории, търсене и сравнение на образци за лични въпроси, работа и бизнес.", to: "/catalog", action: "Отворете каталога", Icon: Search },
  { title: "Изгответе документ", description: "Въвеждате обстоятелствата, преглеждате текста и избирате следващата стъпка.", to: "/build", action: "Започнете изготвяне", Icon: FileText },
  { title: "Подредете работата", description: "Вашите запазени документи, папки и контрагенти са в профила Ви.", to: "/account", action: "Отворете профила", Icon: Folder },
  { title: "Добавете фирмен облик", description: "Лого, фирмени данни и колонтитули от настройките за брандиране.", to: "/account?tab=branding", action: "Настройки за брандиране", Icon: Palette },
] as const;

export function PlatformExperience() {
  const [index, setIndex] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const touch = useRef<number | null>(null);
  const active = WORKFLOWS[index];
  const select = (next: number, focus = false) => {
    const value = (next + WORKFLOWS.length) % WORKFLOWS.length;
    setIndex(value);
    if (focus) refs.current[value]?.focus();
  };
  return (
    <section className="brand-platform-band border-y border-border py-14 sm:py-20" aria-labelledby="platform-experience-title">
      <div className="container">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div><p className="text-sm text-muted-foreground">От задачата до документа</p><h2 id="platform-experience-title" className="mt-3 font-serif text-3xl font-bold sm:text-4xl">Повече от каталог с образци</h2></div>
          <BrandLockup />
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
          <div>
            <div role="tablist" aria-label="Работа с платформата" className="grid grid-cols-2 gap-2" onKeyDown={(e) => {
              const next = e.key === "ArrowRight" ? index + 1 : e.key === "ArrowLeft" ? index - 1 : e.key === "Home" ? 0 : e.key === "End" ? 3 : undefined;
              if (next === undefined) return;
              e.preventDefault(); select(next, true);
            }}>
              {WORKFLOWS.map((item, i) => <Button key={item.title} ref={(el) => { refs.current[i] = el; }} id={`workflow-tab-${i}`} role="tab" aria-selected={index === i} aria-controls="workflow-panel" tabIndex={index === i ? 0 : -1} variant={index === i ? "secondary" : "outline"} onClick={() => select(i)} className="h-auto min-h-14 justify-start whitespace-normal text-left"><item.Icon aria-hidden="true" />{item.title}</Button>)}
            </div>
            <div className="mt-6 flex gap-2"><Button variant="outline" size="icon" className="size-11" aria-label="Предишна функция" onClick={() => select(index - 1)}><ArrowLeft /></Button><Button variant="outline" size="icon" className="size-11" aria-label="Следваща функция" onClick={() => select(index + 1)}><ArrowRight /></Button></div>
            <div id="workflow-panel" role="tabpanel" aria-labelledby={`workflow-tab-${index}`} className="mt-6">
              <h3 className="font-serif text-2xl font-bold">{active.title}</h3><p className="mt-3 text-base leading-relaxed text-muted-foreground">{active.description}</p>
              <Button asChild className="mt-5 h-auto min-h-11 whitespace-normal"><Link to={active.to}>{active.action}<ArrowRight /></Link></Button>
            </div>
          </div>
          <div className="min-w-0" onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }} onTouchEnd={(e) => { const x = touch.current; touch.current = null; const end = e.changedTouches[0]?.clientX; if (x === null || end === undefined || Math.abs(end - x) < 60) return; select(index + (end < x ? 1 : -1)); }}>
            <div className="border border-border bg-card p-5 sm:p-8">
              <p className="mb-5 border-b border-border pb-3 text-xs text-muted-foreground">Пример · {active.title}</p>
              {index === 0 ? <><div className="flex items-center gap-3 border border-border bg-background p-4"><Search className="size-5 text-gold" /><span>Наем, услуги, пълномощно…</span></div><div className="mt-4 grid gap-2">{["Договор за наем", "Приемно-предавателен протокол", "Пълномощно"].map((t) => <Link key={t} to={`/catalog?q=${encodeURIComponent(t)}`} className="flex min-h-12 items-center justify-between border-b border-border py-3 font-serif text-lg">{t}<ArrowRight className="size-4" /></Link>)}</div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">{CATALOG_REVIEW_STATUS.notice}</p></> : index === 1 ? <><p className="font-serif text-2xl font-bold">Подготовка на документ</p><ol className="mt-5 space-y-4">{["Предмет и страни", "Условия и срокове", "Преглед на текста", "Запазване и сваляне"].map((t, i) => <li key={t} className="flex gap-4 border-b border-border pb-3"><span className="font-serif text-gold">0{i + 1}</span>{t}</li>)}</ol><p className="mt-5 text-xs text-muted-foreground">Демонстрация на стъпките, не готов правен документ.</p></> : index === 2 ? <><p className="font-serif text-2xl font-bold">Моите документи</p>{["Наеми", "Услуги", "Работни документи"].map((t) => <div key={t} className="mt-4 flex items-center gap-3 border-b border-border py-3"><Folder className="size-5 text-gold" />{t}</div>)}<p className="mt-5 text-xs text-muted-foreground">Примерна организация. Вашите документи са достъпни след вход.</p></> : <><div className="flex items-center gap-3 border-b-2 border-gold pb-4"><Palette className="size-8 text-gold" /><div><p className="font-serif text-xl font-bold">Вашата фирма</p><p className="text-xs text-muted-foreground">Лого · фирмени данни</p></div></div><p className="my-8 font-serif text-2xl">Примерен документ</p><p className="text-sm text-muted-foreground">Горен колонтитул, фирмен акцент и контакти в долния колонтитул.</p><div className="mt-10 border-t border-border pt-3 text-xs text-muted-foreground">Примерен фирмен колонтитул · без реални лични данни</div></>}
            </div>
          </div>
        </div>
        <div className="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-3">
          <Link to="/sravni" className="link-ink min-h-11 py-3">Сравнете два образеца →</Link><Link to="/analiz" className="link-ink min-h-11 py-3">Проверете собствен документ →</Link><p className="py-3 text-sm text-muted-foreground">Електронно подписване · недостъпно без интеграция с D-Trust.</p>
        </div>
      </div>
    </section>
  );
}