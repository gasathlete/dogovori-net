# Acceptable Use Policy

**ISO 27001:2022 A.5.10**  •  **Owner:** HR + CTO  •  **Version:** 2026-09-01  •  **Applies to:** all employees, contractors, and staff with any access to Dogovori.net systems, data, or brand assets.

## 1. General principles
- Use company systems and data only for authorized business purposes.
- Do not attempt to bypass security controls (MFA, RLS, rate limits, PII redaction).
- Do not store production data on personal devices, personal cloud accounts, or removable media.
- Report suspected incidents to `security@` within 1 hour of detection.

## 2. Devices
- Only up-to-date devices with full-disk encryption, screen-lock ≤ 5 min, and current OS security patches.
- Personal devices (BYOD) allowed only for email/chat; no direct access to production DB/CLI from BYOD.
- Lost/stolen devices → immediate report; remote-wipe when possible; credentials rotated within 24 h.

## 3. Credentials & secrets
- Unique passwords ≥ 14 characters stored in an approved password manager. No reuse across systems.
- MFA required for every admin/staff account (TOTP or WebAuthn).
- API keys and secrets live in Lovable secrets / Supabase Vault only — never in code, `.env`, chat, or screenshots.
- Rotate on change of role, on suspicion of leak, and at least once every 12 months.

## 4. Data handling
- Handle production data only in approved systems; no dumps to spreadsheets or local files.
- No processing of special categories (GDPR Art. 9) outside sanctioned workflows.
- Follow retention: minimum needed for the purpose, then delete.
- PII redaction is mandatory before pasting user content into any AI tool that is not part of the approved pipeline.

## 5. Communication & AI tools
- Use only approved communication tools for internal secrets/PII discussions.
- Do not paste customer content into public AI chatbots. The internal AI Gateway (`LOVABLE_API_KEY`) is the only sanctioned route.
- Public communications and marketing must not include real customer data.

## 6. Software & third-party services
- Install only software from official sources. New third-party services touching customer data require vendor DD (`docs/VENDOR_DD_CHECKLIST.md`) and DPO approval.
- Browser extensions on work devices are restricted to a vetted list.

## 7. Prohibited activity
- Sharing accounts, borrowing MFA codes, or working from unattended shared terminals.
- Circumventing logging, auditing, or monitoring.
- Any illegal activity, harassment, or content that violates the Terms.

## 8. Enforcement
Violations may lead to loss of access, disciplinary action or termination. Serious violations are also treated as security incidents under `BREACH_PLAYBOOK.md`.

## 9. Acknowledgement
Signed at onboarding and re-acknowledged annually; evidence stored in `staff_training` (module `AUP`).
