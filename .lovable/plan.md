# Диагноза: автоматична подкана за регистрация в уизарда (source-only)

HEAD, анализиран без промени: `55eb41d0e162a2543f5b3d4d67c41c222fb5ef2f`.

## Какво се случва в действителност

Няма авто-генериране и няма документи с нула въпроси. Подканата идва от потока
"Свали само бланка", не от генериране.

1. `src/pages/Template.tsx:65-67` — за всеки НЕдвуезичен шаблон hero CTA
   „Свали само бланка" (ред 263) сочи към
   `/wizard/<sectorId>?doc=<name>&blank=1&returnTo=/shablon/<slug>`.
2. `src/pages/Wizard.tsx:1195-1219` — ефектът „Auto-trigger blank download when
   arriving with `?blank=1`" се изпълнява при mount. Изчаква само `authLoading`
   (0.5–0.9 s), след което за анонимен посетител вика
   `goAuth({ action: "Изтегляне на празна бланка", ... })`.
3. `src/pages/Wizard.tsx:737-746` — `goAuth` има подразбиращ се
   `intent: opts?.intent ?? "generate"`. И двата blank call site-а (ред 1131 в
   `runBlankDownload` и ред 1203 в авто-ефекта) не подават `intent`, затова
   намерението се записва като `generate`.
4. `src/components/auth/InlineAuthDialog.tsx:43-51` — единственото място, което
   отчита `auth_prompt_shown`, използва `detail.intent` → отчита
   `action=generate, source=wizard`.
5. `doc_start` липсва, защото `markDocSelected` (`Wizard.tsx:866-873`) се вика
   само при реален отговор във въпросника или в `handleGenerate`. Кликът върху
   blank CTA на шаблонната страница отчита само `template_create_cta_clicked`
   (`Template.tsx:74-80`), а не `document_selected`.

Значи проблемът е двоен: **грешен етикет на намерението** и **липсващо
`doc_start` за blank потока**, а не „auto-generate".

## Обхват

- Засегнати са ВСИЧКИ НЕдвуезични шаблонни slug-ове (`doc.bilingual !== true`),
  тъй като CTA-то е в hero на всяка страница `/shablon/:slug`. В телеметрията
  се виждат само двата slug-а с реален трафик:
  `molba-za-napuskane-chl-326-al-1-kt` (позиция 1 във `FEATURED_BLANKS`) и
  `sporazumenie-za-prekratyavane-na-naem-po-vzaimno-saglasie`.
- Другите маршрути „само отварят уизарда", защото са отваряни през основния
  CTA (без `blank=1`) или са двуезични (тогава `blankWizardHref === wizardHref`).
- `doc_key` от телеметрията (`services::molba-...`) съответства на
  `Wizard.tsx:749-752` — тоест мапингът slug → документ е коректен; проблем в
  routing/slug мапинга не се потвърждава.

## Най-малката безопасна корекция

Кликът върху „Свали само бланка" е реално действие на потребителя, затова
поведението (анонимен → подкана за вход при blank изтегляне) се запазва.
Коригират се само етикетите и редът на фунията.

1. `src/pages/Wizard.tsx` — на двата blank call site-а да се подава
   `intent: "download_blank"`; `goAuth` да остане с default `generate` само за
   истинските generate пътища (редове 474, 573).
2. `src/pages/Template.tsx` — при клик на blank CTA да се отчита
   `trackDocStart({ doc_key, source: "template" })` със същия формат на ключа
   (`${category.sectorId}::${slugify(doc.name)}`), така че `document_selected`
   да предхожда подканата.
3. `src/pages/Wizard.tsx` — авто-ефектът да не предизвиква подкана при
   повторно рендиране/връщане назад: `blank=1` да се консумира еднократно
   (изчистване на параметъра чрез `replace`), заедно със съществуващия
   `autoBlankTriggered` ref.

Не се пипат: бекенд, `supabase/`, миграции, плащания, ценообразуване/copy,
sitemap файлове, генерирани файлове. `activation_continuity.split` остава 0.1.

## Регресионни тестове

- Нов `src/test/blankIntentFunnel.test.tsx`:
  - анонимен mount на `/wizard/:sector?doc=…&blank=1` → `auth_prompt_shown`
    с `action="download_blank"`, никога `generate`;
  - анонимен mount без `blank=1` → никакво `auth_prompt_shown` (уизардът само
    се показва);
  - `blank=1` се обработва еднократно (повторен render не отчита втора подкана).
- Разширение на съществуващия `src/test/docFunnel.test.ts`: `doc_start` от
  източник `template` носи същия `doc_key` формат като уизарда (дедупликацията
  да не прави двойно отчитане при последващо действие в уизарда).

## Стъпки на изпълнение (при одобрение)

1. Промени в `src/pages/Wizard.tsx` (intent + еднократна консумация на `blank=1`).
2. Промяна в `src/pages/Template.tsx` (doc_start при blank CTA).
3. Нови/разширени тестове.
4. Валидация: насочени тестове, пълен Vitest suite, typecheck. Без билд (за да
   не се пипат генерирани sitemap файлове), без deploy и без миграции.
