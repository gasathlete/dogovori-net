# Information Security Policy — Dogovori.net

**ISO 27001:2022 A.5.1**  •  **Owner:** CTO + DPO  •  **Version:** 2026-09-01  •  **Review:** annually (or on material change)

## 1. Purpose
Establish direction and support for information security across Dogovori.net in accordance with business requirements and applicable laws (GDPR, ЗЗЛД, AI Act, ЗЕТ, ЗЗП, ЗЕДЕУУ).

## 2. Scope
All information assets (source code, customer data, secrets, backups, documentation), all personnel (employees, contractors, staff with `is_staff` role), and all environments (Lovable Cloud, Supabase, Stripe, Google AI Gateway, Resend, GitHub).

## 3. Principles
1. **Confidentiality, Integrity, Availability (CIA)** are protected by design and by default.
2. **Least privilege** and **separation of duties** for every access grant.
3. **Defense in depth** — network, application, data, identity, and monitoring layers.
4. **Privacy by design** — PII redaction before AI; RLS on every user-facing table.
5. **Accountability** — every privileged action is logged in `audit_log` / `ai_audit_log`.
6. **Continuous improvement** — findings from pentests, restore drills, and access reviews are tracked in `compliance_items`.

## 4. Roles
| Role | Responsibility |
|---|---|
| Owner | Ultimate accountability, budget, approval of exceptions. |
| CTO | Technical controls, secure SDLC, infra hardening, incident lead. |
| DPO | GDPR/AI Act compliance, DPIA/FRIA, subject rights, breach notification. |
| HR | Onboarding/offboarding, NDA, security awareness training. |
| Staff (`is_staff`) | Follow all policies; report incidents within 1 h of detection. |

## 5. Control catalogue (mapped to Annex A 2022)
Implemented and evidenced in the `compliance_items` table and `/admin/compliance` dashboard. See sibling docs: `ACCESS_POLICY.md`, `BCP_DR_PLAN.md`, `BREACH_PLAYBOOK.md`, `SOC2_ISO27001_READINESS.md`, `VENDOR_DD_CHECKLIST.md`.

## 6. Policy exceptions
Any deviation requires written Owner approval, a compensating control, and a review date. Recorded in `compliance_items` with control ref `EXCEPTION_*`.

## 7. Non-compliance
Failure to follow this policy may result in loss of access, disciplinary action, or termination for employees/contractors; and account suspension for external users under the Terms.

## 8. Review
Reviewed at least annually by the CTO and DPO, and after any of: major incident, regulatory change, or significant architecture change. Version and reviewer recorded in `compliance_items` (control `A.5.1`).
