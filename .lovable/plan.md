# Преизчисление: реален AI разход на операция

## Откъде идваха старите 0.04 €/op

Старата симулация ползваше една обобщена цифра 0.04 €/op „на око". Не беше декомпозирана по модели и по тип операция. Затова сега я разбиваме напълно.

## Какво ще направя

1. **Bottom-up модел по token-и + публични цени на Lovable AI Gateway** за всеки edge function, който участва в 1 op.
2. **Top-down валидация** срещу реалните данни в `ai_usage` (разпределение на повикванията по функции).
3. **Усреднена цена / op по тип** (download contract / download template / upload+analyze / corrections wave).
4. **Обновен PDF** `dogovori-simulation-v2.pdf` с нови сценарии 500 / 2 000 / 5 000 рег., нови маржове и нова страница „AI cost breakdown".

## Реално разпределение от `ai_usage` (днес в продукция)

```text
generate-contract        25  (30%)  — flash-lite
build-custom-contract    22  (27%)  — mix lite/flash/pro по mode
analyze-contract         19  (23%)  — flash-lite (default), fallback flash/pro
apply-corrections         7  ( 8%)  — flash
correct-uploaded          6  ( 7%)  — pro
ocr-contract              4  ( 5%)  — flash
```

## Цени на Lovable AI Gateway (USD / 1M tokens, ≈ EUR при курс 1.08)

```text
gemini-2.5-flash-lite     $0.10 in / $0.40 out
gemini-2.5-flash          $0.30 in / $2.50 out
gemini-2.5-pro            $1.25 in / $10.00 out
```

## Token estimates (реалистично за БГ договори, 3–5 стр.)

```text
Функция                Модел           in tok  out tok  EUR/call
generate-contract      flash-lite       3 000    4 000   0.0017
analyze-contract       flash-lite       6 000    2 000   0.0013
analyze-contract       flash (fallback) 6 000    2 000   0.0064
build-custom (quick)   flash-lite       4 000    5 000   0.0022
build-custom (std)     flash            5 000    6 000   0.0153
build-custom (premium) pro              6 000    8 000   0.0810
correct-uploaded       pro             10 000    6 000   0.0671
apply-corrections      flash            8 000    6 000   0.0161
ocr-contract           flash            3 000    1 000   0.0032
```

(15% retry / fallback overhead добавен в крайното смятане.)

## Цена на op по тип

```text
Тип op                          AI calls вътре                    EUR/op
1) Download contract (wizard)   generate-contract (1×)            0.002
2) Download template            обикн. cached (template_cache)    0.0005
3) Upload + analyze             ocr + analyze (+ ~15% fallback)   0.005
4) Corrections wave             correct-uploaded + apply-corr.    0.085
5) Build custom contract        build-custom (mix mode)           0.025
```

## Weighted average / op (реалистичен mix)

Допускане за разпределение между типове ops в продукция (от поведенчески модел):

```text
50% generate (wizard)   × 0.002   = 0.0010
20% template download   × 0.0005  = 0.0001
15% upload + analyze    × 0.005   = 0.00075
10% build custom        × 0.025   = 0.0025
 5% corrections wave    × 0.085   = 0.00425
                                   ────────
Среден AI разход / op            ≈ 0.0086 €
```

**≈ 0.009 €/op — около 4.5× по-ниско от старите 0.04 €/op.**

Това отразява, че: (а) повечето generate повиквания са на flash-lite, (б) template downloads са кеширани, (в) скъпият pro модел се ползва само за ~5% от ops.

## Нови сценарии (същата структура, нова AI цена)

```text
                          500 рег.    2 000 рег.    5 000 рег.
Общо ops/мес              3 213       12 850        32 125

Разходи (€/мес)
  AI inference (0.009€)    28.92       115.65        289.13
  Инфра базова             60.00        60.50         62.00
  Stripe (1.4% + 0.25€)    11.51        46.05        115.13
  Общо разходи            100.43       222.20        466.26

Приходи нето              351.25     1 405.00      3 512.50
Брутна печалба            250.82     1 182.80      3 046.24
Марж                        71%         84%           87%

Break-even                ≈ 88 рег. потребители (от 142)
```

## Какво ще има в новия PDF (7 стр.)

1. Корица (v2)
2. Допускания + новата AI методология
3. **Нова страница: „AI cost breakdown по модели и функции"** — таблица + pie chart на token spend по модел
4. Сценарий 500 рег.
5. Сценарий 2 000 рег.
6. Сценарий 5 000 рег.
7. Сравнителна страница + sensitivity (AI cost ±50%, conversion ±1pp)

## Технически детайли

- Python + reportlab + matplotlib
- Изход: `/mnt/documents/dogovori-simulation-v2.pdf` (запазваме v1)
- QA: pdftoppm на всяка страница преди финализиране
- Без промени по кода на платформата
