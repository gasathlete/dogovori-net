# План

## 1. Плавен скрол на началната страница

Проблем: `LazyOnVisible` mount-ва тежки секции при достигане до viewport-а с резервиран `minHeight`, което причинява "скок" когато реалното съдържание е по-високо. `Reveal` едновременно прилага `translate-y` + `opacity` transition при IntersectionObserver, което при много секции прави множество едновременни repaint-и. Резултат — накъсан скрол.

Промени (само presentation):
- `src/components/LazyOnVisible.tsx`: 
  - Увеличаване на `rootMargin` от `200px` на `600px`, така че mount-ването да става **много преди** секцията да стигне viewport-а — без видим "скок".
  - Premount fallback с истинска височина: при unmount-ване запазваме измерената височина чрез `ResizeObserver` в `sessionStorage` (per-route key) и я ползваме като `minHeight` при следващо посещение, за да няма CLS.
- `src/components/Reveal.tsx`:
  - Намаляване на `duration` от 700ms на 400ms и премахване на `translate-y-4` на mobile (`md:translate-y-4`), за да остане само opacity fade — много по-евтино за GPU.
  - Добавяне на `will-change: opacity, transform` само докато елементът не е във viewport-а; премахване след това.
- `src/index.css`:
  - `html { scroll-behavior: smooth; }` (само ако липсва).
  - Глобален `@media (prefers-reduced-motion: no-preference)` правило за `body { overscroll-behavior-y: none; }` за по-стабилен momentum scroll.
  - Премахване/намаляване на `backdrop-filter: blur(...)` на sticky хедърите по време на скрол — backdrop-blur е основна причина за jank. Заменя се с полу-прозрачен `bg-navy/95` без blur за sticky strip-а в `WizardShell`.
- `src/pages/Index.tsx`: премахване на излишните `<Divider />` обвивки около `LazyOnVisible` (те държат `container` mount-нат, докато съдържанието още не е там — създава double-paint). Divider-ите се местят вътре в lazy-section компонентите.

## 2. Split layout в динамичния уизард (документ вдясно, предложения вляво)

В момента `SplitWizard.tsx` вече прилага `grid-cols-1 lg:grid-cols-2` (лява = въпроси, дясна = preview). Проблемът е, че на review стъпката (`WizardReview.tsx`) и при междинни състояния документът не се показва вдясно с предложения вляво. 

Промени:
- `src/pages/WizardReview.tsx`: пренареждане към `lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]` (стандарт от `BuildContract`):
  - **Ляво (sticky на desktop)**: RiskMeter, Banner „Документът е готов", AppendixSuggestions, CorrectionsPanel hero CTA, RiskReport (collapsible), Финализиране (collapsible), Disclaimer.
  - **Дясно (sticky на desktop)**: ContractPreview винаги отворен; на мобилен — отгоре на колоната, без collapsible.
- `src/components/wizard/SplitWizard.tsx`: без структурни промени; само уеднаквяване на gap-овете с review страницата (`gap-6 lg:gap-8`), за да изглежда continuous между стъпките на уизарда и review.

## 3. Авто-приемане на предложените стойности

Когато поле има предложение (`default`, AI-suggested стойност, цена и т.н.) и потребителят го остави празно, `handleNext` трябва автоматично да попълни предложението и да продължи, вместо да блокира с „missing required".

Промени:
- `src/lib/questionGraph.ts`: експортиране на `getQuestionDefault(q, ctx)` helper, който връща:
  1. `q.default` (literal или израз) eval-нат срещу текущите answers, ИЛИ
  2. `q.suggested` (нов опционален field; popula-ва се от AI suggestions / pricing reference в `GraphQuestionField`).
- `src/components/wizard/GraphQuestionField.tsx`: при наличие на suggestion стойност, тя се показва като `placeholder` (напр. „Препоръчано: 1200 EUR") вместо да се pre-fill-ва, така че user-ът вижда, че е предложение.
- `src/components/wizard/SplitWizard.tsx` → `handleNext`:
  - Преди да върне `setAttemptedNext(true)`, преминава през всички `missingInCurrent` въпроси, и за всеки, който има non-null default/suggestion, прави `setAnswer(id, suggestion)`.
  - Ако след това няма повече missing → продължава автоматично към следващата стъпка.
  - Само ако остане truly missing required field без предложение → показва грешка както досега.
- Аналогично за review-вълните в `WizardReview.tsx` (correction inputs) — празни корекционни полета приемат предложеното от AI.

## Извън обхвата
- Backend/AI промени (предложения вече идват от съществуващите edge functions).
- Промени в въпросите/клаузите на конкретни шаблони.
