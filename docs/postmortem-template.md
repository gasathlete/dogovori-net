# Post-mortem — {{ Incident title }}

- **Date / time (UTC):** {{ YYYY-MM-DD HH:MM }}
- **Duration:** {{ minutes }}
- **Severity:** SEV-{1|2|3|4}
- **Author:** {{ name }}
- **Status:** draft | in-review | published

## Summary
One paragraph: what happened, customer impact, root cause in plain language.

## Impact
- Users affected: {{ count / % }}
- Operations affected: {{ analyze | upload | signing | billing | ... }}
- Data integrity issues: {{ yes/no — details }}
- Data breach (GDPR Art. 33)? {{ yes/no — if yes, link to notification }}

## Timeline (UTC)
- HH:MM — first alert / customer report
- HH:MM — investigation started
- HH:MM — root cause identified
- HH:MM — fix deployed
- HH:MM — fully resolved

## Root cause
Technical explanation. Link to commit/PR/migration that introduced the issue.

## Detection
How did we find out? Was monitoring sufficient?

## Resolution
What action stopped the bleeding? Link to PR / config change.

## What went well
- ...

## What went poorly
- ...

## Action items
| ID | Action | Owner | Severity | Due |
|----|--------|-------|----------|-----|
| 1  |        |       | P1/P2/P3 | YYYY-MM-DD |

## Lessons learned
Patterns to apply elsewhere. Update runbooks / `docs/SOC2_ISO27001_READINESS.md` if controls were insufficient.
