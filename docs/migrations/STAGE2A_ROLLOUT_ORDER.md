# Stage 2A/2B1B2 — задължителен ред на прилагане

Състояние: коригираната базова миграция и 0018→0025 бяха приложени ръчно и
атомарно на **12.09.2026**, всяка в собствена транзакция, в точния ред по-долу.
Първият опит се върна изцяло назад на statement 21 с SQLSTATE 0A000 („cannot use
subquery in check constraint“) — без частична схема и без промяна на данни. След
корекцията пробното изпълнение и прилагането минаха. Проверено: 10 таблици,
финални constraints, индекси, triggers, policies, функции и RLS съществуват;
`uploaded_contracts` = 13, `order_snapshots` = 0, всяка продуктова таблица = 0;
`load_product_result_state` връща точно `{ "ok": false, "reason": "not_found" }`.
Помощната таблица `public.__codex_product_migration_stage_20260912` е DROP-ната.

`0026_product_acl_hardening` е **само източник** и предстои в следваща
контролирана стъпка. Не са включени flags, Edge функции, frontend publish,
Stripe, sandbox и live AI.

Точен ред, в едно и също одобрено действие по поддръжка:

1. `supabase/migrations/20260910090000_product_checkout_entitlements.sql`
   — базовата миграция. Тя беше коригирана **преди първото прилагане**:
   подзаявката в `product_checkout_intakes_context_ck` е заменена с immutable
   JSONB изваждане, останалата семантика е непроменена, а базовият SHA-256 в
   manifest-а е преизчислен. В този вид базата е приложена на 12.09.2026.
2. `drizzle/migrations/0018_product_result_v2_binding_patch.sql`
   — коригиращата миграция за резултат v2, **веднага след** базовата.
3. `drizzle/migrations/0019_product_fulfillment_jobs.sql`
   — задачите, наемът, контролните точки и версията на политиката,
   **веднага след** коригиращата.
4. `drizzle/migrations/0020_product_fulfillment_jobs_correction.sql`
   — корекцията на 0019: единица micro-USD, отделни граници за вход и изход,
   разход по контролна точка, строг курсор/ключ/наем, продуктови преходи,
   крайна постоянна грешка и освобождаване на наем. **Веднага след 0019.**
5. `drizzle/migrations/0021_product_policy_binding_patch.sql`
   — обвързва неизменно платеното право с точната версия на политиката от
   заявката и отказва празна/несъвпадаща връзка. **Веднага след 0020.**
6. `drizzle/migrations/0022_product_generation_artifacts.sql`
   — трайни, service-only артефакти, точни call ID разписки, стабилен timestamp,
   безопасно възстановяване и атомарно завършване. **Веднага след 0021.**
7. `drizzle/migrations/0023_product_generation_artifacts_correction.sql`
   — коригира текущия курсор/етап, строгото повторение, безопасната резервация
   на моделно извикване и атомарното записване на финалния резултат. **Веднага след 0022.**
8. `drizzle/migrations/0024_product_generation_runtime_safety_correction.sql`
   — инициализира неизменния generation timestamp под валиден наем, премахва
   фантомния passport артефакт и добавя липсващата проверка на курсора. **Веднага след 0023.**
9. `drizzle/migrations/0025_product_result_selections.sql`
   — състоянието на избора по поправка (монотонна версия, неизменни ревизии,
   ключ за идемпотентност) и точно едно уточнение на пакета за преговори с
   наем, неизменна история и запазен оригинален резултат. **Веднага след 0024.**
10. `drizzle/migrations/0026_product_acl_hardening.sql`
   — трайно затягане на правата след прилагането: пълно отнемане върху 10-те
   продуктови таблици и върху каноничния списък функции, SELECT само за петте
   таблици на собственика, EXECUTE изключение само за
   `product_job_status(uuid)`, нужният достъп за `service_role` и read-only
   способността `product_rollout_capability()`. Идемпотентна, без промяна на
   default privileges и без данни. **Веднага след 0025. Още не е приложена.**

