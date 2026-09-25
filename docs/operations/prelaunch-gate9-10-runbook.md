# Предварителен режим — Gate 9 и Gate 10 (source-only)

Статус: **NOT_READY**. Gate 7 остава отворен.

## Текущо обобщение (източник на истина; по-старите раздели по-долу са исторически)
- **Тестове в изходния код са изпълнени** (виж „Изпълнени команди“). **Gate 10 staging/live сценариите НЕ са изпълнени** — всички са NOT RUN.
- Default-OFF в кода **не доказва** реалната среда: стойностите на env в разгърнатите функции не са проверявани.
- Среди се различават: **0039–0042** бяха приложени и тествани в отделния staging по историческите Gate 1–6; **0041, 0044–0048** и `stage_prelaunch_waitlist` са `applied: false` в свързаната продукция и **не е извършвано ново staging прилагане**. Нищо от този пакет не е приложено, разгърнато или включено.
- `stage_prelaunch_waitlist` = предварителната заявка; **0044** = клиентска преграда за суров текст (не е заявката).
- Replay на прецизиране (`refine-product`) е поправен **без миграция**.
- review-document, път на собственика: runtime 17/17 (`new-processing-gate.batch7.handler.test.ts`).
- `download-blank` **има** сървърна преграда: `isNewProcessingOpen("download_blank")` след записания replay и преди резервация (`new-processing-gate.batch2.handler.test.ts`). По-старото твърдение „няма сървърен флаг“ беше грешно и е премахнато.
- Анонимно генериране: **временно недостъпно** до проверен дизайн за идентичност/capability (възможни са няколко сигурни дизайна; нова колона не е задължителна). Факт: съществуващите задачи с `user_id IS NULL` нямат проверимо доказателство за собственост и се отказват.

### Граница за суров вход и доверен източник (този пакет)
| Път | Поправено в кода | Изисква прилагане / отделен бекенд |
|---|---|---|
| Пряко качване в `user-contracts` | — (само SQL) | **0046**: restrictive INSERT/UPDATE за anon/authenticated само за този bucket; четене/изтриване, 0045 екипно четене и service_role остават. Лимити за файл (тип/размер) са зависимост за бъдещия независим вход, не заместител. До прилагане прекият API запис остава **отворен**. |
| Нов/променен `payload` в `saved_documents` | `savedDocumentWriteGuard` в BuildContract, DocumentPane, Document, useUploadedContractDoc, DocumentsTab (дубликат), downloadDocument (незапазен нов договор); сървър: `download-document` `DOCUMENT_CONTENT_SAVE_NEW_WRITE_ENABLED` OFF преди квота/запис | **0047** (SECURITY INVOKER тригер): клиент не може да вмъква/променя съдържание; позволени са метаданни, екипно пре-споделяне по 0045, точно възстановяване от собствена `document_versions`, само-указателна разлика `storage_path` (пресвързване по 0045) и указател-само вмъкване, service_role. |
| Автоматичен запис на чернова | `syncDraft` → `prelaunch_closed` преди мрежа, локалното съдържание и указателят остават, без безкрайни опити; `draft-sync` `DRAFT_SYNC_NEW_WRITE_ENABLED` OFF преди тяло/rate-limit/auth/DB | няма миграция |
| Продукти (checkout/fulfill/refine) | `PRODUCT_TRUSTED_SOURCE_BRIDGE.available = false` (твърдо в кода, не се чете от env/тяло/DB) → `trusted_source_unavailable` преди Stripe/задача/резервация/доставчик, **дори при всички env флагове `"true"`**; готов платен резултат и replay на прецизиране остават | Това е **защитно затваряне, НЕ проверка на извличане**. `verifyStoredProductSource` доказва само вътрешна съгласуваност на записани от браузъра метаданни. Преди пускане: независимо бекенд обвързване/атестация на източника (Azure PR6 е чернова, не е слята/разгърната; не е подменяна). |
| Заобикаляне през `document_versions` | `savedDocumentWriteGuard` не записва версии от клиента | **0047** (същата миграция): само `document_versions_insert_own` не пазеше нищо — клиент можеше да вмъкне своя версия с произволен текст и да я „възстанови“ в `saved_documents`. Сега прекият клиентски INSERT/UPDATE е отнет (REVOKE) и блокиран с restrictive политики; SECURITY DEFINER `snapshot_saved_document_version()` (снимка при промяна на съдържание **или** име, последни 20), собственото SELECT/DELETE и service_role остават. В PGlite: старите политики допускат атаката, след поправката пада. |
| `growth_snapshot` | — (само SQL) | **0048**: `current_user` (винаги собственикът `postgres` в SECURITY DEFINER) заменен с `COALESCE(auth.role(),'')='service_role'` или ненулев `auth.uid()` + `COALESCE(is_staff(...),false)`; NULL → отказ; `search_path = public, pg_temp`; REVOKE PUBLIC/anon. Живата функция не е извиквана. |

