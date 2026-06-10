# Project Memory

## Core
Currency is EUR only. BGN/лв/lev no longer used anywhere — pricing, UI copy, Stripe products, scenarios, invoices, exports.
Pricing (current 4-tier): Free (5 ops on signup + 2/mo). Професионалист 12.90 €/mo (50 ops/mo). Предприемач 19.90 €/mo (120 ops/mo, GPT-5, Premium 24/7 support). Екип 109 €/seat/year (min 3 seats = 327 €/yr, 100 ops/seat/mo). One-off pack 2.90 € for 5 ops. VAT 20% inclusive. Old names Pro/Team and old prices (9.90, 7.90, 23.70, 10.90 seat/mo, 1.90 one-off) and the old "Предприемач 12.90 €/100 ops" tariff are deprecated — never use them.
Operation metering: 1 op = (download contract) | (download template) | (upload+analyze incl. auto-corrections wave). Same (session_id, doc_key) reused in tab = free. Each new corrections wave (new batch_id) = 1 op.
