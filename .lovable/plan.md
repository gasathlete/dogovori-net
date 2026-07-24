## Цел

1. Визуално разделяне на текущия Херо на **два сегмента**:
   - Горен (същински Херо) — завършва с кликабилната лента `ДОГОВАРЯЙ · СЪЗДАЙ · ПРЕЦИЗИРАЙ · ПОДПИШИ`.
   - Долен — 6-те функционални плочки (Правен AI-асистент, 600 шаблона, Анализ, Двуезични, Е-подпис, Комплекти) като **самостоятелна секция** с eyebrow и заглавие.
2. Фоново **видео** в Хероя — cinematic loop, autoplay + muted + loop, затъмнен overlay, respect `prefers-reduced-motion`.

---

## 1. Разделяне на секциите

**`src/components/Hero.tsx`** — оставя само:
- Лого badge
- H1 + eyebrow chips
- Primary CTA (Започни безплатно / 3-те tile-а за логнати)
- 4-те стъпки (ДОГОВАРЯЙ · СЪЗДАЙ · ПРЕЦИЗИРАЙ · ПОДПИШИ)
- Промокод + First100Counter

4-те стъпки се засилват визуално, така че да е ясно, че са кликабъл:
- По-голям тъч таргет (px-3 py-1.5 вместо px-1 py-0.5)
- Тънка граница `border border-gold/25` + `rounded-full`
- Hover: `bg-gold/10 border-gold/60`
- Chevron/ръка индикатор липсва — само subtle underline при hover
- ARIA `role="list"` за групата, всеки item `<Link>` към `/proces/<slug>`
- Между тях `·` разделител в `text-gold/30`

**Нов компонент `src/components/PlatformCapabilities.tsx`** — 6-те плочки се преместват тук:
- Eyebrow: `КАКВО ПРАВИ ПЛАТФОРМАТА`
- H2: `Шест инструмента, един работен процес`
- Кратък intro параграф (1 изречение)
- Grid: `sm:grid-cols-2 lg:grid-cols-3`, по-големи плочки (px-5 py-4), с иконка в кръг, тайтъл, описание в 2 реда
- Спазва tokens (`bg-card/40`, `border-gold/15`, hover `border-gold/40`)
- Секцията е с `py-16 sm:py-20`, hairline divider отгоре и отдолу

**`src/pages/Index.tsx`** — вмъква `<PlatformCapabilities />` **веднага след `<Hero />`, преди `<SocialProofStrip />`**.

---

## 2. Фоново видео

**Generation** — през `videogen--generate_video`:
- **Prompt**: cinematic slow-motion close-up of an elegant fountain pen signing a document on a dark walnut desk, warm gold light glinting on the paper edge, soft parallax dust particles, shallow depth of field, luxurious editorial mood, muted navy background, no text, no faces
- **Resolution**: 1080p
- **Aspect ratio**: 16:9
- **Duration**: 5s (ще loop-ва)
- **camera_fixed**: true (по-стабилно, без резки движения)
- **Target**: `src/assets/hero-bg-video.mp4`

Плюс **poster image** през `imagegen--generate_image` (същия стил, 1920x1080, `.jpg`) — за fallback и за `poster` атрибута.

**Компонент `src/components/HeroVideoBackdrop.tsx`**:
```tsx
- <video autoPlay muted loop playsInline preload="metadata" poster={poster}>
- Абсолютно позициониран, object-cover, w-full h-full
- z-index под съдържанието, над HeroBackdrop
- Detect prefers-reduced-motion → рендерира само <img> с poster
- Detect mobile (≤640px) → optional: показва само poster (по-леко за battery/data)
    → ще активираме това само ако видеото се окаже >1MB след optimization
- Overlay: <div class="absolute inset-0 bg-gradient-to-b from-navy/70 via-navy/50 to-navy/80" />
- Втори overlay слой: съществуващият bg-gradient-hero остава отгоре с opacity-70
- Всичко е aria-hidden
```

**Интеграция в `Hero.tsx`**:
- Замяна на `<HeroBackdrop />` с `<HeroVideoBackdrop />` (HeroBackdrop остава като SVG слой отгоре, ако допринася за визията)
- Текстовете получават `drop-shadow-sm` за четимост върху видеото
- Layer order (отдолу нагоре):
  1. `<video>` / poster
  2. Dark navy gradient overlay (40-60%)
  3. Съществуващ `bg-gradient-hero` (намалена opacity)
  4. HeroBackdrop SVG декорация
  5. Съдържание

**Performance guardrails**:
- `preload="metadata"` (не `auto`) — не тегли пълния файл преди visible
- `IntersectionObserver`: пауза при scroll извън viewport
- Ако файлът е >2MB след compression: пре-обработка с `ffmpeg` (CRF 28, target 1-2MB)
- Poster image винаги се вижда докато видеото зарежда

---

## Technical details

### Файлове (create/edit)
- ✏️ `src/components/Hero.tsx` — премахва 6-те плочки, засилва 4-те стъпки, ползва `HeroVideoBackdrop`
- ✏️ `src/pages/Index.tsx` — импорт + рендер на `PlatformCapabilities` след Hero
- 🆕 `src/components/PlatformCapabilities.tsx` — 6-те плочки в собствена секция
- 🆕 `src/components/HeroVideoBackdrop.tsx` — видео слой + reduced-motion fallback
- 🆕 `src/assets/hero-bg-video.mp4` — генерирано видео
- 🆕 `src/assets/hero-bg-poster.jpg` — poster/fallback image

### ASCII layout

```text
┌─────────────────────────────────────────┐
│ HERO (с фоново видео)                  │
│  ┌──┐                                  │
│  │🦉│                                  │
│  └──┘                                  │
│  H1: Документи и договори...           │
│  [chips]                               │
│  [ Започни безплатно → ]               │
│  ─────────────────────────────         │
│  ⟨ДОГОВАРЯЙ⟩·⟨СЪЗДАЙ⟩·⟨ПРЕЦ.⟩·⟨ПОДП.⟩  │  ← кликабъл, chip-style
│  [промокод + брояч]                    │
└─────────────────────────────────────────┘
   ═══════════ hairline ════════════
┌─────────────────────────────────────────┐
│ КАКВО ПРАВИ ПЛАТФОРМАТА                │
│ Шест инструмента, един работен процес  │
│                                        │
│  [AI-асистент] [600 шаблона] [Анализ]  │
│  [Двуезични]   [Е-подпис]    [Компл.]  │
└─────────────────────────────────────────┘
```

### Не докосвам
- `SocialProofStrip`, `PainSolution`, останалите секции в `Index.tsx`
- `Header.tsx` (променен в предишен turn)
- Business logic — само визуална реорганизация + фоново видео

---

## Стъпки за изпълнение

1. Генерирай видеото (`videogen`) и poster (`imagegen`).
2. Създай `HeroVideoBackdrop.tsx` с reduced-motion + IntersectionObserver logic.
3. Създай `PlatformCapabilities.tsx` от 6-те плочки.
4. Изчисти `Hero.tsx` — премахни плочките, засили 4-те стъпки, интегрирай видео backdrop.
5. Обнови `Index.tsx` — вмъкни `PlatformCapabilities` след Hero.
6. Проверка: typecheck + визуален преглед в preview (desktop + mobile).