Защо редът е задължителен: базовата миграция създава таблиците, ограничението
`product_entitlements_ready_ck` и функциите, които записват резултат, но сверява
обвързването по стария плосък път `result ->> 'source_hash'`, който в схема v2
винаги е NULL. Миграция 0018 заменя ограничението и двете функции с проверка по
точна версия 2 и цялото вложено обвързване `result -> 'source'`. Миграция 0019
добавя трайното състояние на изпълнението (задача, наем, контролни точки,
content-free разход) и колоната `generation_policy_version`, която задачата и
заявката сравняват — тя предполага, че 0018 вече е приложена. Миграция 0020 не
пренаписва 0019 (той е приет и защитен), а го привежда в съответствие със
   сървърната политика `2b1b1.2` (по-късно затегната в изходния код като
   `2b1b1.3`, без промяна на SQL единиците): преименува разхода в micro-USD, добавя отделни
граници за вход/изход и разход по контролна точка, изтрива старите изменящи
подписи и създава строгите функции за заявяване, контролна точка, освобождаване
на наем и провал. Миграция 0021 не предполага текуща версия в SQL: тя взема
непразната неизменна версия от точната заявка и я заключва в платеното право.
Преди прилагане задължително се доказва, че няма legacy/празни intake редове;
миграцията не измисля и не попълва стойности.

Файлове за преглед (байт по байт еднакви с изпълнимите):

- `docs/migrations/stage2a_product_checkout_entitlements.sql`
- `docs/migrations/stage2a_product_result_v2_binding_patch.sql`
- `docs/migrations/stage2a_product_fulfillment_jobs.sql`
- `docs/migrations/stage2b1b1_product_fulfillment_jobs_correction.sql`
- `docs/migrations/stage2b1b1_product_policy_binding_patch.sql`
- `docs/migrations/stage2b1b2_product_generation_artifacts.sql`
- `docs/migrations/stage2b1b2_product_generation_artifacts_correction.sql`
- `docs/migrations/stage2b1b2_product_generation_runtime_safety_correction.sql`
- `docs/migrations/stage2b1c_product_result_selections.sql`
- `docs/migrations/stage2b1d_product_acl_hardening.sql`

Контролни суми (SHA-256) на изпълнимите файлове:

- 0018: `b6eeef764500efc9f799c18c5060ce45706fd371c33e65bbb9f3f3d848b27cc3`
- 0019: `77e4cf1f3bc1dafe5d8d2b2a483203d0ac8f13438f2f5bac5d2ef1a6ebf8e9a7`
- 0020: `328c108abb489063309eaad6cafc31e679a4454355445677fb009a8e2b859629`
- 0021: `8e9150f9154e55baf413703847aade5e12f84ae4331eeebaef093219e87af821`
- 0022: `65797186dc7635d27be8b1fc258a5ef02cc54dd280ef3a486b0360231f68ba3c`
- 0023: `484199ee7ed7b683e7c428ae007f5607001010872bfdb91dc73b0e3af0092ab8`
- 0024: `eb732f25a24d57a9ecec9f0f83ba7e0ff6dc66bde2ad45fdf2e1d52818f01645`
- 0025: `f9d5e11e3c04b5a393cec60a8bb67b22bef33c110ba48bb288dfb6d0ce84ca33`
- 0026: `a21afdd9bacd642601f215040b973a7fc9c2e58db2826214ffaad4a5cd00bfcf`

Нито един от файловете не е записан в `drizzle/migrations/meta/_journal.json`:
в това хранилище няма доказана конвенция за журнал на ръчни SQL кръпки, а този
документ е авторитетният ред.

Номер `0026` вече е зает от затягането на правата. Обратимата карта за редакция
не се записва: няма одобрен шифроващ примитив. Live provider остава затворен до
доказан zero-retention gate.

Stage 2B остава **блокиран за продукция**, докато 0026 не бъде приложена и
проверена и докато не бъдат дадени отделните одобрения за функции, frontend и
flags. Дотогава не се създава платено изпълнение на резултат: `fulfill-product`
умишлено няма live provider, докато zero-retention не е проверен.
