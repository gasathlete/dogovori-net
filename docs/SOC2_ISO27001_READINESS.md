# SOC 2 / ISO 27001 Readiness Checklist — Dogovori.net

> Internal working document. Tracks the current state of organizational
> and technical controls relevant to SOC 2 Type II and ISO/IEC 27001.
> Updated alongside the GDPR/AI Act compliance plan.

Last updated: 2026-06-10

## Legend

- ✅ Implemented (evidence in repo / backend)
- 🟡 Partially implemented — needs documentation or expansion
- ⬜ Not yet implemented

---

## 1. Security (SOC 2 CC) / ISO A.5 — Information Security Policies

| Control | Status | Evidence / Notes |
|---|---|---|
| Written security policy | 🟡 | `src/pages/legal/IncidentResponse.tsx`, DPIA. Need a top-level "Information Security Policy" doc. |
| Annual policy review | ⬜ | Add yearly calendar reminder. |
| Acceptable Use Policy for staff | ⬜ | Draft pending. |

## 2. Access Control / ISO A.9

| Control | Status | Evidence |
|---|---|---|
| Role-based access (admin/moderator/user) | ✅ | `public.user_roles` + `has_role()` / `is_staff()` RPCs. |
| MFA on admin accounts | 🟡 | Supabase supports TOTP; enforce for `admin` role via Auth settings. |
| Least-privilege RLS on all tables | ✅ | Every public table has policies + grants. |
| Service role usage limited to edge functions | ✅ | No service key in client bundle. |
| Periodic access review (quarterly) | ⬜ | Track in `/admin/privacy`. |

## 3. Cryptography / ISO A.10

| Control | Status | Evidence |
|---|---|---|
| TLS 1.2+ everywhere | ✅ | Enforced by Supabase + Lovable hosting. |
| At-rest encryption (DB, storage) | ✅ | Managed by Supabase (AES-256). |
| Signed URLs with short TTL for downloads | ✅ | `download-document` edge function. |
| Secrets in Vault, not in repo | ✅ | `.env` only holds publishable keys; secrets via Lovable Cloud. |

## 4. Operations Security / ISO A.12

| Control | Status | Evidence |
|---|---|---|
| Centralized logging (edge + DB) | ✅ | Supabase analytics + `ai_audit_log`. |
| No PII in logs | ✅ | Verified by `prompt-injection.test.ts` + `redact.test.ts`. |
| Capacity monitoring | 🟡 | Lovable dashboard; no formal SLO doc. |
| Vulnerability scanning | ✅ | GitHub Actions: `security-scan.yml`, `security-scan-scheduled.yml`. |
| Patch management (deps) | ✅ | Dependabot + `bun update` cadence. |
| Backup & restore tested | 🟡 | Supabase PITR enabled; restore drill not documented. |

## 5. Communications Security / ISO A.13

| Control | Status | Evidence |
|---|---|---|
| Network segmentation | ✅ | Supabase VPC + RLS isolation. |
| Email DKIM/SPF/DMARC | ✅ | Resend domain config; see `email_domain` skill output. |
| CSP / security headers | ✅ | `index.html` + Vite headers + Cloudflare. |

## 6. System Acquisition & Development / ISO A.14

| Control | Status | Evidence |
|---|---|---|
| Secure SDLC (code review, CI tests) | ✅ | `.github/workflows/tests.yml`. |
| Dependency review | ✅ | `code--dependency_scan` + Dependabot. |
| Separation of envs (sandbox/live) | ✅ | `environment` column on `teams`/`subscriptions`. |
| Pen-test (annual) | ⬜ | Planned Q3 2026. |

## 7. Supplier Relationships / ISO A.15

| Control | Status | Evidence |
|---|---|---|
| Subprocessor register | ✅ | `src/pages/legal/SubprocessorRegister.tsx`. |
| DPAs with each subprocessor | ✅ | Lovable, Supabase, Stripe, Resend, Google Gemini. |
| Subprocessor change notifications | ✅ | Documented in `DPA.tsx`. |

## 8. Incident Management / ISO A.16

| Control | Status | Evidence |
|---|---|---|
| Incident response plan | ✅ | `src/pages/legal/IncidentResponse.tsx`. |
| Breach notification < 72h | ✅ | Documented in Privacy + DPA. |
| Illegal-content moderation queue | ✅ | `/admin/privacy/illegal`. |
| Post-mortem template | ⬜ | Add `docs/postmortem-template.md`. |

## 9. Business Continuity / ISO A.17

| Control | Status | Evidence |
|---|---|---|
| RTO/RPO defined | 🟡 | Supabase PITR ≤ 5 min; document publicly. |
| Failover tested | ⬜ | Planned. |

## 10. Compliance / ISO A.18

| Control | Status | Evidence |
|---|---|---|
| GDPR ROPA | ✅ | `src/pages/legal/ROPA.tsx`. |
| DPIA | ✅ | `/mnt/documents/DPIA_dogovori_net.docx`. |
| AI Act transparency | ✅ | `AIProcessingPolicy.tsx`, `ModelRoutingPolicy.tsx`. |
| Data subject rights (export/erase) | ✅ | `export-my-data` + `delete-account` edge functions. |
| Retention policy + automation | ✅ | `RetentionPolicy.tsx` + `retention-sweeper` edge function. |

---

## Gap summary (prioritized)

1. **Information Security Policy** — write top-level policy doc (P2).
2. **MFA enforcement for admin role** — Supabase Auth setting + UI prompt (P2).
3. **Quarterly access review** — add admin dashboard widget (P2).
4. **Backup restore drill** — schedule + document (P2).
5. **Annual pen-test** — vendor selection (P3).
6. **Post-mortem template** — markdown skeleton (P2 quick win).
7. **RTO/RPO public statement** — add to `IncidentResponse.tsx`.

## Audit evidence index

- `supabase/migrations/*` — DDL history with RLS/grants per table.
- `supabase/functions/_shared/{classify,redact,model-router,ai-call}.ts` — PII/AI controls.
- `supabase/functions/_shared/*.test.ts` — automated control tests.
- `src/pages/legal/*` — public-facing policies (Privacy, DPA, ROPA, Retention, AI Processing, Model Routing, Subprocessors, Incident Response).
- `src/pages/AdminPrivacy.tsx` + `AdminIllegalContent.tsx` — operational monitoring.
- `.github/workflows/security-scan*.yml` — recurring vulnerability scanning.
