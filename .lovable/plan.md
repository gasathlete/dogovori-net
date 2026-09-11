# Product rollout preparation review

## Цел
Да се превърне наличната продуктова верига 0018–0025 в доказуем, network-silent и fail-closed rollout пакет, без изпълнение на миграции, deploy, плащания, live AI, feature flags или промени по клиентски данни.

## Какво ще се промени
1. **Каноничен migration manifest и одит**
   - Добавяне на машинно четим manifest за 0018–0025: точен ред, SHA-256, огледален docs файл, предназначение, зависимости, очаквани обекти, проверки и rollback/forward-fix бележка.
   - Запазване на byte-identical SQL двойките. SQL се коригира само ако одитът докаже реален source дефект; защитените файлове не се преформатират.
   - Документиране на transaction/lock/partial-application, existing-data, RLS/grants, `SECURITY DEFINER`/`search_path`, FK/unique/idempotency и необратими промени.

2. **Един rollout contract**
   - Добавяне на source-only декларация с allowlist само на имената на env/secrets, трите точни продукта, EUR/one-time/inclusive VAT, sandbox/live разделение, flags OFF-by-default и последна необходима migration capability 0025.
   - Автоматични parity проверки срещу frontend конфигурацията, backend purchase allowlist, checkout/webhook/entitlement договорите и prerender/structured-data изхода.
   - Потвърждение, че fulfilment-off блокира нов checkout, но не променя вече платено право.

3. **Network-silent executable preflight**
   - Един package command, който не чете и не отпечатва secret values и завършва non-zero при migration drift/order/hash mismatch, липсваща декларация/зависимост/rollback note, unsafe flag default, грешен product/price/currency/environment/tax contract, непълна schema capability или demo/fixture fallback в paid path.
   - Preflight-ът ще проверява само файлове и чисти функции; няма външни заявки или backend достъп.

4. **Операторски runbook**
   - Актуализиране на `PRODUCT_INTEGRATION_ROLLOUT.md` за пълната верига 0018–0025.
   - Ясна последователност: backup/read-only checks → migrations → read-only verification → functions → frontend с flags OFF → sandbox no-charge smoke → отделни човешки approvals → контролирано включване → наблюдение → stop/forward-fix.
   - Без измислен rollback за необратими данни; използване на expand/contract или forward-fix, когато е приложимо.

5. **Фокусирани отрицателни тестове и проверки**
   - Missing env/flag declaration, невалидна стойност на flag, wrong environment, product ID/price/currency/tax mismatch, partial schema/0025 capability, migration order/hash drift, duplicate webhook/entitlement, fulfilment disabled и fixture leakage.
   - Изпълнение само на релевантните Vitest и Deno/shared тестове, preflight, typecheck, lint на докоснатото и network-silent production build.

## Технически ограничения
- Никакви SQL/миграции няма да се изпълняват; няма deploy, publish, Stripe checkout/charge, live AI, email или customer mutation.
- Публични цени, копи, дизайн, CTA и поправеният user counter остават непроменени, освен ако parity тест докаже конкретен дефект.
- Съществуващите payment/result/refinement/auth/quota договори остават защитени.
- Финалният отчет ще посочи началния и крайния HEAD, поправени и оставащи blockers, всички файлове и точните изпълнени команди.
