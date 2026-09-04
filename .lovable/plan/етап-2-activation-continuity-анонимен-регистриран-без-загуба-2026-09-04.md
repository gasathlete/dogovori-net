# Етап 2 — Activation continuity (анонимен → регистриран без загуба на контекст)

Цел: който е дошъл от SEO / шаблон / `/start` и е започнал документ като анонимен, да продължи точно оттам след вход или регистрация — същият документ, същите отговори, същата стъпка, същият генериран резултат. Без нов уизард, без промени в цени и еднократни плащания.

## 1. Карта на текущото поведение и точките на загуба

Реални входове: `/shablon/:slug` → `/wizard/:sectorId?doc=…` (Template.tsx), `/start` → интент линк, `/build` (свободен билдър), `/wizard/:sectorId`.

| Място | Как е сега | Къде се губи контекст |
|---|---|---|
| Wizard | localStorage ключ `wizard:<sectorId>:<docName>`, TTL 7 дни, пази `answers, stepIdx, result, signature, savedDocId, contactId, arbitration` | Черновата съдържа лични данни в чист вид в localStorage (имена, ЕГН, IBAN попълнени в отговорите) и живее 7 дни |
| Build | localStorage ключ `build:custom-contract` — **един глобален ключ, без версия и без TTL** | Втори документ или втори таб презаписва първия; резултатът от генериране може да изчезне безшумно; няма изтичане |
| Inline auth (модал) | не навигира; след вход извиква `onSuccess` | При Google минава през пълно пренасочване и разчита на `sessionStorage.post_login_redirect` |
| Email регистрация | `emailRedirectTo: window.location.href` (inline) / `origin + redirect` (страница `/auth`) | Линкът от имейла често се отваря в **нов таб или друг браузър** → `sessionStorage` е празен; при друг браузър черновата липсва напълно |
| `/auth` | `redirect` парам; по подразбиране `/account` | Всеки вход без изричен `redirect` (вкл. през `ProtectedRoute`, вкл. хедъра) завършва в празен акаунт |
| `useAuth` | обработва `post_login_redirect` само при `SIGNED_IN` | При възстановена сесия (`INITIAL_SESSION`) пренасочването не се изпълнява |
| Резултат / `saved_documents` | вписва се само за влязъл потребител | Анонимно генерираният preview никога не се „присвоява“ — след вход няма запис, `savedDocId` в черновата е без покритие |
| Квота / paywall | брои се на сървъра за влязъл потребител | Анонимна операция и след-логин операция не са свързани — може да се таксува два пъти за същия документ |

## 2. Един каноничен draft модел (без лични данни в localStorage)

Нов модул `src/lib/activationDraft.ts` — единствен източник на истина за чернови в трите потока.

В localStorage остава само **указател**, никакви отговори:

```text
key: activation_draft_v1
{ draftId, claimToken, flow: "wizard"|"build", docKey, route, stepIdx, ts, expiresAt, hasResult }
```

Съдържанието с лични данни (отговори, генериран текст, подпис) живее:
- в паметта на React по време на сесията;
- в `sessionStorage` за същия таб (устойчиво на refresh и на OAuth пренасочване);
- в базата, като **криптирано по съдържание не е нужно**, но е защитено с токен и кратък TTL — само това издържа „нов таб от имейл“.

Стари ключове (`wizard:*`, `build:custom-contract`) се четат еднократно за миграция, после се изтриват.

## 3. Anonymous → authenticated claim/restore

- При първо реално действие (не при mount) се създава анонимна чернова през edge функция `draft-sync`: сървърът генерира `draftId` + `claimToken` (32 байта), в базата се пази само хеш на токена.
- Autosave с debounce 1.5 s изпраща payload към същата функция (upsert по `draftId` + токен).
- След успешен вход/регистрация клиентът вика `draft-claim` с `draftId` + `claimToken`. Сървърът: проверява хеша, TTL, че черновата не е присвоена, привързва я към `auth.uid()`, при наличен резултат създава запис в `saved_documents` и връща route + payload.
- Защита от подмяна: токенът е еднократен за claim, сравнява се с constant-time хеш, `claimed_by` се задава атомарно (`update … where claimed_by is null`), rate limit по IP през `rate_limit_buckets`, никога не се доверяваме на `user_id` от клиента, `service_role` е единственият достъп до таблицата (без Data API за anon).
- TTL: 24 часа за анонимна чернова, 30 дни след присвояване; нощно изтриване.

## 4. Поведение по сценарии

| Сценарий | Поведение |
|---|---|
| Email + парола (inline) | сесията е налична веднага → claim → продължава действието на място |
| Email с потвърждение в нов таб | `emailRedirectTo` носи `?draft=<id>` (без токен); новият таб чете токена от localStorage указателя, ако е същият браузър; ако не е — показва „Продължи документа“ след вход, като claim става по `draft` парам + токен от указателя, иначе честно съобщение и връзка към каталога |
| Google OAuth | `redirect_uri = origin`, желаната цел се пази и в localStorage указателя (не само в `sessionStorage`) → работи и след пълно пренасочване |
| Refresh | указател + `sessionStorage` payload → същата стъпка, същият резултат |
| Затворен прозорец, същият браузър | указател остава → при връщане предлага „Продължи оттам, където спря“ |
| Дублиран таб | ключът е per-draft, не глобален; всеки таб пази своя `draftId`; при опит да пишат в един и същ draft печели по-новият `ts`, другият показва ненавиждаща лента „Отворено е в друг таб“ |
| Изтекла чернова | указателят се изтрива, показва се неутрално съобщение и линк към документа отначало (без загуба на избора на документ) |
| Вход без чернова | текущото поведение остава |

