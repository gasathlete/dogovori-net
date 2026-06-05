# План Б: Поправка на storage collision + презареждане с `gemini-2.5-flash`

## Проблем

`safeKey()` в `download-blank` и `warm-blank-cache` използва `[^a-zA-Z0-9-_]+`, което изтрива цялата кирилица. Резултат: всички бланки в един сектор се пишат в един и същ `_.docx` файл и се припокриват. В БД виждам ≥7 различни employment записа сочещи към `v5/employment/_.docx`.

## Промени

### 1. Нов споделен helper `supabase/functions/_shared/blank-key.ts`

- `slugifyBlank(s)` — BG→Latin транслитерация (а→a, ж→zh, ш→sh, щ→sht, ю→yu, я→ya, ь→"" и т.н.) + lowercase ASCII slug.
- `buildBlankStoragePath(version, sectorId, documentName)` — връща `vN/<sector-slug>/<doc-slug>-<8-hex-sha1>.docx`. Хешът гарантира уникалност дори при колизия в slug-овете.

### 2. `supabase/functions/download-blank/index.ts`

- Махам локалния `safeKey`.
- `import { buildBlankStoragePath } from "../_shared/blank-key.ts"`.
- `CACHE_VERSION = isBilingual ? "v6-bilingual" : "v6"`.
- `storagePath = await buildBlankStoragePath(CACHE_VERSION, sectorId, documentName)`.

### 3. `supabase/functions/warm-blank-cache/index.ts`

- Същата подмяна на `safeKey` → `buildBlankStoragePath`.
- `CACHE_VERSION` → `v6` / `v6-bilingual`.
- Сменям модела в `callAiWithRetry`: `google/gemini-2.5-pro` → **`google/gemini-2.5-flash`** (≈5× по-евтин, достатъчно качество за бланки със структура от `document-types` spec).

### 4. Миграция: изчистване на `v5`

```sql
DELETE FROM public.document_blanks
WHERE storage_path LIKE 'v5/%' OR storage_path LIKE 'v5-bilingual/%';
```

(Storage обектите `v5/...` могат да останат — никой няма да ги чете. Опционално чистене по-късно.)

### 5. Deploy + warm

- Deploy и на двете функции.
- Натискам warmer от `/admin` (или казвам на потребителя да го направи) — пуска ~500 бланки с flash → **~6 €** общо.

## Какво НЕ променям

- `BlankCacheWarmer.tsx` UI, throttling, прогрес — работят коректно.
- Логиката за квота, signed URL, билингвалния layout — без промяна.
- `inferDocumentType` / `document-types.ts` spec — без промяна.

## Очакван резултат

- Всеки от ~500 записа получава уникален `v6/...` storage обект → край на припокриването.
- Свалянето на бланка след презареждане е 1–2s (cache hit), без AI извикване.
- Бъдещи bumps на cache version повтарят процеса за ~6 € вместо ~30 €.
