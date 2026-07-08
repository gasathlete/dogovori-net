UPDATE public.plans SET ops_cap_monthly = 100 WHERE id = 'entrepreneur';

UPDATE public.plan_features SET feature = '100 операции / месец'
WHERE plan_id = 'entrepreneur' AND feature = '120 операции / месец';

UPDATE public.plan_comparison_rows
SET entrepreneur_value = '100'
WHERE label = 'Операции / месец' AND entrepreneur_value = '120';