Съзнателно оставени пътища (не са нов суров вход): `draft-claim` прехвърля вече съхранена чернова към собственика; `DocumentVersionsDialog` възстановява собствена версия (позволено от 0047); `assistant-edit` редактира само whitelist пътища, с проверени актьор/предложение/нишка/достъп и е зад AI преградите; `review-document` само чете.

### Запис на резултат в /build
Стабилен предварително заделен id за (собственик, точен резултат); пази се при неизвестен изход. Повторен опит вмъква същия id; при 23505 редът се потвърждава по id + собственик (без обновяване, без търсене по категория). Закъсняло завършване за стар резултат/собственик не се прикача. Идентичността е в паметта на таба — **не е трайно exactly-once между презареждания**. Новият запис на съдържание остава затворен от `savedDocumentWriteGuard`. Тест: `buildSaveAndReference.test.tsx` (запис → изгубен отговор → повторен опит = 1 ред).

### Матрица
`prelaunchMatrix.ts` описва само контролите в кода; `DEPLOYED_READINESS = "NOT_VERIFIED"`. assistant-chat, create-checkout и create-strict-unlock-checkout имат сървърни прегради (`prelaunchMatrixServerTruth.test.ts`).

### Ред на прилагане (бъдещо, ръчно, атомарно; без автоматичен масов runner)
`0044` → `0045` (+ preflight, STOP при ненулеви forged/mismatch/ambiguous) → `0046` → `0047` → `0048`; `stage_prelaunch_waitlist` отделно. Всяка миграция — в собствена транзакция, след преглед и backup. Rollback: 0046/0048 са обратими чрез възстановяване на предишните политики/функция (премахването отново отваря пряко качване / owner bypass — не се прави без решение); 0047 rollback премахва тригера, двете restrictive политики на `document_versions` и връща `GRANT INSERT` там — с което отново се отварят и клиентският запис на съдържание, и заобикалянето през версия. Данни не се трият от нито една от тях.

### Изпълнени команди (този пакет)
- `bunx vitest run src/test/rawIngressGates.pglite.test.ts src/test/growthSnapshotAuthz.pglite.test.ts` — 14/14
- `deno test` `_shared/raw-ingress-gate.handler.test.ts` — 7/7; продуктови тестове (`product-integration`, `product-trusted-source`, `product-paid-replay.handler`, checkout) — 54/0
- `bunx vitest run` (activationDraft, activationDraftHook, draftSyncPrelaunch, savedDocumentWriteGuard, DocumentPane.race, prelaunchMatrix) — 84/84
- `bun scripts/product-rollout-preflight.ts` — PASS (9 миграции)
- `deno check` за download-document, draft-sync, fulfill-product, refine-product, create-product-checkout.
- Локално, текущо състояние: `bunx tsgo --noEmit` — чисто; пълен `bunx vitest run` — **1930 passed / 4 skipped / 0 failed**; `deno test --allow-all supabase/functions/_shared/*.test.ts supabase/functions/payments-webhook` **от корена на хранилището** — **1013 passed / 0 failed** (същите тестове, стартирани от `supabase/functions`, падат заради относителни пътища при четене на източника — командата се изпълнява от корена).
- Последният проверен CI пробег (GitHub Tests 36144364587, job 108101697235, UI head 65426c) дава **1894 passed / 4 skipped** за приложението и **978 passed / 0 failed** за Edge (978 = 971 + 7 нови теста за пътя на собственика). Това е друг (по-стар) commit и различен обхват от локалните числа по-горе; по-ранната цифра 997 не идва от този пробег и не се използва.

Нито една проверка в среда не е проведена; всички Gate 10 точки са **NOT RUN**, докато няма запис с дата, среда и доказателство.

