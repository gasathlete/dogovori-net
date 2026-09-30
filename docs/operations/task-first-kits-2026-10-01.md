# Task-first kits — 01.10.2026

## What works now
- `/start` has a new "Какво искате да направите?" section with 6 practical tasks, and each one opens an existing kit (`src/data/everydayTasks.ts`).
- `/komplekti/naem-zhilishte` shows a "Започнете подготовката" button. The other kit pages are unchanged.
- New route `/komplekti/naem-zhilishte/podgotovka` (noindex; canonical points to the kit page). It has 5 question steps plus a review step.
  - It reuses the canonical questions from the "Договор за наем на жилище" graph by id, so labels and conditions are the same. The only new question asks whether to include the НАП declaration.
  - Answers are kept only in the page's memory. They survive moving back and forward. Nothing goes to localStorage, and analytics receive only the step number.
  - The summary is editable, section by section, and shows how many required answers are missing.
  - The document list is built from the real kit and its stages. Each kit item appears exactly once. Conditions: the inventory list appears only if the home is furnished; the receipt appears only with a deposit or cash payment; the НАП declaration appears only if chosen; the notice is marked "По-късно". The planned return protocol has no link.
- No legal text was copied or created.

## Not claimed / gated
- The facts are **not** filled into the documents automatically. No field mapping to the wizard or export was verified, and the page says so.
- Documents open on their existing `/shablon/:slug` pages. Their gates (test-month saving, AI, purchases) are unchanged.
- Purchases and live AI stay closed. The existing "Извести ме при пускане" banner is used. No Stripe changes, no database changes, no deployment.

## Verification
- `src/test/taskFirstRental.test.ts` (6 tests): canonical question reuse, each kit item exactly once, links only for canonical documents, changed answers updating the list, the deposit branch and cleanup of hidden answers, tasks pointing to existing kits, and the gate check (no checkout/AI/storage calls).
- Full vitest run: 159 files, 2,024 passed, 4 skipped, 0 failed. Typecheck clean.
- Playwright at 390 and 1280 px: an answer is kept after Next→Back, 7 documents are listed, no horizontal overflow.
