
## Цел

1. Безплатните потребители могат да минат целия Wizard и да видят готов документ, но с частично замъглено превю (средата).
2. При натискане на "Свали PDF/DOCX" — не се сваля, а се показва paywall "Вие създадохте Стриктен документ" с два CTA: (а) Абонамент Предприемач/Професионалист, (б) еднократно отключване "Стриктен документ" — 0,40 €.
3. Логика за запазване на прогреса — потребител, който напусне страницата (дори без вход), да може да се върне до момента, до който е стигнал (включително готов документ и статус на плащане).
4. Съответствие с маркетинговата фуния: без да чупим "5 безплатни операции" — Wizard-ът остава безплатен до момента на СВАЛЯНЕ. Свалянето при безплатен = paywall (не консумира операция).

---

## 1. Paywall модел — какво влиза къде

- **Безплатен план (нерегистриран/регистриран без Pro):**
  - Целият Wizard работи.
  - Превюто на генерирания документ се показва с blur mask върху средните ~40% от съдържанието (виждат се началото и подписната част; не се виждат ключовите клаузи).
  - Бутоните "Свали PDF/DOCX" отварят модал `StrictDocumentPaywall`.
- **Pro/Team абонати:**
  - Без промяна — плащат от месечния лимит / topup.
- **Еднократно отключване (нова функция):**
  - Продукт `strict_doc_unlock` — 0,40 € (EUR, VAT incl.), Stripe one-off.
  - Валиден за конкретен документ (по `doc_key` = sector + doc slug + user/session hash) — отключва точно този документ, вкл. повторни сваляния в PDF и DOCX за 24 ч.

## 2. Нова таблица — покупки за отключване

```sql
create table public.strict_doc_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  doc_key text not null,             -- session_id + slug на документа
  sector_id text,
  doc_name text,
  paid_price_eur numeric(6,2) not null default 0.40,
  stripe_session_id text,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '24 hours'),
  unique (user_id, doc_key)
);
```

- GRANT SELECT/INSERT на `authenticated`; ALL на `service_role`.
- RLS: user вижда/чете само своите редове; INSERT само от edge функция със service role след Stripe webhook.

## 3. Edge функции

- **`create-strict-unlock-checkout`** (нова) — приема `{ doc_key, sector_id, doc_name, return_url }`, връща Stripe Checkout URL за 0,40 €.
- **`stripe-webhook`** (разширяване) — при успешно plащане insert в `strict_doc_unlocks`.
- **`download-document`** (промяна) — преди quota check-а: ако `kind === "contract"` и user не е Pro и няма месечен лимит/topup, потърси активен `strict_doc_unlocks` за `(user_id, doc_key)`. Ако има — позволи сваляне БЕЗ да намаляваш операциите. Ако няма — върни `strict_paywall` (нов код) вместо `quota_exceeded`.

## 4. Frontend промени

### 4.1 `src/pages/Wizard.tsx` (и `WizardGraph.tsx`, `WizardBilingual.tsx`)

- Нов hook `useDocumentAccess(docKey)` — връща `{ isPro, hasUnlock, canDownload, loading }`.
- `LiveDraft` / preview панелът: когато `!canDownload`, обвий средната секция със `<BlurredPreviewOverlay>` (маска с градиент + бадж "Замъглено превю — отключи Стриктен документ").
- `handleExport`:
  - Ако `!user` → авт. поток (както сега, прогресът вече се пази).
  - Ако user, но `!canDownload` → отвори `<StrictDocumentPaywall />` вместо `downloadDocument`.
  - Track event `strict_paywall_shown` за фунията.

### 4.2 Нов компонент `src/components/wizard/BlurredPreviewOverlay.tsx`

- Обвивка около средните параграфи; CSS `filter: blur(6px)` + `pointer-events-none` + `select-none` + декоративен ключалка/бадж отгоре.
- Прилага се само върху рендерирания preview HTML, не върху реалния `result` (запазва се в state; никога не се exportва към DOM в текстов вид, защото това е за нерегистриран/безплатен и няма да достига до download пътя).

