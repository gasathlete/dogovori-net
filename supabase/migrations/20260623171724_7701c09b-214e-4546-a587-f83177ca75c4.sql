UPDATE public.legal_versions
SET version = '2026-09-01',
    effective_at = '2026-09-01'
WHERE version = '2026-06-25';

UPDATE public.compliance_items
SET due_date = '2026-09-01'
WHERE due_date = '2026-06-25';

UPDATE public.compliance_items
SET due_date = '2026-12-01'
WHERE due_date = '2026-09-25';
