## Цел

Всички имейл адреси, показвани на потребителите в сайта (contact, dpo, billing), да сочат към реалния ти имейл `imdevelopmentoffice@gmail.com`, за да получаваш съобщенията директно там.

## Промени

Ще заменя следните адреси във frontend кода:

| Файл | Текущ адрес | Нов адрес |
|---|---|---|
| `src/components/Footer.tsx` | `contact@dogovori.net` | `imdevelopmentoffice@gmail.com` |
| `src/components/SeoFooter.tsx` | `contact@dogovori.net` | `imdevelopmentoffice@gmail.com` |
| `src/pages/legal/Terms.tsx` | `contact@dogovori.net` | `imdevelopmentoffice@gmail.com` |
| `src/pages/legal/Privacy.tsx` | `dpo@dogovori.net` | `imdevelopmentoffice@gmail.com` |
| `src/pages/legal/Refund.tsx` | `billing@dogovori.net` | `imdevelopmentoffice@gmail.com` |

Всички `mailto:` линкове също ще бъдат обновени, така че кликването да отваря имейл клиента с правилния адрес.

## Бележки

- Това е чисто текстова промяна в UI — не пипа backend, edge functions или транзакционни имейли (welcome, payment receipt и т.н.), които вече се изпращат от `notify@notify.dogovori.net`.
- Ако по-късно искаш всеки от тях да сочи към различен адрес (напр. `billing@` към друг имейл), мога лесно да ги разделя.
- Алтернатива (по-професионално изглеждащо за потребителите): да оставим адресите като `contact@dogovori.net` и да настроиш forwarding в твоя домейн доставчик към Gmail-а ти. Това обаче е извън Lovable — става при регистратора на домейна.
