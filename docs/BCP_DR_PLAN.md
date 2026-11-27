# Business Continuity & Disaster Recovery Plan

**Owner:** Owner + DPO  •  **Version:** 2026-09-01  •  **Review:** every 6 months  •  **Drill log:** `/admin/restore-drills` (`tabletop_exercise = true` for tabletop scenarios)

## Objectives
- **RTO** (Recovery Time Objective): 4 hours for the customer-facing site, 24 hours for admin tooling.
- **RPO** (Recovery Point Objective): 24 hours (Supabase managed daily backups + PITR window).

## Critical components
| Component | Provider | Failure impact | Mitigation |
|---|---|---|---|
| App hosting | Lovable | Site unavailable | Static cache + status page; failover to Vercel preview if extended outage. |
| Database / Auth / Storage | Lovable Cloud (Supabase) | Total outage | Daily backups + PITR; restore drill quarterly. |
| AI Gateway | Lovable AI | AI features down | Graceful degradation: non-AI flows continue; banner shown. |
| Payments | Stripe | New purchases blocked | Customers can retry; subscriptions auto-recover. |
| Email | Resend | No transactional email | Queue in `email_send_state`; replay on recovery. |
| DNS / CDN | Cloudflare | Site unreachable | Secondary DNS (Cloudflare Registrar built-in redundancy). |

## Runbooks

### A. Database loss / corruption
1. Page Owner.
2. Identify last good PITR window.
3. Restore via Supabase dashboard → new project.
4. Update `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`; redeploy edge functions.
5. Verify with smoke tests (login, generate, download).
6. Log in `restore_drills` (`success_status`, runbook deviations).

### B. Lovable / hosting outage
1. Confirm via status page.
2. Communicate via Twitter/X + status banner.
3. Wait or trigger preview redeploy if >2h.

### C. Stripe outage
1. Disable checkout banner (read-only mode).
2. Stripe self-recovers; webhook backfill handles missed events.

### D. AI Gateway outage
1. Detect via increased 5xx in `ai_audit_log`.
2. Disable AI CTAs platform-wide (feature flag).
3. Non-AI features (templates, signing, downloads) remain functional.

## Tabletop schedule
- **2026-Q3** Database loss scenario.
- **2026-Q4** AI Gateway 24h outage.
- **2027-Q1** Stripe payment outage.
- **2027-Q2** Coordinated DNS hijack scenario.

Recorded in `restore_drills` with `tabletop_exercise = true` and `scenario` populated.
