# Предварителен режим — Gate 9 и Gate 10 (source-only)

Статус: **NOT_READY**. Gate 7 остава отворен. Нито една проверка по-долу не е проведена; всички са **NOT RUN**, докато няма запис с дата, среда и доказателство.

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
5. Приложени миграции 0039–0044 и pgTAP.

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
  - `refine-product` отказва и повторна заявка за вече завършено прецизиране (поправката изисква миграция).
  - Записи от браузъра в `uploaded_contracts` без ограничение по колони; `user-contracts` без лимит за размер/MIME.
  - Преградата на `negotiation-strategy` е доказана само по реда в кода.
  - Записи за изравняване преди преградата в `generate-contract`, `build-custom-contract`, `apply-corrections`, `refine-contract`, `analyze-contract`, `download-blank`.
- Gate 9: миграция 0044 (заявка за списък) неприложена; правно одобрение на съгласието и срока.
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
