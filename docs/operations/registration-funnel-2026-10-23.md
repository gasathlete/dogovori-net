# Registration funnel — 23 October 2026

## Implemented (source/preview only)
- Shared prominent “Регистрирай се безплатно” in hero, header/menu, homepage plans and footer. Signed-in users get `/build`; anonymous destinations pass the existing safe-route sanitizer and retain the selected product. Search stays public and is now the secondary hero action.
- One homepage invitation after actual scroll engagement and eight seconds, only beyond the hero action. Session dismissal persists. Visible header/hero/section/footer actions, forms, active keyboard/input, cookie choice, menus and dialogs suppress it. Desktop header CTA intentionally suppresses the invitation when visible. Removed the existing automatic exit-intent host; no new popup.
- One optional marketing presentation in email signup, inline signup, Google consent and zero-credit offer: messages, existing three-operation once-only bonus, eligibility condition and withdrawal without losing granted operations. Unchecked by default, never part of signup readiness. Server grants/pricing/quotas/migrations unchanged.
- Fixed inline email signup's missing explicit consent stash and reset its marketing choice on each fresh opening. Both email signup surfaces preserve evidence before signup can emit an authenticated session; existing stable-event consent flush remains authoritative.
- Reused the historical `StartStoryOverlay`, now lazy on explicit signal with four manual scenes, fictitious IM Development → Договори.нет excerpt, brand toggle, arrows/swipe, bounded keyboard navigation and direct signup finale. Radix handles Escape/focus trap; explicit focus restoration. Repeated lazy replay events do not reset an open story. No document saves, sound, autoplay or forced navigation.
- Existing consent-gated metrics record CTA source, story open/completion and submitted marketing choice (not fabricated confirmed consent). Existing authenticated signup-completion metric retained. No personal data or new trackers.

## Files
`src/lib/{registrationFunnel,startStory}.ts`, `src/components/funnel/{RegistrationCTA,StickyScrollCta,StartStoryOverlay}.tsx`, `src/components/auth/{MarketingOptIn,GoogleConsentDialog,InlineAuthDialog}.tsx`, `src/pages/Auth.tsx`, `src/components/{Header,Hero,SeoFooter,MarketingBonusDialog,MobileBottomNav}.tsx`, `src/components/home/{HomeSections,ProductsSection}.tsx`, `src/hooks/useFunnelCta.ts`, `src/App.tsx`, `src/test/registrationFunnel.test.tsx`, `AGENTS.md`, `roadmap.md`.

## Actual validation
- Nine focused test files: **80 passed** (registration intent/suppression/manual story, consent defaults/flush, bonus denial/retry/concurrency/replay, auth redirect, partner carousel, existing homepage interactions/tools/shell).
- An exploratory run of `mobileConversion.test.tsx` passed 31 checks and failed one unrelated pre-existing assertion that requires an older literal Products heading. Its file and the Products page were not changed to satisfy a copy assertion.
- Latest automatic preview build: **build OK**, 17:23:23 UTC. No manual build or typecheck executed.
- Chromium: 1280×1800, 1440×1800, 1920×1800, 390×844 and 360×844. Story four scenes, brand toggle, close/Escape and restored trigger focus, arrow boundary, direct signup destination, reduced motion and no runtime errors verified. Mobile controls/final CTA remain visible; scene body can scroll on short screens without moving the controls. Screenshots under `/tmp/browser/registration`.
- Real anonymous UI: cookie rejection, unchecked marketing, registration enabled without marketing, product return URL, mobile menu CTA, sticky visible at 390/360 and session dismissal surviving reload. No horizontal page overflow. Desktop navigation has measured separate link bounds at 1920; 1440 uses the menu to avoid cramped links.
- Existing owner session restored through supported mint: actual signed-in homepage and story show creation, no signup prompts. No authenticated screenshot or private data captured.
- Preserved compact workspace: edit updates excerpt; accent and logo toggle; review link `/build`. Measured **431.64px at 390**, **452.64px at 360**. Real inline counter still displayed (309 at this check), never hardcoded or changed.

## Limits and cost
- No new real account, signup email, marketing email, grant, purchase or payment created. Full fresh signup → confirmed email → real bonus grant was not repeated; unchanged server bonus semantics verified through existing focused tests, including one claim under concurrency. Source and preview validation do not establish new production conversion gains.
- Actual ledger query for this project reported **7.60 credits** for the requested 17:12–17:20 window; this is an intermediate recorded amount, not a verified final turn total. No paid models or catalog regeneration invoked.
- Git commits are managed automatically by the environment; final revision is reported after the last documentation change. No publication, dependencies or backend deployment.