## 5. UX

Преди auth: няма промяна в стъпките. Дискретен индикатор „Черновата се пази“ и в уизарда, и в билдъра.

По време на auth: модалът получава контекстен подзаглавен ред — името на документа и „Отговорите ви са запазени“. Никакво напускане на страницата при email/парола.

След auth: пълноекранен преход изчезва; ако има резултат — отваря се директно прегледът с ясен ред „Възстановено“ и следващото действие (свали / изпрати за подпис). Ако няма резултат — връща се на точната стъпка. `/account` никога не е дестинация, когато има активна чернова.

## 6. Канонични funnel събития

Добавят се в `src/lib/funnelEvents.ts` (dedup по `draftId`, без лични данни в props):
`draft_created`, `draft_autosaved` (веднъж на сесия), `draft_restore_offered`, `draft_restored`, `draft_claim_started`, `draft_claim_succeeded`, `draft_claim_blocked` (`reason`: `expired|already_claimed|invalid_token|network`), `draft_expired`.
Съществуващите `doc_start`, `auth_prompt_shown`, `paywall_shown`, `signup_completed` остават непроменени. Нов производен показател в `/admin/metrics`: **activation continuity rate** = `draft_claim_succeeded / auth_prompt_shown` при налична чернова.

## 7. Миграция / API / RLS

Миграция (една):
```text
create table public.anonymous_drafts (
  id uuid pk default gen_random_uuid(),
  token_hash text not null,
  flow text not null, doc_key text, route text not null,
  payload jsonb not null default '{}',
  step_idx int default 0, has_result boolean default false,
  claimed_by uuid, claimed_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  expires_at timestamptz not null
);
grant all on public.anonymous_drafts to service_role;   -- без anon/authenticated
alter table … enable row level security;
policy: собственикът след claim може select/delete (auth.uid() = claimed_by)
index: (expires_at), (claimed_by)
```
TTL се валидира с trigger, не с CHECK. Edge функции: `draft-sync` (create/update) и `draft-claim` (присвояване + опционален запис в `saved_documents`), двете със service role и rate limit. Квотата не се таксува при claim — ако анонимната сесия вече е платила операция, `session_id`/`doc_key` се пренася, за да не се такса втори път.

## 8. Тестове и rollout

- Unit: `activationDraft.ts` — сериализация, TTL, миграция от стари ключове, липса на PII в localStorage payload (assert върху ключовете), избор на победител при два таба.
- Unit: нови funnel събития и dedup.
- Deno: `draft-sync` / `draft-claim` — валиден/невалиден токен, изтекла чернова, двоен claim, липса на PII в логовете (`maskSensitive`).
- Playwright: (а) шаблон → уизард → 3 отговора → inline signup → същата стъпка; (б) генериран резултат → signup → отваря прегледа и има запис в документите; (в) refresh по средата; (г) изтекла чернова.
- Флаг: `activation_continuity` през съществуващия `src/lib/ab.ts` — изключен → старото поведение с локални ключове. Пускане: вътрешно → 20% → 100%, с проверка на continuity rate и на индекса на качеството.

## 9. Разбивка на commits

1. `activationDraft.ts` + типове + тестове (без включване в екраните).
2. Миграция `anonymous_drafts` + grants/RLS + cleanup.
3. Edge функции `draft-sync`, `draft-claim` + Deno тестове.
4. Wizard: използва каноничния модел зад флага, миграция от стария ключ.
5. Build: същото + премахване на глобалния ключ `build:custom-contract`.
6. Claim при вход: `InlineAuthDialog` / `useAuth` / `Auth.tsx` — единна дестинация след auth, `INITIAL_SESSION` покрит.
7. Нови funnel събития + плочка в `/admin/metrics`.
8. Playwright сценарии + вдигане на флага.

## 10. Критерии за приемане

1. Анонимен потребител попълва 3 стъпки, регистрира се inline → връща се на стъпка 4 със същите отговори, без ново зареждане на екрана.
2. Анонимно генериран резултат след регистрация е видим и е записан в документите — без повторно таксуване на операция.
3. Google вход и потвърждение по имейл (нов таб, същият браузър) водят до документа, не до `/account`.
4. Refresh, затворен прозорец и два таба не губят и не смесват чернови.
5. В localStorage няма нито един отговор, име, ЕГН или IBAN — само указателят.
6. Изтекла чернова дава ясно съобщение, никога бяла страница или грешка в конзолата.
7. `draft_claim_succeeded / auth_prompt_shown` се вижда в `/admin/metrics`; качественият индекс не спада.
8. Всички тестове минават; при изключен флаг поведението е идентично с текущото.
