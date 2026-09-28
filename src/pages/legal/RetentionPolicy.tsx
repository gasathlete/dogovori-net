import { LegalLayout } from "./LegalLayout";

export default function RetentionPolicyPage() {
  return (
    <LegalLayout
      title="Политика за съхранение на данни"
      description="Срокове за съхранение на лични данни и документи в Dogovori.net съгласно GDPR и българското законодателство."
      basis={["GDPR чл. 5, ал. 1, б. \u201eд\u201c", "ЗСч чл. 12"]}
    >
      <h2>1. Принципи</h2>
      <p>
        Съхраняваме лични данни само толкова, колкото е необходимо за конкретна цел
        (чл. 5, ал. 1, б. „д" GDPR — ограничение на съхранението). След изтичане на
        срока данните се изтриват автоматично или анонимизират.
      </p>

      <h2>2. Срокове</h2>
      <table className="my-4 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-left">
            <th className="py-2 pr-3">Категория</th>
            <th className="py-2 pr-3">Срок</th>
            <th className="py-2">Основание</th>
          </tr>
        </thead>
        <tbody className="text-foreground/80">
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Качени временни документи (PDF/DOCX), нерезирвани в сделка</td>
            <td className="py-2 pr-3 align-top"><strong>24 часа</strong></td>
            <td className="py-2 align-top">Минимизация — автоматично изтриване от <code>retention-sweeper</code></td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Извлечен текст от качени документи (след анализ)</td>
            <td className="py-2 pr-3 align-top">24 часа след анализ</td>
            <td className="py-2 align-top">Минимизация</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Запазени документи в акаунта</td>
            <td className="py-2 pr-3 align-top">До изтриване от потребителя</td>
            <td className="py-2 align-top">Изпълнение на договора</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Профил, акаунт, контрагенти, папки</td>
            <td className="py-2 pr-3 align-top">До изтриване на акаунта</td>
            <td className="py-2 align-top">Изпълнение на договора</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">AI audit log (метаданни)</td>
            <td className="py-2 pr-3 align-top"><strong>12 месеца</strong></td>
            <td className="py-2 align-top">Чл. 6, ал. 1, б. „е" — легитимен интерес (сигурност, отчетност по AI Act)</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Счетоводни/платежни записи</td>
            <td className="py-2 pr-3 align-top"><strong>10 години</strong></td>
            <td className="py-2 align-top">Чл. 38 ДОПК, ЗСч, ЗДДС</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Лог файлове (web, error, rate-limit)</td>
            <td className="py-2 pr-3 align-top">90 дни</td>
            <td className="py-2 align-top">Сигурност и одит</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Записи на съгласия (<code>user_consents</code>)</td>
            <td className="py-2 pr-3 align-top">3 години след последно действие</td>
            <td className="py-2 align-top">Чл. 7, ал. 1 GDPR — доказване</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Маркетингови съгласия и история</td>
            <td className="py-2 pr-3 align-top">До оттегляне + 3 години</td>
            <td className="py-2 align-top">Доказване, защита при претенции</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Опити за качване на забранено съдържание</td>
            <td className="py-2 pr-3 align-top">12 месеца</td>
            <td className="py-2 align-top">Сигурност, превенция на злоупотреби</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Заявки за известие при пускане (имейл)</td>
            <td className="py-2 pr-3 align-top">90 дни от съгласието; автоматично ежедневно изтриване</td>
            <td className="py-2 align-top">Уведомяване при старт на услугата по изрично съгласие</td>
          </tr>
          <tr>
            <td className="py-2 pr-3 align-top">Подписани договори чрез споделена връзка</td>
            <td className="py-2 pr-3 align-top">До изтриване от собственика; одит записи 5 г.</td>
            <td className="py-2 align-top">Защита при правни претенции</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Технически реализации</h2>
      <ul>
        <li>
          Едж функция <code>retention-sweeper</code> се изпълнява всеки час чрез
          <code>pg_cron</code> и изтрива всичко, което е надхвърлило срока си.
        </li>
        <li>
          Storage обекти, които не са свързани с активен ред в базата, се изтриват
          автоматично от sweeper-а.
        </li>
        <li>
          При изтриване на акаунт всички свързани данни се премахват чрез
          <code>ON DELETE CASCADE</code>; запазват се само анонимизирани счетоводни
          записи (10 г.).
        </li>
      </ul>

      <h2>4. Право на по-кратко съхранение</h2>
      <p>
        Можете да поискате изтриване на отделен документ или на целия акаунт по
        всяко време от страница „Профил" → „Моите данни" → „Изтрий". Изключения са
        счетоводните записи, които сме длъжни да пазим по закон.
      </p>

      <h2>5. Контакт</h2>
      <p>
        Email: <a href="mailto:imdevelopmentoffice@gmail.com">imdevelopmentoffice@gmail.com</a>
      </p>
    </LegalLayout>
  );
}
