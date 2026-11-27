# Vendor Due-Diligence Checklist

**Reference:** GDPR Art. 28, Art. 32  •  **Cadence:** annual per vendor  •  **Owner:** DPO

Used during initial onboarding and annual review of every subprocessor. Findings recorded in `public.vendor_assessments` (admin → /admin/vendors).

## 1. Identification
- [ ] Legal name and address
- [ ] Country of incorporation
- [ ] Role (Processor / Independent Controller / Sub-processor)
- [ ] Service description and data categories processed
- [ ] Region(s) where data is stored

## 2. Legal basis & transfers
- [ ] Signed Data Processing Agreement (DPA) — URL recorded
- [ ] If outside EEA: SCC module (2 controller→processor / 3 processor→processor) executed
- [ ] Transfer Impact Assessment (TIA) completed where required
- [ ] Sub-processor list reviewed for further onward transfers

## 3. Security certifications
- [ ] SOC 2 Type II report obtained (or equivalent)
- [ ] ISO/IEC 27001 certificate (preferred)
- [ ] Penetration-test summary reviewed
- [ ] Incident-response capability documented

## 4. Operational controls
- [ ] Encryption in transit (TLS ≥ 1.2)
- [ ] Encryption at rest (AES-256 or equivalent)
- [ ] Access management / MFA enforcement
- [ ] Audit logging available to controller on request
- [ ] Backup & disaster-recovery RPO/RTO documented

## 5. Privacy controls
- [ ] Data subject request support (deletion, export)
- [ ] Retention configurable
- [ ] Breach-notification SLA ≤ 24 h to controller
- [ ] DPO / privacy contact published

## 6. Business continuity
- [ ] Public status page
- [ ] Uptime SLA ≥ 99.9 %
- [ ] Financial stability (revenue, funding) reasonable for our reliance

## 7. Risk rating
| Factor | Weight | Score (1–5) |
|---|---|---|
| Sensitivity of data shared | 0.30 | |
| Region of processing | 0.15 | |
| Certification level | 0.20 | |
| Incident history | 0.15 | |
| Replaceability | 0.20 | |

**Risk class:** Low (≤ 1.8) / Medium (1.8 – 3.2) / High (> 3.2)

## 8. Decision
- [ ] Approved
- [ ] Approved with conditions (list)
- [ ] Rejected (reason)

Reviewer signature: __________  Date: __________  Next review: __________
