# Project Memory

## Core
Currency is EUR only. BGN/лв/lev no longer used anywhere — pricing, UI copy, Stripe products, scenarios, invoices, exports.
Pricing: Pro 12.90 €/mo (100 ops/mo), Pro yearly 129 € (≈ 10.75 €/mo). Team 10.90 €/seat/mo (min 3 seats = 32.70 €/mo), Team yearly 109 €/seat (min 3 = 327 €/yr). One-off pack 2.90 € for 5 ops. VAT 20% inclusive.
Promo code FIRST100: 30% off monthly subs, 40% off yearly subs (extra 10% for annual). Recurring only — never applies to five_operations/single_contract. Unlimited redemptions, all customers. Stripe coupons `first100_monthly` + `first100_yearly` behind one public code `FIRST100`.
Operation metering: 1 op = (download contract) | (download template) | (upload+analyze incl. auto-corrections wave). Same (session_id, doc_key) reused in tab = free. Each new corrections wave (new batch_id) = 1 op.
