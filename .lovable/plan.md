## План (обновен): цени + FIRST100 с допълнителни 10% за годишен

### 1. Нови цени (EUR, ДДС включено)

| Продукт | Стара | Нова |
|---|---|---|
| Pro месечен (`pro_monthly`) | 9.90 € | **12.90 €** |
| Pro годишен (`pro_yearly`) | 99 € | **129 €** |
| Team място / месец (`team_seat_monthly`) | 7.90 € | **10.90 €** (мин. 3 = 32.70 €/мес) |
| Team място / година (`team_seat_yearly`) | — | **109 €/място** |
| Пакет 5 операции (`five_operations`) | 1.90 € | **2.90 €** |

### 2. Промокод FIRST100 — два варианта зад една дума
Stripe позволява само един купон на checkout сесия, затова правим **два купона зад една и съща Promotion Code лента**:

| Lookup ID | % off | Прилага се за |
|---|---|---|
| `first100_monthly` | **30%** | `pro_monthly`, `team_seat_monthly` |
| `first100_yearly` | **40%** | `pro_yearly`, `team_seat_yearly` (30% база + 10% годишен бонус) |

Не се прилага за `five_operations` / `single_contract`.

**UX:** потребителят пише `FIRST100` в Stripe-вграденото поле "Add promotion code". И двата промо-кода (monthly + yearly) се регистрират в Stripe с **един и същ публичен код** `FIRST100`, но с различни `restrictions.applies_to.products` (или различни ценови ограничения), така че Stripe сам избира правилния спрямо това какво е в количката. Без cap на брой ползвания, без ограничение нов/стар клиент.

### 3. Server (edge functions)
- `create-checkout` и `create-team`:
  - `allow_promotion_codes: true` само за recurring сесии;
  - идемпотентен `ensureFirstHundredCoupons()` при boot — създава двата купона + двата promotion code-а (`code: "FIRST100"`) ако не съществуват;
  - купоните се ограничават до съответните Stripe Products (Pro / Team) чрез `applies_to.products`.

### 4. Frontend копи (само замяна на числа)
`src/pages/Account.tsx`, `Hero.tsx`, `Team.tsx`, `Template.tsx`, `Wizard.tsx`, `WizardReview.tsx`, `BuildContract.tsx`, `legal/Terms.tsx` + email темплейти. Добавям малък банер на pricing картите: "Промокод FIRST100 → -30% месечно / -40% годишно".

### 5. Memory
Обновявам `mem://index.md` Core с новите цени и кратко правило за FIRST100.

### 6. Revenue.xlsx
Файлът все още не е качен. Когато го прикачите, ще:
- сменя цените на 12.90 / 10.90 / 2.90 / 129 / 109;
- добавя input cells: % клиенти ползващи FIRST100 (месечен 30% / годишен 40%);
- преизчисля MRR/ARR и LTV с новите формули, запазвайки форматирането.

### Извън обхвата
БД/RLS, webhooks, миграция на съществуващи абонаменти, loyalty купоните.