## Какво е затворено в кода (клиентска + сървърна преграда)
| Действие | Къде спира в клиента | Сървърна преграда (source; виж checkpoint 25.09.2026) |
|---|---|---|
| Ново съобщение до DogovaryAI (вкл. абонати) | `AssistantChat.sendMessage` преди мрежа | `assistant-chat`: `ASSISTANT_NEW_PROCESSING_ENABLED` OFF; записан отговор се възпроизвежда |
| Прикачване на файл в чата | `handleFiles` — файлът не се чете | няма |
| Нов абонамент / топъп | `StripeEmbeddedCheckout` не монтира Stripe | `create-checkout`: `SUBSCRIPTION_CHECKOUT_ENABLED` OFF (вкл. топъп) |
| Строго отключване | `StrictDocumentPaywall.startUnlock` | `create-strict-unlock-checkout`: `STRICT_UNLOCK_CHECKOUT_ENABLED` OFF |
| Еднократни продукти | `ONE_TIME_PURCHASES_AVAILABLE=false` + заявка | сървърен флаг OFF |

Остават отворени: публично SEO съдържание, вход/регистрация, история и запазени резултати, портал за абонамент, export/delete, unsubscribe, webhook реверси.

## Gate 9 — аналитика (source)
- Събития: `prelaunch_waitlist_opened` (веднъж на функция+източник за таб), `product_intent` (веднъж на продукт), `prelaunch_waitlist_succeeded` (само при RPC `true`, веднъж), `prelaunch_waitlist_failed` (`reason`: invalid|unavailable).
- Свойства само от allowlist; без имейл, текст, имена на файлове, query-string, платежни токени. Consent-gated през `trackFunnelEvent`.
- Приход/изпълнение: само от проверен Stripe webhook в backend. `checkout_completed` се отчита едва след `confirmPaid`.
- Маршрут след вход: премахват се имейл, текст, файлови имена, платежни/сесийни тайни, стойности с `@` или над 200 знака; външни адреси се отхвърлят.

## Зависимости преди live (blockers)
1. Прилагане на миграцията за заявката (`docs/migrations/stage_prelaunch_waitlist.sql`) — сега липсващ backend = честна грешка.
2. Правно одобрение: контролер, текст на съгласието, срок за съхранение.
3. Сървърните флагове за `assistant-chat`, `create-checkout`, `create-strict-unlock-checkout` съществуват в кода и са OFF; включването им изисква отделно решение и проверка в среда.
4. DPA с EU AI доставчик (Azure в provisioning), AI Act прозрачност.
5. Прилагане на 0044–0048 в свързаната продукция и pgTAP (всички сега `applied: false`; 0039–0042 вече са минали през отделния staging по Gate 1–6).

## Gate 10 — синтетична test-mode поръчка (всички NOT RUN)
- [ ] Sandbox покупка `contract_check` 2,99 € → точно едно право след webhook.
- [ ] Отказ в Stripe → няма право, няма обработка, честно съобщение.
- [ ] Повторен опит след грешка → една сесия, без двойно таксуване.
- [ ] Дублиран webhook (replay) → без второ право/изпълнение.
- [ ] Реверс/refund → правото се отбелязва, резултатът не се изтрива без основание.
- [ ] Export на резултата — от сървъра, само за собственика.
- [ ] export-my-data и delete-account работят за купувач.
- [ ] Ограничено включване: флаг за един продукт, малка група, наблюдение 48 ч.
- [ ] Rollback: флаг OFF → нови покупки спират, съществуващите права и резултати остават.
- [ ] Мобилна и desktop проверка на целия път.

## Source-only checkpoint — 25.09.2026

Проверено само в изходния код и с тестове без мрежа. Нищо не е приложено, включено или пуснато; няма проверка в production.
Начален HEAD за днешния цикъл: `46a03337b6a8d9e7820cb2771c930b2e8c87e47f`. HEAD при записа на този раздел: `78a6ef0666e9ea23b95450671f7c139ff4c6d560` (промените от тази стъпка влизат в следващия запис).

