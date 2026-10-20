# Dogovori.net — конкретен път за отстраняване на блокерите

Дата: 20.10.2026. Основен проект: 6b2da12e-e1d6-4f97-8549-b632fb66ddd1 / gasathlete/dogovori-net. Изолиран staging: d134f73e-c926-4401-a32b-a648e4ad7a1c. Това е план за техническо изпълнение с проверими условия; не е потвърждение за готов публичен AI/платежен старт.

## Поправено в source

1. Разпознатите измислени служебни лични маркери се преобразуват във видими полета за попълване преди manifest/hash/grant във всички пет пътя за създаване/редакция. Точните маркери от текущия mapping се възстановяват еднократно.
2. Grant от generate/build/apply е обвързан с действителния frontend plain text, а не с техническия flatten.
3. Мониторът сравнява и parser version при решение за нов snapshot.

## Първо: възстановяване на действителната правна база

- В staging се извлича отново САМО вече одобреният официален `eu_op_gdpr_consolidated` през текущия v2 parser. Източникът/правната редакция не се заменят и не се изключва ОРЗД от условните изисквания.
- Новият processing receipt трябва да съдържа действителните checksum, parser version, URL и време. Същият PDF checksum е нормален при нов parser; той не е основание да се пропусне новият receipt. Историческият v1 snapshot се запазва.
- Проверява се съвпадение registry ↔ snapshot ↔ active source/current_version ↔ document checksum/version ↔ 768-dimensional chunks. Верификаторът и coverage gate трябва да дадат налични КТ, ЗЗД, ЗЗЛД, ОРЗД, ГПК за текущия employment пример.
- Едва след това се подготвя promotion пакет за MAIN: само действително проверени официални source записи, истински snapshots/ingestion provenance, текущи документи и съответните части; точни ID/FK/checksum връзки. Сверява се source-owned registry/парсери и схемата в MAIN преди transactional import. Staging тестови профили, квоти, роли, покупки, документи на потребители и тайни не се копират.
- Сега MAIN има 0 snapshots и 0 обвързани current_version; legacy индексирането от юни не покрива строгата verifier политика. Не се маркира изкуствено като fresh и не се изменя датата на стар fetch.

Read-only проверки преди/след migration:
```sql
select count(*) as snapshots from legal_source_snapshots;
select count(*) as bound_versions from legal_sources where current_version is not null;
select short_code, current_version, last_indexed_at
from legal_sources order by short_code;
```

## После: deployment и реална проверка

- Сигурно се създава собствен server-only REVIEW_GRANT_SECRET в MAIN само ако липсва. Не се копира staging secret, не се сменя наличен ключ, стойността не се записва в source/report/chat.
- Внедряват се проверените generate-contract, build-custom-contract, apply-corrections, refine-contract, generate-linked-document и legal-source-monitor с техните shared зависимости. Внедряването на frontend не е доказателство за edge версия.
- Синтетичен тест с минимална отчетена тестова квота: generation 200 → действителен frontend plain text + grant → confirmation при нужда → review 200 → повторение на точния резултат без втори model call/такса. Изменен текст и друг собственик се отказват. Тестовите quota fixtures се отчитат и неизползваните се премахват; enforcement не се изключва.
- Всеки публичен feature се отваря съгласувано в UI и backend едва след положителния му тест. Вече възникналите права/история/refund/delete/export остават достъпни.

## Отделни платежни и подписни условия

| Път | Необходимо доказателство |
|---|---|
| Платени AI продукти | Реално server-side source attestation върху собствен storage файл; TEST paid webhook → доставка/повторение → refund/отказ. Съществуващият binder се проверява; available=false не се сменя само за да изчезне отказът. |
| Готови каталожни файлове | Действителен окончателен файл, точна версия/хеш/произход и съответстваща цена. Не се измисля нов преглед и AI цени не се използват за static файл. |
| Абонамент | Завършен Stripe TEST subscription paid→entitlement→portal/cancel път; досега е доказано само създаване на неплатена session. |
| DTrust Basic SES | Проверена тестова поща, покана → OTP → подпис/отказ → сертификат. Липсата на QES ключ сама по себе си не блокира SES. |
| Build dependency audit | Отделният braces high advisory остава открит; официалният advisory няма patched version. CI проверката не се потиска. |

Целият каталог запазва еднаквия статус „В преработка“ и текста „Проверете внимателно преди подписване“. Това не е автоматична правна/техническа атестация.

Изпълнението на следващи платени Lovable задачи е спряно заради отчетения общ разход около 102.4 при лимит 100. Кодът и проверките са подготовка за последното внедряване; production runtime/DB/флагове не са променени от този runbook.
