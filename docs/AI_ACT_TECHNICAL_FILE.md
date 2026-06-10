# AI Act — Technical Documentation File

**Reference:** Regulation (EU) 2024/1689 (AI Act), Annex IV  •  **System:** Dogovori.net AI assistant  •  **Risk class:** Limited risk (Art. 50) — generative AI subject to transparency obligations  •  **Owner:** DPO  •  **Version:** 2026-06-25  •  **Review:** annual

## 1. General description (Annex IV §1)
- **Purpose:** Assist Bulgarian SMEs and consumers in drafting, analysing and correcting civil-law contracts and templates. The AI never produces a *binding legal decision*; output is consultative.
- **Intended users:** Adults in Bulgaria/EEA who have accepted the Terms.
- **Form of placing on market:** SaaS, embedded in dogovori.net.
- **Hardware:** None; web-based UI.
- **Versions:** Software version tracked in git; AI prompts versioned in `ai_prompts` / `ai_prompt_sections` tables.

## 2. Detailed description (Annex IV §2)
- **Development methodology:** Prompt engineering on top of third-party foundation models (Google Gemini 2.5 family via Lovable AI Gateway). **No fine-tuning, no in-house training.**
- **Design choices:**
  - Three model tiers (`gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro`) routed by `model-router.ts` based on classification result.
  - PII redaction enforced before any third-party call (`_shared/redact.ts`).
  - Special-category data triggers a hard block on long-document operations (`correct-uploaded`, `ocr-contract`).
  - User confirmation step for sensitive operations (`SensitiveDataWarning`).
- **Training data:** Not applicable — no training performed by the provider. Foundation-model training data is documented by Google.
- **Inputs:** user-entered contract text, uploaded PDF/DOCX, structured wizard answers.
- **Outputs:** generated contracts, analyses, corrections, follow-up questions — labelled as AI-generated.
- **Human oversight measures:** Mandatory disclaimer (`AIDisclaimerModal`), per-output AI badge, risk score with manual review prompt, freely editable output, manual lawyer review encouraged for high-risk documents.

## 3. Monitoring, functioning and control (Annex IV §3)
- **Accuracy metrics:** see post-market metrics dashboard (`/admin/ai-post-market`). Tracks fallback rate, blocked rate, redaction rate, special-category blocks.
- **Robustness:** automatic fallback chain in `model-router`; prompt-injection detection (`_shared/redact.test.ts`); rate-limiting (`_shared/rate-limit.ts`).
- **Foreseeable misuse:**
  - Attempts to bypass classification → logged in `restricted_processing_events`.
  - Prompt injection in uploaded text → tested in `prompt-injection.test.ts`.
  - Use for illegal content → blocked + logged.

## 4. Risk management system (Art. 9)
- **Risks identified:**
  1. Hallucinated legal clauses.
  2. PII leakage to third-country providers.
  3. Bias against non-standard scenarios or minority groups.
  4. Over-reliance / automation bias by users.
- **Mitigations:**
  1. Disclaimer + risk meter + manual edit; no "auto-sign" flow without explicit user action.
  2. Redaction before send; EU-only residency toggle (`profiles.allow_third_country_ai`).
  3. Limited domain (BG civil contracts) + transparent assumptions; ROPA documents target groups.
  4. AI disclaimer on every output; lawyer-review CTA on uploads marked high-risk.

## 5. Data and data governance (Art. 10) — N/A
The provider does not train models. Reference data used for prompts is exclusively the user's own input plus public Bulgarian legal templates curated in `template_clauses` (reviewed by qualified jurists).

## 6. Transparency and provision of information to users (Art. 13, Art. 50)
- AI-generated output is labelled in the UI ("AI-generated draft — review before use").
- `/legal/ai-processing-policy` describes purpose, models used, data handling, limitations.
- `/legal/model-routing-policy` describes which model handles which operation.

## 7. Human oversight (Art. 14)
- **Built-in:** mandatory disclaimer acceptance; risk meter; per-clause edit; final download requires explicit user click.
- **External:** users are reminded that the AI does not replace a lawyer. High-risk outputs include a link to qualified Bulgarian lawyers (`/partners`).

## 8. Accuracy, robustness, cybersecurity (Art. 15)
- **Accuracy:** measured via post-market metrics; user feedback channel via support.
- **Robustness:** model fallback, rate-limit, PII guard, EU-only guard.
- **Cybersecurity:** see `docs/SOC2_ISO27001_READINESS.md`, `docs/ACCESS_POLICY.md`, OWASP top-10 review.

## 9. Quality management system (Art. 17)
- Code review on every change.
- Migrations require approval.
- Annual external pen-test (`/admin/pentest`).
- Quarterly restore drill (`/admin/restore-drills`).
- DPO-led annual review of this document.

## 10. Post-market monitoring (Art. 72)
- Daily aggregation of `ai_audit_log` → `ai_post_market_metrics`.
- Monthly DPO review.
- Anomaly alerts (>2σ) trigger investigation.
- User complaints recorded against same table.

## 11. Records (Art. 12 — logging)
- `ai_audit_log`: per-call metadata (user, operation, model, classification flags, status). **No prompt/response content.**
- `restricted_processing_events`: aggregated counts of blocked content categories. No raw text.
- Retention: 12 months for `ai_audit_log`; 24 months for restricted events. Sweeper in `retention-sweeper`.

## 12. Conformity assessment
- This system is **limited-risk** under Art. 50 (generative AI used for content generation). No third-party conformity assessment required.
- Voluntary FRIA maintained in `docs/FRIA.md`.

## 13. EU declaration of conformity (placeholder)
Not required for limited-risk systems. Will be issued only if classification changes to high-risk in a future release.

## 14. Change log
| Date | Change | Author |
|---|---|---|
| 2026-06-25 | Initial version, launch baseline. | DPO |
