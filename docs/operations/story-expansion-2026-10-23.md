# Story expansion — 23 October 2026

## Source/preview changes
- Seven manual scenes: task → branding → analysis → DogovaryAI → catalog/sector packages → review/PDF–DOCX → registration/create.
- Analysis switches between two canonical fictional product findings; assistant switches between two fixed illustrative answers; catalog switches between template and sector composition. All selections stay local. No models, uploads, downloads, saves, emails or paid operations invoked.
- Existing IM Development invitation/branding, identity, optional consent and signup funnel preserved. Skip-to-start is available on every non-final scene. Final guest CTA retains `/auth?tab=signup&redirect=%2Fbuild`; authenticated users retain `/build`.
- Existing `/analiz`, `/assistant`, `/catalog`, `/paketi` routing and actual PDF/DOCX exporters inspected. No signing or scanned-PDF claims. Review/legal warnings and rights/operation conditions remain explicit.

## Validation
- Four focused files, **44 tests passed**: registration/story/local selections/no requests/signed-in CTA; opt-in defaults, consent processing and existing home interactions.
- Automatic build **OK at 17:37:58 UTC**, after removing unsupported testing-library option from the new tests. No manual build/typecheck.
- Chromium: **1280×1800, 390×844, 360×844**, reduced motion enabled. All seven scenes captured; branding, analysis/question/package choices, progress, next/back, bounded keyboard, simulated horizontal swipe, skip, final href, close/Escape, focus restoration and reopening verified. No horizontal dialog overflow or runtime errors in final run. Screenshots: `/tmp/browser/story-expansion/`.
- Mobile scene body can scroll vertically; navigation and skip/finale remain fixed and accessible. Dense analysis excerpt continues below fold rather than shrinking text.
- Actual existing owner session restored on localhost: final creation action `/build`, no signup prompt. No authenticated screenshot or account data captured.
- Initial synthetic touch events omitted `changedTouches` on touchstart, producing a react-remove-scroll instrumentation error. Corrected event payload; final runs are clean. Physical-device gestures were not tested.

## Files and limits
`StartStoryOverlay.tsx`, new `StoryCapabilityDemo.tsx`, `registrationFunnel.test.tsx`, `AGENTS.md`, `roadmap.md`, this report; registration preference memory clarified.

No new account, real signup/bonus grant, payment, backend/dependency changes or publication. Fixed demo answers do not establish real AI result quality. Credit ledger reports **3.70 credits for 17:35–17:41 UTC**; final turn cost is not yet available and may include later work.