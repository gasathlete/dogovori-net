# Предварителен режим — Gate 9 и Gate 10 (source-only)

Статус: **NOT_READY**. Gate 7 остава отворен. Нито една проверка по-долу не е проведена; всички са **NOT RUN**, докато няма запис с дата, среда и доказателство.

## Какво е затворено в кода (клиентска преграда)
| Действие | Къде спира | Сървърен bypass |
|---|---|---|
| Ново съобщение до DogovaryAI (вкл. абонати) | `AssistantChat.sendMessage` преди мрежа | `assistant-chat` е пряко достъпен |
| Прикачване на файл в чата | `handleFiles` — файлът не се чете | няма |
| Нов абонамент / топъп | `StripeEmbeddedCheckout` не монтира Stripe | `create-checkout` пряко достъпен |
| Строго отключване | `StrictDocumentPaywall.startUnlock` | `create-strict-unlock-checkout` пряко достъпен |
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
3. Сървърни флагове за `assistant-chat`, `create-checkout`, `create-strict-unlock-checkout`.
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
- Входните `sector_id`/`contract_type` вече не се вграждат в `.or(...)` филтъра. Проверка: низ, до 200 знака, без контролни знаци; иначе 400 без заявка към базата. Обхватът се сравнява с точно равенство в паметта.
- Грешката към клиента вече не съдържа суровото съобщение на базата.
- Тест: `suggest-followup-questions/index.test.ts` (6/6).

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
