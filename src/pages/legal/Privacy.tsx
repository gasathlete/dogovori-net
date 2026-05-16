import { LegalLayout } from "./LegalLayout";

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Политика за поверителност"
      description="Как Dogovori.net обработва личните Ви данни в съответствие с GDPR, ЗЗЛД и решенията на КЗЛД."
    >
      <h2>1. Администратор на лични данни</h2>
      <ul>
        <li><strong>„Иванов и Милев Пропърти Девелъпмент" ЕООД</strong></li>
        <li>ЕИК: 206957326</li>
        <li>Адрес: гр. София, ж.к. Стрелбище, бул. България №13, ет. 1, магазин 4</li>
        <li>Email: <a href="mailto:imdevelopmentoffice@gmail.com">imdevelopmentoffice@gmail.com</a></li>
      </ul>
      <p>
        Дружеството е администратор по смисъла на Регламент (ЕС) 2016/679 (GDPR) и
        Закона за защита на личните данни (ЗЗЛД).
      </p>

      <h3>1.1. Длъжностно лице по защита на данните (DPO)</h3>
      <p>
        Към момента не сме задължени да назначим DPO по чл. 37 GDPR (не отговаряме
        на критериите за мащабна обработка на специални категории данни или системно
        наблюдение). За въпроси по защита на личните данни ползвайте email-а по-горе.
      </p>

      <h2>2. Какви данни събираме и на какво основание</h2>
      <table className="my-4 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-left">
            <th className="py-2 pr-3">Категория</th>
            <th className="py-2 pr-3">Данни</th>
            <th className="py-2">Правно основание</th>
          </tr>
        </thead>
        <tbody className="text-foreground/80">
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Регистрация</td>
            <td className="py-2 pr-3 align-top">email, име, парола (хеширана), потвърждение на пълнолетие</td>
            <td className="py-2 align-top">Чл. 6, ал. 1, б. „б" GDPR — изпълнение на договор</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Профил</td>
            <td className="py-2 pr-3 align-top">фирма, ЕИК, ДДС №, адрес, подпис</td>
            <td className="py-2 align-top">Чл. 6, ал. 1, б. „б" — за фактуриране и подписване</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Договорни</td>
            <td className="py-2 pr-3 align-top">данни на контрагенти, съдържание на генерирани документи</td>
            <td className="py-2 align-top">Чл. 6, ал. 1, б. „б" — Вие сте администратор за тези данни, ние сме процесор (вижте <a href="/dpa">DPA</a>)</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Плащания</td>
            <td className="py-2 pr-3 align-top">сумa, метод (без данни на карта), Stripe ID</td>
            <td className="py-2 align-top">Чл. 6, ал. 1, б. „в" — законово задължение (счетоводство)</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Технически</td>
            <td className="py-2 pr-3 align-top">IP (хеширан), браузър, log записи</td>
            <td className="py-2 align-top">Чл. 6, ал. 1, б. „е" — легитимен интерес (сигурност, rate limiting)</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Маркетинг</td>
            <td className="py-2 pr-3 align-top">email, име, предпочитания</td>
            <td className="py-2 align-top">Чл. 6, ал. 1, б. „а" — изрично съгласие, оттегляемо по всяко време</td>
          </tr>
          <tr>
            <td className="py-2 pr-3 align-top">Съгласия</td>
            <td className="py-2 pr-3 align-top">тип, версия, дата, IP хеш, UA</td>
            <td className="py-2 align-top">Чл. 7, ал. 1 — доказване на съгласие</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Получатели и подпроцесори</h2>
      <p>
        Споделяме данни с следните доставчици, които действат като обработващи (чл. 28
        GDPR):
      </p>
      <ul>
        <li><strong>Supabase Inc.</strong> — хостинг на база данни и автентикация. Сървъри в ЕС (Франкфурт, Германия).</li>
        <li><strong>Stripe Payments Europe Ltd.</strong> (Ирландия) — обработка на плащания. Подлежи на Data Privacy Framework за трансфер към САЩ.</li>
        <li><strong>Google LLC</strong> (САЩ) — AI генериране и анализ. Трансфери на база <a href="https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/standard-contractual-clauses-scc_en" target="_blank" rel="noopener">Стандартни договорни клаузи (SCC)</a> + Data Privacy Framework.</li>
        <li><strong>Resend Inc.</strong> (САЩ) — изпращане на транзакционен email. SCC + DPF.</li>
        <li><strong>Plausible Insights OÜ</strong> (Естония, ЕС) — анонимизирана аналитика (без бисквитки и без лични данни) — само при дадено съгласие.</li>
      </ul>

      <h2>4. Трансфер на данни извън ЕС</h2>
      <p>
        Където трансферираме данни извън ЕС/ЕИЗ, разчитаме на:
      </p>
      <ul>
        <li><strong>EU-US Data Privacy Framework</strong> — за сертифицирани получатели в САЩ.</li>
        <li><strong>Стандартни договорни клаузи (SCC)</strong> на ЕК — за всички останали трансфери.</li>
        <li>Технически мерки: криптиране при пренос (TLS 1.2+) и в покой.</li>
      </ul>

      <h2>5. Срокове за съхранение</h2>
      <ul>
        <li><strong>Профил и документи</strong> — до изтриване на акаунта от Потребителя.</li>
        <li><strong>Счетоводни/платежни записи</strong> — 10 години (чл. 38 ДОПК).</li>
        <li><strong>Лог файлове</strong> — 90 дни.</li>
        <li><strong>Маркетингови съгласия</strong> — до оттегляне + 3 години за доказване.</li>
        <li><strong>Записи на съгласия</strong> — 3 години след последно действие.</li>
      </ul>

      <h2>6. Автоматизирано обработване и AI</h2>
      <p>
        Платформата използва AI за изготвяне на проекти на договори и за анализ на
        риск. Това <strong>не е автоматизирано вземане на решения с правни последици
        за Вас</strong> по смисъла на чл. 22 GDPR — окончателното решение за
        използване, подписване и приложение на документа е изцяло Ваше.
      </p>

      <h2>7. Вашите права</h2>
      <ul>
        <li><strong>Достъп</strong> — копие на личните Ви данни.</li>
        <li><strong>Корекция</strong> — поправка на неточни данни.</li>
        <li><strong>Изтриване</strong> („право да бъдете забравени") — извън случаите на законов срок за съхранение.</li>
        <li><strong>Преносимост</strong> — машинно четим формат на данните, които сте предоставили.</li>
        <li><strong>Ограничаване</strong> и <strong>възражение</strong> срещу обработка на основание легитимен интерес.</li>
        <li><strong>Оттегляне на съгласие</strong> — без обратно действие.</li>
        <li><strong>Жалба до КЗЛД</strong> — <a href="https://www.cpdp.bg" target="_blank" rel="noopener">cpdp.bg</a>, бул. „Проф. Цветан Лазаров" № 2, София.</li>
      </ul>
      <p>
        Изпращаме отговор в срок <strong>до 30 дни</strong> от получаване на искането
        на <a href="mailto:imdevelopmentoffice@gmail.com">imdevelopmentoffice@gmail.com</a>.
      </p>

      <h2>8. Сигурност</h2>
      <p>
        TLS криптиране, Row-Level Security на ниво база, хеширане на пароли и IP
        адреси, регулярни одити и Sentry за мониторинг. При нарушение на сигурността
        уведомяваме КЗЛД в рамките на <strong>72 часа</strong> и Потребителите без
        неоправдано забавяне (чл. 33–34 GDPR).
      </p>

      <h2>9. Бисквитки</h2>
      <p>Вижте отделната <a href="/cookies">Политика за бисквитки</a>.</p>

      <h2>10. Промени в политиката</h2>
      <p>
        Съществени промени се съобщават с email или вътрешно известие 30 дни преди
        влизане в сила. Дата на актуализация е посочена най-горе.
      </p>
    </LegalLayout>
  );
}
