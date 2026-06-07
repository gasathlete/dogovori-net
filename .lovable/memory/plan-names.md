---
name: Plan display names (BG)
description: Bulgarian user-facing names for the subscription plans
type: preference
---
Plan display names in BG UI:
- Free → "Безплатен"
- Pro → "Предприемач"
- Team → "Екип"

Apply everywhere user-facing: pricing pages, /account subscription tab, ProUpgradeDialog, CTA copy, Stripe product display names, emails. Never show raw "Pro" or "Team" to users.
Code keys (plan === "pro", Stripe lookup_keys like pro_monthly, pro_yearly, team_monthly, team_yearly) stay unchanged.
