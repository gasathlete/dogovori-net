## Цел
След първата вълна (~$11 700 → ~$940/мес) има още чисти печалби без видима загуба на качество. Целта: **~$940 → ~$250–350/мес** при същия трафик.

## Промени

### 1. `analyze-contract` → `gemini-2.5-flash-lite`
- Сегашен модел: `gemini-2.5-flash`. Lite е ~3–4× по-евтин и се справя отлично с класификация на рискове и извличане на клаузи по фиксирана JSON схема.
- За сложни договори: добавяме escalation — ако `score` липсва или `issues.length === 0` при текст > 5 000 знака, правим **един** retry към `gemini-2.5-flash`.
- Очаквано: $560 → ~$160/мес.

### 2. `generate-contract` → `gemini-2.5-flash-lite`
- Шаблоните са deterministic запълване на placeholders. Lite се справя при добре структуриран prompt.
- Ще съкратим SYSTEM_PROMPT с ~40% (премахваме декоративни инструкции, оставяме само схемата + задължителните клаузи).
- Очаквано: $610 → ~$180/мес.

### 3. По-агресивна нормализация за cache hit
- Сега кешът е по `text_hash` на оригиналния текст. Добавяме нормализация преди hash: lowercase, collapse whitespace, strip non-alphanumeric освен букви/цифри/пунктуация. Това хваща копия с различно форматиране (PDF vs DOCX vs paste).
- Очакван hit-rate: 20% → ~35%. Допълнително −$50/мес.

### 4. Кеш и за `generate-contract`
- Hash на `(sector, contractName, documentName, sortedAnswersJSON)`. Нова таблица `template_cache (hash, payload jsonb, created_at)` с TTL 30 дни.
- Hit-rate ~10–15% (повторни поправки, тестове, демо).
- Очаквано: −$25/мес.

### 5. Свиване на input prompts
- `analyze-contract`: `MAX_CHARS` 15 000 → **10 000** + изрязване на повтарящи се whitespace/празни редове преди подаване.
- `generate-contract`: премахваме дублирани инструкции в SYSTEM_PROMPT, скъсяваме `qaLines` (skip празни отговори).
- −10–15% input токени навсякъде.

### 6. Rate-limit ужесточение за free tier
- `generate-contract`: anonymous 1/24h → **0** (изисква вход), authenticated free 10/24h → **5/24h**. Спира безплатния abuse и форсира conversion.
- Pro потребителите не са засегнати.
- Не намалява директни разходи на cost-per-call, но ограничава пиковете.

### 7. `apply-corrections` и `correct-uploaded` — остават на `gemini-2.5-pro`
- Малък обем, критично качество на правни корекции. Не пипаме.

## Резултат след всички промени

| Перо | Сега | След |
|---|---|---|
| Шаблони | ~$610 | ~$155 |
| Анализи | ~$560 | ~$140 |
| Кеш hits (35% + template) | −$230 | −$305 |
| **AI Общо** | **~$940** | **~$280** |

Допълнителна икономия: **~$660/мес (−70%)**.

## Технически детайли

- Нова таблица `template_cache` (само хеш + payload + created_at, без user_id — шаблоните не са лични).
- Helper `normalizeForHash(text)` в `_shared/` за reusable нормализация.
- Escalation логика в `analyze-contract` като опционален guard, само при подозрително празен резултат.
- Без промени по схемата на `risk_analyses`, `uploaded_contracts`, RLS, или frontend.

## Без промени в
- `apply-corrections`, `correct-uploaded`, auth, payments, frontend компоненти, типове.

## Какво НЕ препоръчвам сега
- Сваляне до `gemini-2.5-flash-lite` за `apply-corrections` — там грешка струва доверие.
- Streaming/partial results — сложно за JSON, малък ефект.
- Self-hosted модел — не си струва при този обем.
