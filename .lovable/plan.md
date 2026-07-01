## Цел
Пренаредим потребителското пътуване по фунията Attract → Inform → Convert → Engage, като върнем **предишния story-принцип** при клик на „Започни безплатно":

```
Hero „Започни безплатно"
        ↓
[Attract]  Story overlay (същите TUTORIAL_STEPS карти в story-режим)
        ↓
[Inform]   Регистрация / Magic link  →  Пълен туториал в профила
        ↓
[Convert]  „Анализирай собствен документ" (появява се едва след туториал)
        ↓
[Engage]   След всяка успешна безплатна операция → рекламен pop-up
           „Какво може dogovori.net за теб" (Предприемач features)
```

## Ключово решение за stories
Използваме **същия визуален контент** от `src/components/onboarding/tutorialSteps.tsx` (`TUTORIAL_STEPS`) — това е предишният принцип: kicker + title + body + preview на всяка карта. Единствената разлика е представянето:
- **Story режим (анонимен, преди регистрация)** = първите 3 стъпки (`intro`, `find`, `build`) в Instagram-style overlay – swipe + tap-to-advance + прогрес-барове отгоре, последна карта завършва с CTA „Създай безплатен акаунт".
- **Пълен туториал (след вход)** = целият `OnboardingTour` както сега.

Така потребителят разпознава „предишното стори" (същите карти и preview-та), а туториалът в профила го надгражда.

## Промени

### 1. Премахване на видимия 4-стъпков индикатор
- `src/components/funnel/FunnelProgress.tsx` → връща `null` (файлът остава за да не чупим импорти).
- Махаме `<FunnelProgress ... />` от `src/pages/Analyze.tsx` и `src/pages/Plans.tsx`.

### 2. Story overlay при „Започни безплатно" (Attract)
Нов `src/components/funnel/StartStoryOverlay.tsx`:
- Fullscreen, тъмен фон, safe-area aware.
- Горе – 3 прогрес-бара (Instagram-style, авто 4.5s всеки, pause on touch-hold).
- Всяка „story" рендерира card от `TUTORIAL_STEPS[0..2]` (`intro`, `find`, `build`) – използваме съществуващите `icon`, `title`, `body`, `preview`.
- Tap ляво/дясно = prev/next; swipe up/down = close; винаги видим X в горен десен ъгъл.
- Последна карта: голям primary CTA „Създай безплатен акаунт" → `/auth?tab=signup&redirect=/dashboard?tour=1` + secondary „Вход" линк.
- Trigger: клик на „Започни безплатно" в `Hero.tsx` и `CTABand.tsx` при анонимен user → dispatch `dogovori:start-story`. Влезли user-и минават директно към предишната цел.
- Global mount в `App.tsx`.
- LocalStorage guard `dgv:start-story:seen` – не насилва overlay-а ако е гледан преди 24h (клик по CTA винаги го отваря наново, `?skip=1` пропуска).

### 3. Туториал → „Анализирай собствен документ" (Convert gate)
- `OnboardingProvider` вече авто-стартира туториала след първи вход (запазваме).
- В края на `OnboardingTour` (последна стъпка / „Готово") → dispatch `dogovori:tutorial-complete`; ако URL съдържа `?tour=1` → навигация към `/analiz`.
- На `/analiz` за прясно завършили туториала показваме подчертан hero CTA „Анализирай собствен документ" (session flag `dgv:show-analyze-cta`).
- Скриваме „анализирай собствен документ" fold-a от Hero-то за анонимни (per user – идва след туториала).

### 4. Post-op рекламен pop-up (Engage)
Нов `src/components/funnel/EntrepreneurAdPopup.tsx`:
- Bottom-sheet на mobile / долен-ляв toast-card на desktop, glass ефект, gold акценти.
- „Какво може dogovori.net за теб" + 6 чип-карти (AI Асистент, Двуезични, Комплекти, Risk Analysis, GPT-5, Приоритет) + CTA „Виж Предприемач →" (`/plans#entrepreneur`).
- Timing: авто-показване при `dogovori:free-op-success`; **X бутонът disabled първите 3 сек** (circular countdown), после активен; авто-затваряне на 10 сек с thin progress bar отгоре.
- Frequency cap: max 1 път на сесия, не по-често от 4h (localStorage `dgv:ent-ad:last-shown`).
- Само за влезли без активен платен план.

Нов hook `src/hooks/useFreeOpSuccess.ts` → `emitFreeOpSuccess(opKey)`. Викаме от success handlers на:
- Download на бланка/договор
- Upload + analyze
- AI съобщение в `AssistantChat`
- Wizard генерация
(Без промяна на бекенд метъринга.)

### 5. Тракинг
`plausible` events: `story_view`, `story_complete`, `story_skip`, `tutorial_complete`, `ent_ad_shown`, `ent_ad_cta_click`, `ent_ad_dismissed`. Пишем и в `funnel_events` през existing helper.

## Файлове
**Нови**
- `src/components/funnel/StartStoryOverlay.tsx`
- `src/components/funnel/EntrepreneurAdPopup.tsx`
- `src/hooks/useFreeOpSuccess.ts`

**Променени**
- `src/components/funnel/FunnelProgress.tsx` (връща null)
- `src/pages/Analyze.tsx`, `src/pages/Plans.tsx` (махат FunnelProgress; Analyze – highlight след tutorial)
- `src/components/Hero.tsx`, `src/components/CTABand.tsx` (Започни безплатно → story)
- `src/components/onboarding/OnboardingTour.tsx` (finish → dispatch + условна навигация)
- `src/App.tsx` (mount на overlay + ad popup)
- Success handlers на 4-те безплатни операции → викат `emitFreeOpSuccess`

## Технически детайли
- Overlay-ите комуникират през `window` CustomEvents (същия pattern като `AuthGateModal`).
- Story прогрес: `requestAnimationFrame` (плавно), pause on `pointerdown`, resume on `pointerup`.
- Ad countdown: `useEffect` таймери + SVG stroke-dashoffset за 3s ring + top progress bar за 10s.
- Всичко ARIA-достъпно: `role="dialog"`, `aria-live` за таймери, focus trap.
- Motion през `framer-motion` (вече в проекта).
