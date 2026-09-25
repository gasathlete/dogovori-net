# Предварителен режим — Gate 9 и Gate 10 (source-only)

Статус: **NOT_READY**. Gate 7 остава отворен. Нито една проверка по-долу не е проведена; всички са **NOT RUN**, докато няма запис с дата, среда и доказателство.

## Какво е затворено в кода (клиентска преграда)
| Действие | Къде спира | Сървърен bypass |
|---|---|---|
| Ново съобщение до DogovaryAI (вкл. абонати) | `AssistantChat.sendMessage` преди мрежа | `assistant-chat` е пряко достъпен |
| Прикачване на файл в чата | `handleFiles` — файлът не се чете | няма |
| Нов абонамент / топъп | `StripeEmbeddedCheckout` не монтира Stripe | `create-checkout` пряко достъпен |
| Строго отключване | `StrictDocumentPaywall.startUnlock` | `create-strict-unlock-checkout` пряко достъпен |
| Еднократни продукти | `ONE_TIME_PURCHASES_AVAILABLE=false` + заявка | сървърен флаг OFF |

Остават отворени: публично SEO съдържание, вход/регистрация, история и запазени резултати, портал за абонамент, export/delete, unsubscribe, webhook реверси.

## Gate 9 — аналитика (source)
- Събития: `prelaunch_waitlist_opened` (веднъж на функция+източник за таб), `product_intent` (веднъж на продукт), `prelaunch_waitlist_succeeded` (само при RPC `true`, веднъж), `prelaunch_waitlist_failed` (`reason`: invalid|unavailable).
- Свойства само от allowlist; без имейл, текст, имена на файлове, query-string, платежни токени. Consent-gated през `trackFunnelEvent`.
- Приход/изпълнение: само от проверен Stripe webhook в backend. `checkout_completed` се отчита едва след `confirmPaid`.
- Маршрут след вход: премахват се имейл, текст, файлови имена, платежни/сесийни тайни, стойности с `@` или над 200 знака; външни адреси се отхвърлят.

## Зависимости преди live (blockers)
1. Прилагане на миграцията за заявката (`docs/migrations/stage_prelaunch_waitlist.sql`) — сега липсващ backend = честна грешка.
2. Правно одобрение: контролер, текст на съгласието, срок за съхранение.
3. Сървърни флагове за `assistant-chat`, `create-checkout`, `create-strict-unlock-checkout`.
4. DPA с EU AI доставчик (Azure в provisioning), AI Act прозрачност.
5. Приложени миграции 0039–0044 и pgTAP.

## Gate 10 — синтетична test-mode поръчка (всички NOT RUN)
- [ ] Sandbox покупка `contract_check` 2,99 € → точно едно право след webhook.
- [ ] Отказ в Stripe → няма право, няма обработка, честно съобщение.
- [ ] Повторен опит след грешка → една сесия, без двойно таксуване.
- [ ] Дублиран webhook (replay) → без второ право/изпълнение.
- [ ] Реверс/refund → правото се отбелязва, резултатът не се изтрива без основание.
- [ ] Export на резултата — от сървъра, само за собственика.
- [ ] export-my-data и delete-account работят за купувач.
- [ ] Ограничено включване: флаг за един продукт, малка група, наблюдение 48 ч.
- [ ] Rollback: флаг OFF → нови покупки спират, съществуващите права и резултати остават.
- [ ] Мобилна и desktop проверка на целия път.