### Сървърни прегради за НОВА обработка (всички OFF по подразбиране; отварят се само при точно `"true"` в server env; тялото на заявката не ги отваря)
| Endpoint | Флаг | Възпроизвеждане | Запис преди преградата |
|---|---|---|---|
| `assistant-chat` | `ASSISTANT_NEW_PROCESSING_ENABLED` (по-ранен пакет) | да | няма |
| `negotiation-strategy` | `NEGOTIATION_STRATEGY_NEW_PROCESSING_ENABLED` | да | няма (само четене) |
| `generate-linked-document` | `GENERATE_LINKED_DOCUMENT_NEW_PROCESSING_ENABLED` | да | няма (само четене) |
| `generate-contract` | `GENERATE_CONTRACT_NEW_PROCESSING_ENABLED` | да | възможен запис за изравняване |
| `assistant-chat-anon` | `ASSISTANT_CHAT_ANON_NEW_PROCESSING_ENABLED` | да (само четене) | няма |
| `build-custom-contract` | `BUILD_CUSTOM_CONTRACT_NEW_PROCESSING_ENABLED` | да | възможен запис за изравняване |

Тестове: `_shared/new-processing-gate.batch5.handler.test.ts` (7/7), `_shared/new-processing-gate.batch6.handler.test.ts` (6/6). `negotiation-strategy` — преградата е доказана само по реда в кода.

### `suggest-followup-questions`
- Входните `sector_id`/`contract_type` не се вграждат в низов `.or(...)` филтър. Проверка: низ, до 200 знака, без контролни знаци; иначе 400 без заявка към базата.
- За всяка комбинация (стойност | NULL) на подадените измерения — отделна заявка с `.eq`/`.is` (до 4 заявки), подредена по importance ↓, id ↑, с лимит 501. Резултатите се обединяват, дедуплицират по id и подреждат детерминистично; после се прилагат условията и `limit` (1–10).
- Защитен максимум: над 500 реда в един обхват → 503 `capacity_exceeded`, никога частичен резултат. Без подаден сектор/вид обхватът е цялата активна банка — при над 500 активни въпроса такава заявка също връща 503.
- Грешката към клиента вече не съдържа суровото съобщение на базата.
- Тест: `suggest-followup-questions/index.test.ts` (9/9), вкл. регресия с 700 нерелевантни въпроса с висок importance.

### Одит на директни записи от браузъра (само четене; без промени)
| Таблица / bucket | Клиентски път | Правило | Заобикаля ли AI/плащане |
|---|---|---|---|
| `storage: user-contracts` (upload/remove) | `UploadContractDialog`, `ReferencePromptDialog`, `productUpload` | собственик по първа папка = `auth.uid()`; bucket не е публичен; **без лимит за размер/MIME** | Не е доказано. Качването не стартира AI. |
| `uploaded_contracts` (insert/update/delete) | `productUpload`, `ReferencePromptDialog`, `useUploadedContractDoc`, `DocumentsTab`, `UploadedContract` | `ALL` за собственик или член на екипа; без ограничение по колони | Не е доказано. **Неудостоверено доверие:** `extracted_text`, `text_hash`, `product_extraction_status` и `product_extracted_chars` се пишат от браузъра, а `fulfill-product` ги проверява само за вътрешна съгласуваност. Затворено сега от `PRODUCT_AI_FULFILLMENT_ENABLED` OFF. |
| `saved_documents` (insert/update/delete) | `BuildContract`, `Document`, `DocumentsTab`, `BulkActionsBar`, `DocumentVersionsDialog`, `useUploadedContractDoc` | `ALL` за собственик или член на екипа | Не е доказано. Собственикът може да запише произволно съдържание в свой документ; не е платен резултат. |
| `assistant_threads` / `assistant_messages` | `AssistantChat` (изтриване); insert е разрешен от правилото | собственик на нишката | Не е доказано. Не стартира модел; сървърната история е в леджъра. |
| `document_versions` (delete) | `DocumentVersionsDialog` | собственик | Не. |
| `custom_contract_blanks` (update/delete) | `AdminBlanksPanel` | само staff | Не. |

Непроверено: дали сървърни пътища, различни от `fulfill-product`, приемат записаните от браузъра `uploaded_contracts` колони като доказателство. Не е предложена миграция — изисква отделен преглед.

### Незатворени задачи Gate 7–10
- Gate 7: отворен.
- Gate 8:
  - `refine-product`: повторна заявка за вече завършено прецизиране е ПОПРАВЕНА без миграция (само четящ replay чрез `_shared/product-refinement-replay.ts`, handler тест `product-paid-replay.handler.test.ts`).
  - Записи от браузъра в `uploaded_contracts` без ограничение по колони; `user-contracts` без лимит за размер/MIME.
  - `negotiation-strategy`, `correct-uploaded`, `review-document` (пропуск и собственик): доказани с handler тестове (виж по-долу).
  - Записи за изравняване преди преградата в `generate-contract`, `build-custom-contract`, `apply-corrections`, `refine-contract`, `analyze-contract`, `download-blank`.
