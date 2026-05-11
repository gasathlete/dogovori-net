## Анализ — къде губим скорост

| Файл / място | Размер | Влияние |
|---|---|---|
| `src/data/templateContent.ts` | **1.9 MB** | Един обект с ~290 ключа. Импортва се синхронно от `Template.tsx` — една страница тегли всички 290 шаблона |
| `src/data/sectors.ts` | 143 KB | Импортва се почти навсякъде |
| `src/data/catalog.ts` | 116 KB | Импортва се от 6+ места |
| `vendor-icons` chunk в `vite.config.ts` | целият `lucide-react` | `manualChunks` групира всички икони в един chunk и убива tree-shaking |
| `Index.tsx` секции под fold-а | TopDocuments, PartnersBoard, ComplianceSection | Изпълняват се синхронно при първи paint |

Цел: по-бързо TTI/LCP и по-малък initial bundle, **без визуални/функционални промени и без SEO регресии**.

---

## SEO защитни мерки (вградени в плана)

1. **Meta tags на `Template.tsx` остават синхронни.** Извличаме `intro` (само първите 155 знака за `<meta description>`) + `title` в малък синхронен index файл `src/data/templateContentMeta.ts` (~30 KB за всичките 290 шаблона). Тежкото съдържание (FAQ, mistakes, usageCases, requirements) се зарежда async.
2. **`SeoFooter` остава eager** — съдържа вътрешни линкове важни за crawling.
3. **JSON-LD / structured data** (ако има в `Seo.tsx`) се рендира от синхронния meta файл, не от async chunk-а.
4. **Skeleton loader** със същата DOM структура като крайния резултат → CLS остава ~0.
5. **Server-rendered HTML** не се променя (продължаваме с client-side React) — Googlebot изпълнява JS, така че индексирането работи както досега. По-бързият LCP е **плюс** за Core Web Vitals.

---

## Изпълнение — 6 етапа

### Етап 1: Split на `templateContent.ts` (най-голяма печалба, ~1.8 MB спестени)

**1a. Генериращ скрипт** `scripts/split-template-content.ts`:
- Чете текущия `src/data/templateContent.ts`
- Записва два резултата:
  - `src/data/templateContentMeta.ts` — само `{ slug: { title, introExcerpt } }` за всички шаблони (синхронен, ~30 KB)
  - `src/data/templateContent/<slug>.ts` — пълно съдържание per slug (един файл на шаблон, ~5–10 KB)
  - `src/data/templateContent/index.ts` — map `slug -> () => import("./<slug>")`
- Скриптът се пуска веднъж, резултатът се commit-ва. Старият файл се изтрива.

**1b. `Template.tsx`** — преработка:
- Meta (title, description, JSON-LD) от `templateContentMeta` → синхронно, преди render → SEO непокътнато.
- `aiContent` зареждаме с `useEffect`/`useState` чрез dynamic import.
- Докато се зарежда: показваме съществуващия fallback (`doc.purpose` + generic списъци). Това вече е fallback в кода → нула CLS.

### Етап 2: Lazy below-the-fold секции на началната страница

- `TopDocuments`, `PartnersBoard`, `ComplianceSection` → `React.lazy` + малка обвивка с `IntersectionObserver` (mount при влизане в 200 px от viewport-а).
- `SeoFooter` остава eager (SEO).
- Hero, Header, SectorGrid остават eager (above the fold).

### Етап 3: Премахни `vendor-icons` от `manualChunks`

- В `vite.config.ts` махаме реда `"vendor-icons": ["lucide-react"]`.
- Vite/Rollup автоматично слагат само използваните икони в съответните route chunks (lucide-react е tree-shakeable per-icon).

### Етап 4: Route prefetch при hover

- Нов компонент `PrefetchLink` (или patch в `NavLink.tsx`): `onMouseEnter` извиква `import()` на съответната lazy route.
- Прилагаме на основните CTA-та: към `/wizard/...`, `/catalog`, `/shablon/...`.
- Резултат: при клик route chunk-ът вече е в cache → preceived latency ~0.

### Етап 5: Vite + HTML tweaks

- `vite.config.ts`: `build.sourcemap: false` за prod.
- `index.html`: `<link rel="preconnect" href="https://wkbxojefiovdczkwhved.supabase.co">` + preload на основния шрифт (ако има локален).
- `QueryClient` defaults: `staleTime: 60_000`, `refetchOnWindowFocus: false` → по-малко мрежови повиквания.

### Етап 6: Точкови micro-оптимизации

- `Wizard.tsx`: `useMemo` за `flattenQuestions` и `buildQuestions`, ако още не са.
- `LiveDraft.tsx` (592 реда): `React.memo` + `useMemo` за computed text.
- `Catalog.tsx` (290+ карти): добавяме `content-visibility: auto` + `contain-intrinsic-size` за карти под fold-а — CSS-only virtualization, нула JS overhead.
- Всички `<img>` извън hero: `loading="lazy" decoding="async"`.

---

## Очаквани резултати

| Метрика | Преди | След |
|---|---|---|
| Initial JS landing | ~600–800 KB | ~250–350 KB |
| Template page first load | 1.9 MB+ | ~80 KB (meta + chunk) |
| LCP (mobile 4G) | ~3.5–4 s | ~1.8–2.2 s |
| Wizard navigation (с prefetch) | 200–400 ms | <50 ms |
| Lighthouse SEO | без промяна | без промяна (или +лек bonus от Web Vitals) |

---

## Какво НЕ променяме

- Дизайн, токени, цветове, типография.
- Backend / edge functions / DB / RLS.
- Бизнес логика на quota, AI generation, signing, plans.
- Routing структура и URL-и.
- Meta tags / canonical / JSON-LD стойности.

---

## Verification след всеки етап

- `bun run build` → check chunk sizes в `dist/assets/`.
- Lighthouse в preview (mobile + desktop).
- Ръчен test: Template страница, Wizard, Catalog → същият UX.
- `view-source:` на 3 шаблонни страници → meta description и title са правилни (SEO smoke test).