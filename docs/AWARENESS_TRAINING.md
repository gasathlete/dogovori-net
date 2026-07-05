# Security Awareness Training Program

**ISO 27001:2022 A.6.3**  •  **Owner:** HR + DPO  •  **Version:** 2026-09-01  •  **Frequency:** onboarding + annual refresher + ad-hoc after material incidents

## 1. Audience
All employees, contractors, and staff with `is_staff` role or access to any production system, secret, or PII.

## 2. Curriculum
| Module | Topics | Duration |
|---|---|---|
| M1. Foundations | CIA triad, threat landscape for SaaS, why security matters at Dogovori.net | 30 min |
| M2. Data protection & GDPR | Lawful basis, subject rights, PII vs special categories, minimization, retention | 45 min |
| M3. Phishing & social engineering | Recognising phishing, MFA, safe email handling, reporting suspicious messages | 30 min |
| M4. Secure development | OWASP Top 10, SQL injection & RLS, secrets in code, code review, dependency updates | 60 min |
| M5. Incident response | Detection, containment, evidence preservation, KZLD 72-h notification, playbook walkthrough | 30 min |
| M6. AI-specific risks | Prompt injection, PII leakage, model routing, AI Act obligations | 30 min |
| M7. Access & credentials | MFA setup, password manager, least privilege, offboarding SLA | 20 min |

Total onboarding: ~4 hours. Annual refresher: ~2 hours (subset + updates).

## 3. Delivery
- Self-paced material (docs + short video) + short quiz (>=80 % pass mark).
- Signed acknowledgement recorded in `staff_training` (`user_id`, `module`, `completed_at`, `score`).
- Failed quiz → retake within 7 days; blocking access if not passed.

## 4. Ad-hoc drills
- Simulated phishing every 6 months (via HR); results anonymised and aggregated.
- Tabletop incident exercise annually with the on-call team.

## 5. Metrics
- % staff current on annual refresher (target 100 %).
- Phishing simulation click-rate (target < 5 %).
- Time from staff onboarding to full training completion (target ≤ 14 days).
Metrics reviewed quarterly and reported to the Owner.

## 6. Records
Evidence stored in `staff_training` table; aggregate report exported yearly for `compliance_items` control `A.6.3`.