### 4.3 Нов компонент `src/components/wizard/StrictDocumentPaywall.tsx`

Модал със:
- Заглавие: "Вие създадохте Стриктен документ".
- Текст: "Dogovori.net поддържа стриктните документи за платени потребители."
- Три опции (карти):
  1. **Предприемач — 12,90 €/мес** → `/plans`.
  2. **Екип — от 32,70 €/мес** → `/plans`.
  3. **Отключи еднократно — 0,40 €** → извиква `create-strict-unlock-checkout`.
- Малък disclaimer: "Отключването е валидно 24 ч. за този документ (PDF и DOCX)."

### 4.4 Return от Stripe

- `/checkout/return` (или разширяване на съществуващия `CheckoutReturn.tsx`): при `type=strict_unlock` → връща user обратно на wizard URL-а от прогреса (виж 5).

## 5. Резюмиране на прогреса (resume)

Днес прогресът се пази в `localStorage["wizard:{sector}:{doc}"]`. Разширяваме:

- **Cross-device за логнати:** нов ред `saved_documents.wizard_state jsonb` (или лека таблица `wizard_progress`) — save при `answers/stepIdx/result` change (debounce 800 ms). При зареждане: merge localStorage ⟵ server (server печели при по-нов `updated_at`).
- **Глобален "Продължи откъдето спря":**
  - `src/lib/wizardProgress.ts` — util за list на всички `wizard:*` ключове с последен timestamp.
  - Baner на началната страница `/` (за логнати) и линк в Account: "Продължи документ: {docName}" → отваря съответния wizard URL.
  - При напускане (`beforeunload`) — flush pending save.
- **След Stripe redirect:** `sessionStorage.setItem("wizard:resume", url)` преди checkout; `CheckoutReturn` чете и navigate обратно.
- **Retention:** local запис 30 дни; сървърен запис до ръчно изтриване или до сваляне.

## 6. Маркетингова фуния — събития

Добавяме `trackEvent`:
- `wizard_preview_blurred_shown`
- `strict_paywall_shown` (source: `download_pdf|download_docx`)
- `strict_unlock_checkout_started`
- `strict_unlock_purchased`
- `wizard_resume_from_progress`

## 7. Копи (BG)

Единна терминология: "**Стриктен документ**" — за финализиран, юридически подсилен документ. Използва се в:
- Blur баджа: "Стриктен документ — превюто е замъглено"
- Paywall заглавието и Plans страницата (добавяме кратък параграф какво значи "Стриктен документ").

## 8. Технически детайли / файлове за промяна

**Нови:**
- `supabase/migrations/…_strict_doc_unlocks.sql`
- `supabase/functions/create-strict-unlock-checkout/index.ts`
- `src/components/wizard/BlurredPreviewOverlay.tsx`
- `src/components/wizard/StrictDocumentPaywall.tsx`
- `src/hooks/useDocumentAccess.ts`
- `src/lib/wizardProgress.ts`

**Променяни:**
- `supabase/functions/download-document/index.ts` — strict_paywall клон + honor на unlock.
- `supabase/functions/stripe-webhook/index.ts` — insert в `strict_doc_unlocks`.
- `src/pages/Wizard.tsx`, `src/pages/WizardGraph.tsx`, `src/pages/WizardBilingual.tsx` — интеграция на blur + paywall + progress push.
- `src/components/wizard/LiveDraft.tsx` — да рендерира blur mask когато `locked` prop.
- `src/pages/CheckoutReturn.tsx` — handle `strict_unlock`.
- `src/pages/Plans.tsx` — секция "Стриктен документ — какво е това?".
- `src/pages/Index.tsx` (или Home) — банер "Продължи документ".

## 9. Извън обхвата (за после)

- Team споделяне на unlocks.
- Bulk отстъпка за няколко еднократни отключвания.
- Отделен canvas за DOCX watermark специфично за unlock-нат документ (използваме съществуващия `watermark` път).

---

**Уточнение, ако желаете:** Стриктният unlock да е за конкретен документ (както по-горе) или за пакет от N сваляния? Плановата стойност е 0,40 € за 1 документ (PDF+DOCX за 24 ч.).