- Gate 9: заявката за списък е `docs/migrations/stage_prelaunch_waitlist.sql` (НЕ е 0044 — 0044 е забраната за клиентски запис на суров текст); неприложена; правно одобрение на съгласието и срока.
- Gate 10: всички проверки в раздела по-горе — **NOT RUN**.
- Два сигнала за сигурност (`legal_versions`, `legal_documents` с публично четене) — собственикът ги заяви като умишлено публични; трябва да бъдат отбелязани ръчно в изгледа за сигурност.

## Team file binding — source-only finding (25.09.2026, base 759bf679)

Status: **NOT_READY**. Fix exists only as source; nothing applied, no flags, no deploy.

**Finding (live read-only metadata):** `uploaded_contracts_all_own` and `saved_documents_all_own` were `FOR ALL` with `auth.uid() = user_id OR is_team_member(auth.uid(), team_id)` in both USING and WITH CHECK. `user_contracts_team_select` trusted `uploaded_contracts.storage_path` / `saved_documents.payload->>'storage_path'` plus membership of the row's `team_id`. A member of team T could write a row (even with `user_id` = the victim) pointing at another user's file and give every member of T storage SELECT on it. `user-contracts` is private; `file_size_limit` and `allowed_mime_types` are NULL.

**Fix (source):** `docs/migrations/stage_team_file_binding.sql` (byte-identical copy `docs/migrations/0045_team_file_binding.sql`, `applied:false` in `product-rollout-manifest.json`). `drizzle/migrations` and `supabase/migrations` are write-protected for source-only work, so both copies live in `docs/migrations`.
- Client INSERT: `user_id = auth.uid()`, membership required when `team_id` is set, file path must be in the owner's folder (`<user_id>/…`).
- Client UPDATE: `user_id` immutable; file reference and `team_id` changed only by the row owner; team members keep content edits. DELETE unchanged (owner or team member).
- New trigger-written provenance `team_shared_by/team_shared_at` (clients cannot set it).
- Storage team SELECT requires `team_shared_by = user_id`, object in owner's folder, `storage.objects.owner_id = user_id`, owner is a member of the team, reader is a member.
- `service_role` unchanged (trusted). Generated `saved_documents` without `storage_path` unaffected.

**Legacy rows are NOT trusted automatically.** All existing team rows get `team_shared_by = NULL` and lose team file access until the owner shares again.

**Apply procedure (fail-closed, not executed):**
1. Run `docs/migrations/stage_team_file_binding_preflight.sql` (read-only aggregates). If `path_owner_mismatch`, `object_owner_mismatch`, `owner_not_in_team_forged` or `shared_path_ambiguous` is non-zero → STOP, report the counts, don't apply.
2. Apply the migration in one transaction after review.
3. Owner re-authorization: each owner who wants team file sharing sets the document's team to none and then back to the team (the trigger records them as the one who shared). No bulk backfill of `team_shared_by`.
4. Re-run the preflight and the storage check.

A single aggregate read before this package (counts only, no rows) showed 0 path/object-owner mismatches; `uploaded_contracts` has 0 team rows and `saved_documents` has 2 team rows with no file path. That result is recorded here, not proof of provenance.

**Tests:** `bunx vitest run src/test/teamFileBinding.pglite.test.ts` — PGlite (real PostgreSQL), synthetic roles/auth.uid()/teams/storage: 9/9. They cover:
- the attack under the old policies (both tables);
- denial after the patch;
- forged user_id/path/payload INSERT;
- foreign team;
- owner transfer UPDATE;
- payload path reassignment;
- generated documents without a path;
- anon denied;
- legacy forged row denied;
- owner re-share;
- service_role;
- the read-only preflight.

**Pending (not changed):** bucket `user-contracts` size/MIME limits. The frontend accepts several formats in more than one place and no single project limit is defined, so a limit would be invented. Owner must choose the limit and MIME list; set it with the storage bucket tool, not SQL.

## generate-job ownership — source-only finding (25.09.2026, base 8febd3fc)

