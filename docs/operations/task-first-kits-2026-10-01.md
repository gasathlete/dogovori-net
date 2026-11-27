# Task-first kits — 01.10.2026

## What works now
- `/start` has a "Какво искате да направите?" section with 6 tasks. Each one opens an existing kit (`src/data/everydayTasks.ts`).
- `/komplekti/naem-zhilishte` has a "Започнете подготовката" button that opens `/komplekti/naem-zhilishte/podgotovka` (noindex; canonical points to the kit page).
- The preparation reuses canonical questions from the "Договор за наем на жилище" graph by id. That now includes term type, end date (only for a fixed term), payment day (default 5, from the graph) and the EUR money fields.
  - Parties are collected as legal form only (Юридическо лице / Физическо лице / ЕТ). That is exactly the value the wizard's PartyBlock stores; names and ЕГН are entered in the document.
  - Стая or търговско помещение shows a notice that routes to the lease template or the `naem-ofis` kit. The furnished document list is replaced by "Изберете друг път".
  - The НАП-registration question is removed. The declaration stays in the kit and catalog, marked "Не е преценен" (applicability not assessed).
  - A condition that hasn't been answered shows as "Липсва отговор", never as "Не е нужен".
- **Preparation context** (`src/lib/taskPreparation/preparationStore.ts`) lives in module memory only. It survives in-app navigation (preparation → template → wizard → back) and is lost on reload. There's an explicit "Изчисти данните от подготовката" button on both the preparation page and the wizard.
- **Prefill** (`rentalFieldMap.ts` + `components/wizard/KitPrefillBridge.tsx`, mounted in `Wizard.tsx`) uses explicit mappings only:
  - Договор за наем на жилище (`dogovor-za-naem-na-zhilishte`): 13 fields (parties, property type/address, furniture, term type, start/end date, rent, payment day/method, deposit yes/no + amount).
  - Разписка (наем/депозит) (`razpiska-za-poluchena-suma-naem-depozit`): parties, address, payment method (cash→"В брой", bank_transfer→"По банков път").
  - Protocol and inventory have no question graph, so nothing is mapped. All their fields stay for the user to fill in.
  - Empty fields and fields left unchanged since the last prefill are filled. If the user edited a field and the preparation changes, a prompt asks before anything is replaced ("Замени" / "Запази моите").
  - While a preparation is active, the wizard's legacy localStorage draft write is skipped for mapped documents. Prefilled data stays out of browser storage. The server-backed activation draft path is unchanged.
- The document list says "С предварително попълнени данни във въпросника" only for the two mapped documents. Availability means "it's in the catalog". Downloading still follows the current test-month gates.

## Not claimed / gated
- I didn't verify any exported file content, so no document is called "готов".
- Purchases, live AI and test-month save/download gates are unchanged. In the browser run the existing waitlist dialog still appeared in the wizard.
- No DB, consent, billing, Stripe, AI or dependency changes. Nothing was deployed. `bun.lock` is identical to `24144be0`.

## Verification
- `src/test/kitPrefill.test.tsx` (11 tests): every mapping targets a real question; value conversion to the receiving labels and party shape; rendering in the real `QuestionField`/PartyBlock (address shown, party buttons `aria-pressed`); an edit is kept and the revision prompt replaces it only on confirmation; clearing; pruning the end date for an indefinite term; pending vs not-needed; NAP not assessed; unsupported property; store revisions; no storage/URL/network/analytics in the prefill path.
- `src/test/taskFirstRental.test.ts` (6) still passes.
- Full vitest: 160 files, 2,035 passed, 4 skipped, 0 failed. tsc clean. Build OK. Security-shield unit tests: 10/10. The live header check still reports the known hosting-level CSP/framing gap, which is unrelated.
- Playwright at 390 and 1280 px: preparation → template → wizard shows "Предварително попълнени данни … 4 полета" with the party form selected. No wizard draft key in localStorage. After going back, the answer is still there. No horizontal overflow.
