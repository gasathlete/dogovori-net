# Dogovori.net

Контролна страница за проекта **Dogovori.net** — българска платформа за преглед, подреждане и изготвяне на документи.

## Връзки

- Хранилище: https://github.com/gasathlete/dogovori-net
- Lovable редактор: https://lovable.dev/projects/6b2da12e-e1d6-4f97-8549-b632fb66ddd1
- Preview: https://id-preview--6b2da12e-e1d6-4f97-8549-b632fb66ddd1.lovable.app
- Публичен домейн: https://dogovori.net
- [Карта на проектите](docs/PROJECTS.md)
- [План за beta — 1 ноември 2026](docs/operations/beta-2026-11-01.md)
- [Gate 9/10 runbook](docs/operations/prelaunch-gate9-10-runbook.md)
- [Исторически първоначален AI brief](docs/product/original-ai-engine-brief.md)

## Локална работа

Изисквания: Bun и Node.js.

```bash
bun install --frozen-lockfile
bun run dev
bun run test
bunx tsgo --noEmit
bun run build
```

## Основни директории

- `src/` — приложението, страниците, компонентите, данните и тестовете
- `supabase/functions/` — защитени сървърни функции
- `supabase/migrations/` — версионирани миграции
- `docs/operations/` — release планове и оперативни проверки
- `scripts/` — build, SEO и контролни проверки
- `public/` — публични статични файлове

## Статус към 28 септември 2026

- **Source:** активната работа е в това хранилище; успешният локален build не доказва публикуване.
- **Preview:** показва текущите промени за проверка, но не е production.
- **Production:** `dogovori.net`; не приемайте, че последният source е публикуван без отделна publish стъпка и проверка.
- **Плащания и нова обработка:** остават затворени до преминаване на release проверките.

Една задача се разработва като една свързана промяна. Преди работа проверете хранилището, клона, текущия commit и задачата. Pull request проверките и публикуването са отделни стъпки.