Статус: **NOT_READY** (само изходен код; нищо не е приложено/публикувано; флаговете остават OFF).

Находка (независим одит): `generate-job` четеше `generation_jobs` по UUID през service client без проверка на собственика и дори обновяваше „висящи“ задачи при статус; идемпотентността беше глобална по клиентския ключ (без собственик/payload); нов старт записваше ред и препращаше payload към `generate-contract` без собствена преграда.

Поправка (`supabase/functions/generate-job/index.ts`, `_shared/generation-job-auth.ts`):
- Действие само `start` | `status`; непознато действие, невалидно тяло, `job_id` или ключ → 400 без мрежа.
- Липсващ header или точно публичният anon ключ = анонимен; всеки друг Bearer трябва да е валидна сесия, иначе 401 (без понижаване). `user_id` от тялото се игнорира.
- `status`: само удостоверен собственик, `SELECT … WHERE id = job_id AND user_id = auth user`; чужд/липсващ → 404. Само четене: стар `running` се показва като `job_timeout` без запис.
- `start`: сървърен ключ `gj1:` + SHA-256(собственик, клиентски ключ, каноничен пълен payload), записан в съществуващата колона `idempotency_key`. Всяко търсене (нормално и след 23505) е по ключ И `user_id`, статус `running|done`, без 15-минутен прозорец (уникалният индекс покрива всички възрасти). Стари ключове не се преизползват.
- Точно собствено възпроизвеждане (running/done) → преди преградата. Нов старт → `isNewProcessingOpen("generate_contract")` (същият server-side флаг) преди запис/фон/препращане/квота/доставчик; тялото не може да го отвори. Собствен стар `running` се затваря като `job_timeout` само при отворен флаг и само от собственика.
- Анонимни задачи: няма проверим собственик/capability за стари редове с `user_id NULL` → статус отказан (401), нищо не се разкрива. Нов анонимен старт: 503 при OFF; при ON → 401 `requires_login` (без запис). **Ограничение:** преди отваряне на анонимно генериране трябва подписан capability (напр. по модела на `ANON_IDENTITY_SECRET`) и колона за него — не е направено тук, без нова тайна/миграция.
- Клиент (`src/lib/generateContractJob.ts`): статус/повторно закачане на съществуващ job остава; НОВ старт е зад `canStartNewProcessing("document_generation")` (абонатите не заобикалят) и не изпраща payload. Wizard показва предварителната заявка.

Метаданни (само четене, 25.09.2026): `generation_jobs` RLS=on, 0 policies; anon/authenticated имат table grants, но RLS отказва директни редове. Миграция не е нужна за поправката; по желание бъдещ reviewed `REVOKE ALL ON public.generation_jobs FROM anon, authenticated` (атомарно, не е изпълнявано).

Тестове (истински обработчици, fetch изцяло подменен, синтетични редове):
- `supabase/functions/_shared/generate-job.handler.test.ts` — 16/16: собствен done/running, стар running без запис, чужд/липсващ/невалиден Bearer/анонимен (вкл. стари анонимни) отказ, `user_id` от тялото, точно собствено replay при OFF, същия ключ чужд собственик, същия ключ различен payload, анонимен OFF без мрежа, невалидни действия/тела/ключове, OPTIONS без мрежа, ON нов старт (обвързан ключ + фон), 23505 състезание по собственик.
- `supabase/functions/_shared/new-processing-gate.batch7.handler.test.ts` — 10/10 (виж актуализацията по-долу — сега 17/17): review-document (подписан пропуск на собственика: OFF нов → 503, записан → replay, чужд собственик → отказ, без пропуск → отказ), correct-uploaded (валиден preflight: OFF → 503, replay, чужд документ 404), negotiation-strategy (OFF → 503, replay, чужд анализ 403) — без модел/резервация/запис.
- `src/test/generationReliability.test.ts` — 17/17 (затворен нов старт без мрежа, reattach остава, отказан статус не стартира нов).
- CI глоб `_shared/*.test.ts` + payments-webhook: 971 passed / 0 failed; `deno check generate-job` добавен в CI.
- Lockfile: `bun install --frozen-lockfile` — без промени (bun.lockb съдържа pglite); `package-lock.json` допълнен само с `@electric-sql/pglite@0.5.8`.

