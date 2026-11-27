# Тестов месец — release отчет (28.09.2026)

Основание: собственикът Даниел потвърди, че наличните каталожни документи са правно приети от юрист, и нареди „Довършете каквото остава и пускаме че е тестови месец“. Срокът за съхранение 90 дни е **оперативна настройка на собственика** за тестовия период (`approval_ref = owner-testmonth-20260928`), а не отделно юридическо одобрение.

Обхват: публично разглеждане, примери и работещо известие при пускане. Покупки, платена/AI и нова обработка остават затворени. **Frontend е публикуван и проверен на https://dogovori.net/ на 28.09.2026.**

## Публикуване и независима публична проверка

- Окончателен код: `939c70311240757a2cf8fbaae743af249f2c2178`; deployment `812ac145-7d89-4cc9-a1e6-7591dacb0473`. Публичният HTML зарежда `/assets/index-CtRc5XU3.js`, съвпадащ с проверената сборка. Тази последваща редакция е само отчет, без промяна на публикувания код.
- GitHub [Tests run 36441721778](https://github.com/gasathlete/dogovori-net/actions/runs/36441721778): **1954 passed, 4 skipped**, 0 failed; Edge: **995 passed, 0 failed**. Build & SEO Verification и Security scan за същия код са успешни.
- На публичната начална страница са потвърдени „Тестов период“ и редът след фирмите: Пакети → Комплекти → Услуги; проверени са `/paketi`, `/paketi/naemi`, `/komplekti/naem-zhilishte`.
- През публичната форма в `/paketi` е изпратена синтетична заявка с резервиран `@example.test` адрес. Преди съгласие бутонът е изключен; след подаването има „Заявката е приета“ и точно 1 ред в базата, `one_time_product`, `prelaunch_waitlist_v1`, 90 дни. Тестовият ред е оттеглен и е потвърдено, че не остава в базата. Няма изпратени имейли.
- Първото публично посещение разкри старата бета покана с обещания за пълен AI достъп, отстъпка и старт на 1 октомври. Премахната е; `BetaDisclaimerModal` запазва съвместимия export и връща `null`. Дискретният индикатор в header и банерите остават.
- Първоначално браузърът зареждаше кеширани по-стари сборки. Окончателната проверка е на нормалния публичен адрес без допълнителен query параметър.
- Двете съществуващи предупреждения за публично четене на `legal_documents`/`legal_versions` не са автоматично отхвърляни. Те са отделни от успешната проверка на изолираните waitlist таблици и от GitHub Security scan.

## База данни (свързана продукция)

- Приложена е само миграцията `drizzle/migrations/0021_testmonth_prelaunch_waitlist_activation.sql` (копие: `docs/migrations/testmonth_prelaunch_waitlist_activation.sql`) — таблиците/функциите от `stage_prelaunch_waitlist.sql` + pg_cron задача `purge-prelaunch-waitlist-daily` (`17 3 * * *` UTC). Никакви други таблици или исторически миграции (0044–0048 остават неприложени).
- Конфигурацията е създадена с `enabled = false`, `retention_days = 90`; включена е (`enabled = true`) едва след проверките по-долу.

### Проверки (реални, с резервирани `@example.com` адреси)

| Проверка | Резултат |
|---|---|
| anon GET/POST към трите таблици | 401 / 400 (отказ) |
| `has_table_privilege` anon и authenticated, SELECT/INSERT/UPDATE/DELETE | false за всички 3 таблици |
| anon изпълнение на purge / withdraw / withdraw_my | 42501 permission denied |
| Заявка при `enabled = false` | `false`, без ред |
| Без съгласие | `false` |
| Валидна заявка (`QA-…@example.com ` → нормализиран) | `true`, 1 ред, срок точно 90 дни |
| Повторен опит | `true`, пак 1 ред, броячът не расте |
| Изтекъл ред + `purge_expired_prelaunch_waitlist()` | изтрит 1 |
| `withdraw_prelaunch_waitlist` (service) | изтрит 1 |
| cron задача | активна, `17 3 * * *` |
| Браузър 390/1280 (продуктова страница) | съгласието е неотметнато; „Заявката е приета“ само след сървърно `true`; имейлът не е в localStorage/sessionStorage или други заявки |

Всички тестови редове и броячи са изтрити; към края на проверката таблиците са празни.

Открит и поправен дефект: клиентът викаше отделена референция към `supabase.rpc` (губи `this`), затова заявката никога не стигаше до сървъра и винаги показваше „не успяхме“. Добавен регресионен тест.

## Сървърни функции

Разгърнати от текущия source (без промяна на флагове/секрети) 24 защитени функции: analyze-contract, apply-corrections, assistant-chat, assistant-chat-anon, assistant-edit, build-custom-contract, correct-uploaded, create-checkout, create-product-checkout, create-strict-unlock-checkout, create-team, download-blank, download-document, draft-sync, fulfill-product, generate-contract, generate-job, generate-linked-document, negotiation-strategy, refine-contract, refine-product, review-document, suggest-followup-questions, team-update-seats.

Нито един `*_NEW_PROCESSING_ENABLED` / `*_CHECKOUT_ENABLED` флаг от `new-processing-gate.ts` не е зададен като секрет → затворено по подразбиране. Анонимни проби с празно тяло: всички отказват (401/400/`identity_unavailable`/`prelaunch_closed`); `suggest-followup-questions` връща празен списък без AI. Пробите не доказват поведение на влязъл потребител с флагове; платените продукти имат отделен блокер за доверен източник.

## Проверки на кода (локално, не CI)

- Фокусирани: `prelaunchWaitlist` + race — 17/17.
- Пълни: `bun run test` — 1953 успешни, 4 пропуснати (1957) преди последната регресия; фокусираният файл след това минава.
- `bunx tsgo --noEmit -p tsconfig.app.json` — OK; `bun run build` — OK.
- Браузър 390/1280: начало, `/paketi/naemi`, `/komplekti/naem-zhilishte`, `/produkti/palen-paket-pregovori` — без хоризонтално преливане, индикатор „Тестов период“ видим.

## Rollback

1. Изключване на известието: `UPDATE public.prelaunch_waitlist_config SET enabled = false;` → RPC връща `false`, UI показва честно „не успяхме“.
2. По желание: `SELECT cron.unschedule('purge-prelaunch-waitlist-daily');` (само ако таблицата се изпразни ръчно).
3. Frontend: възстановяване на предишната публикувана версия от историята в Lovable.

## Остава (не блокира тестовия месец)

- Изпращане на известия (сега не се изпращат имейли).
- Миграции 0044–0048, trusted source за платени продукти, Stripe sandbox/реверс, DPA с AI доставчик — блокери за **покупки и AI**, не за разглеждане.
- Липсващите планирани документи в пакетите остават „планирани“.
