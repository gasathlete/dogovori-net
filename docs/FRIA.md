# Fundamental Rights Impact Assessment (FRIA)

**Reference:** AI Act Art. 27 (voluntary for limited-risk systems)  •  **System:** Dogovori.net  •  **Version:** 2026-06-25  •  **Owner:** DPO  •  **Review:** annual

## 1. Scope of the assessment
Dogovori.net provides AI-assisted drafting and analysis of Bulgarian civil-law contracts. Although classified as **limited risk** (Art. 50), the platform processes personal data of identifiable individuals and may affect their access to legal services. A voluntary FRIA is maintained.

## 2. Description of use
- Users input text or upload contracts.
- The platform classifies the input, redacts PII, and calls a foundation model via Lovable AI Gateway.
- Output: drafts, analyses, corrections, follow-up questions.
- No automated legal decision is taken. The user always remains the decision-maker.

## 3. Categories of affected persons
- **Consumers** drafting/analysing personal contracts (rent, NDA, services).
- **SMEs and self-employed** drafting commercial agreements.
- **Counterparties** named in uploaded contracts (third-party data subjects whose data appears in documents).

## 4. Risks to fundamental rights

| Right | Risk | Likelihood | Severity |
|---|---|---|---|
| Privacy & data protection (Art. 7, 8 CFR) | PII leakage to third-country AI | low | high |
| Non-discrimination (Art. 21 CFR) | Bias against non-standard scenarios, minority languages, atypical family structures | low | medium |
| Access to justice / effective remedy (Art. 47 CFR) | Over-reliance on AI without lawyer review | medium | high |
| Consumer protection (Art. 38 CFR) | Misleading legal certainty | medium | medium |
| Right to good administration (Art. 41 CFR) | Opaque AI output without explanation | low | medium |

## 5. Mitigations

### 5.1 Privacy & data protection
- Mandatory PII redaction before AI call (`_shared/redact.ts`).
- Special-category data triggers hard block on long-document operations.
- EU-only AI residency toggle for users with elevated needs (`profiles.allow_third_country_ai = false`).
- Retention: 7-day raw text retention; 90 days redacted summary; 12 months audit metadata.

### 5.2 Non-discrimination
- Only Bulgarian language supported initially → reduces inadvertent bias against unsupported languages by *not* serving them.
- Wizard graphs reviewed by qualified jurists for inclusivity (e.g., civil partnerships).
- User feedback channel monitored for systemic bias signals.

### 5.3 Access to justice
- Every output carries an AI disclaimer.
- Risk meter highlights high-risk clauses.
- Direct link to qualified Bulgarian lawyers (`/partners`) on every high-risk output.
- No "auto-sign" path; downloads require explicit user action.
- E-signature flow forces SES legal-equivalence acknowledgement (ZEDEUU Art. 13).

### 5.4 Consumer protection
- Removed absolute claims ("100% legal compliance") from marketing.
- Pricing displayed VAT-inclusive in EUR.
- Right of withdrawal honoured per ZZP; `order_snapshots` table preserves the exact terms accepted at purchase.

### 5.5 Right to explanation
- `/legal/model-routing-policy` discloses which model handles which operation.
- `/legal/ai-processing-policy` describes data flow.
- Users can export full personal data (Art. 15 GDPR) from Account → Settings.

## 6. Residual risk
After mitigations, residual risk is **acceptable** for a limited-risk system targeting an adult audience that has accepted explicit AI disclaimers. The dominant residual risk is automation bias by individual users, which is addressed through repeated UI nudges toward human review.

## 7. Monitoring
- Monthly review of post-market metrics (Art. 72).
- Quarterly review of user complaints categorised by affected right.
- Annual FRIA refresh, or upon material change to AI pipeline.

## 8. Stakeholder consultation
- Pre-launch: external legal review (memorandum on file).
- Post-launch: quarterly review with DPO; ad-hoc input from partner lawyers.

## 9. Sign-off
| Date | Reviewer | Outcome |
|---|---|---|
| 2026-06-25 | DPO + Owner | Approved for launch. |