Остава (към f7827604): анонимният capability по-горе; Gate 7 и платеното пускане.

## Source-only checkpoint — 25.09.2026 (base f7827604)

Статус: **NOT_READY**. Нищо не е приложено/публикувано; флагове и тайни непроменени; не е извършена проверка на живи настройки.

### Поправено в кода
- **Предварителна заявка (диалог):** синхронна идентичност на сесията и преграда срещу двойно изпращане; отваряне/затваряне/демонтиране обезсилва чакащ отговор; полетата са заключени докато чака; приема се само `data === true`. Текстът при неизвестен изход вече не твърди „Нищо не е записано“. Тест: `src/test/prelaunchWaitlistRace.test.tsx` (7).
- **`stage_prelaunch_waitlist.sql`:** само точна версия `prelaunch_waitlist_v1`, истинско съгласие, нормализиран имейл/функция; повторен опит не опреснява `consent_at`/`retention_until` и не харчи прием; `retention_until NOT NULL`, изчислен на сървъра от `retention_days`; конфигурацията (`prelaunch_waitlist_config`) е само за service_role и **без начален ред** → RPC връща `false`; глобален таван за прозорец чрез атомарно `INSERT … ON CONFLICT … WHERE admitted < max` (без клиентски IP); `withdraw_my_prelaunch_waitlist()` (само имейлът от сесията), `withdraw_prelaunch_waitlist` и `purge_expired_prelaunch_waitlist` само service_role. Имейл не се логва. Тест: `src/test/prelaunchWaitlist.pglite.test.ts` (9, PGlite). Манифест: `stagedSources` в `product-rollout-manifest.json`, `applied: false`.
  - Зависимости (не са изпълнени): юридически одобрен срок и текст; ред в конфигурацията с `approval_ref`; планиране на изчистването; защита на периметъра по клиент (платформа/WAF). Не твърдим активно съхранение или правно съответствие.
- **Нова обработка в браузъра:** `UploadContractDialog` спира „Качи и анализирай“ преди четене на файл/хеш/сесия/запис; „само запис“ на нов текст не се предлага (`CLIENT_RAW_TEXT_WRITE_ALLOWED = false`, съобразено с 0044). `BuildContract.handleGenerate` и `handleApplyCorrections` — преграда преди валидиране/сериализация/вход/аналитика/мрежа. Wizard (генериране и `download-blank`) ползва `canStartNewProcessing`; `document_generation` е в `NEW_RAW_PROCESSING` → абонатите не заобикалят. CompanionChip (статичен шаблон) пази правото. `ReferencePromptDialog` спира в началото; заглавие/страни/предмет вече не се слагат в URL (локално `sessionStorage` предаване `refCtx`; старите URL параметри се четат за съвместимост). Тестове: `uploadDialogPrelaunch.test.tsx`, `buildSaveAndReference.test.tsx`, `prelaunchGates`, `prelaunchMatrix`.
- **Автоматичен запис в /build:** премахнато презаписването на последния `saved_documents` по категория. Идентичност = точният резултат (`resultSaveCoordinator`); нов резултат нулира `savedDocId`; ръчен и автоматичен запис споделят една заявка; закъснял запис не се прикача към по-нов резултат.
- **Причини в аналитиката:** `normalizeReason` връща само затворен списък `FUNNEL_REASON_CODES`/`http_4xx|5xx`, иначе `unknown` (без slug от текст). Качването праща класифициран код (`uploadFailureReason`). Тест: `docFunnelReasonPii.test.ts`.
- **review-document, път на собственика без пропуск:** истински handler, синтетичен запазен документ (и версия) с реален каноничен текст/отпечатък: нов при OFF → 503 без модел/резервация/запис; записан → точен replay; чужд документ, чужд собственик на версия и остаряло обвързване → отказ без RPC/запис. `new-processing-gate.batch7.handler.test.ts` 17/17.

### Остава
- ~~`download-blank` няма сървърен флаг~~ — невярно; има `isNewProcessingOpen("download_blank")` (виж обобщението).
- Ръчен запис на суров текст (`useUploadedContractDoc`) вече е спрян и в клиента (`savedDocumentWriteGuard`); DB преградите 0044/0047 чакат прилагане.
- Страницата /build е проверена чрез библиотеките и компонентите, не с пълен render на страницата.
- Анонимен capability за стари `generate_jobs`, Gate 7, платено пускане.
