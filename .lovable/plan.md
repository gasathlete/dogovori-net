# Hero Background Animation — premium, lightweight

Добавям лека, GPU-friendly SVG/CSS анимация на заден план в hero секцията — без да затормозява интерфейса и без да отвлича от CTA.

## Какво ще се вижда

1. **Многообразие от документи** — 5–6 миниатюрни листа (различни размери, лек tint в gold/navy) плават бавно нагоре-надолу с различни фази, ~12–18s цикъл, opacity ~0.06–0.12. Лек паралакс наклон, без scroll-listener.
2. **Лек подпис** — една SVG signature path се "изписва" веднъж в долната трета (stroke-dashoffset), задържа 2s, fade-out, повтаря на всеки ~14s. Opacity max ~0.18 в gold.
3. **Verification тик** — кръгче с ✓ pop-in след подписа (scale + stroke-draw), задържа кратко, fade-out. Opacity max ~0.25.
4. Всичко зад `bg-gradient-hero` слоя, но над него с pointer-events-none, z под текста.

## Технически детайли

- **Нов компонент** `src/components/HeroBackdrop.tsx` — чист SVG + CSS keyframes (без JS, без libs, без IntersectionObserver). Inline `<style>` за keyframes, локални.
- **Само transform/opacity** анимации → composited на GPU, нула layout/paint cost. `will-change` само по време на анимация.
- **`prefers-reduced-motion`** → анимациите се изключват, остава статична композиция със същата opacity.
- **Pause when hidden**: `animation-play-state: paused` чрез `@media (prefers-reduced-motion)` + `content-visibility: auto` на section е достатъчно; hero е above the fold така че не е проблем.
- **DOM cost**: 1 SVG, ~10 елемента. Без images, без filters освен 1 лек drop-shadow на тика.
- **Z-index**: `absolute inset-0 -z-0` под съдържанието (`relative z-10` на текстовия wrapper, ако трябва).
- Цветове през съществуващите tokens: `hsl(var(--gold))`, `hsl(var(--navy))` — без hardcoded hex.

## Интеграция в Hero.tsx

- Добавям `<HeroBackdrop />` точно след `<div className="absolute inset-0 bg-gradient-hero opacity-95" />`.
- Текстовият `.container` wrapper получава `relative z-10` ако е нужно за layering.
- Никакви други промени по hero логиката, CTA, текстове.

## Файлове

- **create** `src/components/HeroBackdrop.tsx`
- **edit** `src/components/Hero.tsx` (1 import + 1 ред JSX, +z-10 ако трябва)

## Performance бюджет

- 0 нови dependencies
- 0 JS на runtime (само CSS keyframes)
- ~3KB gzipped допълнителен markup
- Без re-renders, без state
