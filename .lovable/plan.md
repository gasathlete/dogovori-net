## План

### 1. Допълнение към съгласието при регистрация

В `src/pages/Auth.tsx` (signup форма) — разширявам текста до чекбокса за маркетинг (или го разделям на два чекбокса):

- Запазвам „Общи условия и Политика за поверителност" като задължителен.
- Маркетинговият чекбокс получава по-ясен текст:
  > „Съгласявам се да предоставя име и имейл на администратора на платформата за получаване на рекламни съобщения, известия за бонуси и награди в dogovori.net."
- Същият пасаж се добавя и в `src/pages/legal/` (Terms + Privacy секцията) като нов параграф, за да е отразено и в Общите условия.
- Запис в `user_consents` остава както досега (`consent_type: "marketing"`), но bump на `CONSENT_VERSIONS.marketing` в `src/lib/consents.ts` за нова версия на документа.

### 2. Система за известия (notifications)

#### База данни (миграция)

Таблица `public.notifications`:
- `user_id` (nullable — `NULL` означава broadcast до всички)
- `kind` (text: `finish_doc`, `broadcast`, `system`)
- `title`, `body`
- `link` (опционален път, напр. `/wizard?resume=<saved_id>`)
- `created_by` (uuid на админа за broadcast)
- `created_at`

Таблица `public.notification_reads`:
- `user_id`, `notification_id`, `read_at` (за маркиране на прочетени, особено за broadcast).

GRANTs + RLS:
- Authenticated user чете: свои персонални + всички broadcast (`user_id IS NULL`); + `is_staff` чете всичко.
- Insert: само `is_staff` (за broadcast и ad-hoc); service_role за системни (напр. „Довършете документа").
- `notification_reads`: user управлява само своите редове.

RPC функции:
- `mark_notification_read(_id uuid)` — upsert в `notification_reads`.
- `unread_notifications_count()` — връща broя непрочетени (персонални + broadcast без ред в reads).

#### Автоматични известия „Довършете документа си"

- Edge function `notify-unfinished-docs` (cron, 1×дневно): минава през `saved_documents` със статус незавършен (или `document_kits.status = 'in_progress'`) по-стари от ~24ч и без съществуващо `finish_doc` известие за същия `saved_id`, и създава запис в `notifications` с link към `/wizard?resume=<id>` (или съответната страница).

#### UI — таб „Известия" в профила

В `src/pages/Account.tsx`:
- Нов `TabsTrigger value="notifications"` с икона `Bell` + червена точка-badge, когато има непрочетени.
- Нов компонент `src/components/NotificationsTab.tsx`: списък с известията (заглавие, текст, време, link бутон „Отвори"); бутон „Маркирай всички като прочетени".
- Realtime subscribe на `notifications` (insert) за live update на брояча.

#### Червена точка на бутон „Профил" в Header

В `src/components/Header.tsx`:
- Нов hook `src/hooks/useUnreadNotifications.tsx` — извиква `unread_notifications_count` при mount и слуша realtime канал.
- Когато > 0, рисувам малка червена точка (абсолютно позиционирана) върху бутона „Профил" (десктоп + мобайл).

#### Модераторски панел — изпращане на broadcast

В `src/pages/Admin.tsx`:
- Нова секция / таб „Известия" (или нов `AdminNotificationsPanel.tsx`):
  - Форма: заглавие, текст, link (опц.), бутон „Изпрати до всички".
  - Таблица с последно изпратените broadcast-и с брой прочитания и бутон за изтриване.
- Insert се прави директно през supabase client (RLS позволява само `is_staff`).

### Технически детайли

- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications, public.notification_reads;`.
- Червена точка: `bg-red-500 ring-2 ring-navy` 8×8px, позиционирана top-right на бутоните.
- Брояч се изчислява като: персонални (`user_id = auth.uid()`) непрочетени + broadcast (`user_id IS NULL`) без запис в `notification_reads` за този user.
- Маркира се „прочетено" при отваряне на таба или при клик върху отделен елемент.

### Файлове за промяна / създаване

- Миграция: `notifications`, `notification_reads`, RPC, grants, RLS, realtime publication.
- `src/pages/Auth.tsx` — обновен текст на маркетинг чекбокса.
- `src/pages/legal/Terms.tsx` (или съответната страница с общи условия) — нов параграф.
- `src/lib/consents.ts` — bump на `marketing` версия.
- `src/hooks/useUnreadNotifications.tsx` — нов.
- `src/components/NotificationsTab.tsx` — нов.
- `src/components/AdminNotificationsPanel.tsx` — нов.
- `src/pages/Account.tsx` — нов таб + червена точка.
- `src/components/Header.tsx` — червена точка на „Профил".
- `src/pages/Admin.tsx` — закачам новия панел.
- Edge function `supabase/functions/notify-unfinished-docs/index.ts` + cron.
