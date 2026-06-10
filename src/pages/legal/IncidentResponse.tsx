import { LegalLayout } from "./LegalLayout";

export default function IncidentResponsePage() {
  return (
    <LegalLayout
      title="Политика за реакция при инциденти"
      description="Как Dogovori.net реагира при пробив в сигурността или нарушение на личните данни (чл. 33–34 GDPR)."
    >
      <h2>1. Дефиниция</h2>
      <p>
        Инцидент е всяко събитие, което води или може да доведе до нарушение на
        поверителността, целостта или достъпността на личните данни (чл. 4, т. 12
        GDPR), включително:
      </p>
      <ul>
        <li>Неоторизиран достъп до акаунт или база данни;</li>
        <li>Изтичане на лични данни към трета страна;</li>
        <li>Загуба или унищожаване на данни;</li>
        <li>Атаки от типа DDoS, brute-force, prompt injection;</li>
        <li>Уязвимости в зависимости (security advisories).</li>
      </ul>

      <h2>2. SLA за уведомяване</h2>
      <ul>
        <li>
          <strong>КЗЛД:</strong> до <strong>72 часа</strong> след установяване на
          нарушението (чл. 33 GDPR).
        </li>
        <li>
          <strong>Засегнати потребители:</strong> без неоправдано забавяне при
          висок риск за правата им (чл. 34 GDPR) — чрез email и вътрешно
          известие.
        </li>
        <li>
          <strong>Бизнес клиенти (Team):</strong> до <strong>24 часа</strong>
          след установяване, дори при ниска тежест (повишен договорен SLA).
        </li>
      </ul>

      <h2>3. Цели за възстановяване (RTO / RPO)</h2>
      <ul>
        <li><strong>RTO (Recovery Time Objective):</strong> ≤ 4 часа за критични функции (вход, генериране, подписване).</li>
        <li><strong>RPO (Recovery Point Objective):</strong> ≤ 5 минути — Point-in-Time Recovery (PITR) на базата данни през Lovable Cloud.</li>
        <li><strong>Backup retention:</strong> 7 дни PITR + дневни snapshots за 30 дни.</li>
        <li><strong>Restore drill:</strong> провежда се поне веднъж на 6 месеца; резултатите се документират вътрешно.</li>
      </ul>

      <h2>4. Процедура</h2>
      <ol>
        <li><strong>Откриване</strong> — Sentry alert, ръчно докладване или сигнал от потребител.</li>
        <li><strong>Изолация</strong> — спираме засегнатата функция/сесия/акаунт.</li>
        <li><strong>Оценка</strong> — определяме категории данни, брой засегнати лица, тежест.</li>
        <li><strong>Корекция</strong> — patch, rotation на ключове, инвалидация на сесии.</li>
        <li><strong>Уведомяване</strong> — КЗЛД и засегнати лица по горните SLA.</li>
        <li><strong>Post-mortem</strong> — публичен summary при значими инциденти.</li>
        <li><strong>Превенция</strong> — actionable списък + проследяване до затваряне.</li>
      </ol>

      <h2>4. Докладване на уязвимост (Responsible Disclosure)</h2>
      <p>
        Ако сте открили уязвимост в платформата, моля свържете се с нас на:
      </p>
      <ul>
        <li>
          Email: <a href="mailto:imdevelopmentoffice@gmail.com">imdevelopmentoffice@gmail.com</a>
          (тема: <em>Security disclosure</em>)
        </li>
        <li>Ангажираме се да отговорим в рамките на 5 работни дни.</li>
        <li>
          Молим за минимум 30 дни преди публично разкриване, за да имаме време да
          реагираме.
        </li>
      </ul>

      <h2>5. Контакти на надзорни органи</h2>
      <ul>
        <li>
          <strong>Комисия за защита на личните данни (КЗЛД):</strong>{" "}
          <a href="https://www.cpdp.bg" target="_blank" rel="noopener">cpdp.bg</a>,
          бул. „Проф. Цветан Лазаров" № 2, София, 02 / 91-53-518
        </li>
        <li>
          <strong>ГД „Национална полиция" — Кибер престъпност:</strong>{" "}
          <a href="https://cybercrime.bg" target="_blank" rel="noopener">cybercrime.bg</a>
        </li>
      </ul>

      <h2>6. Архив на инциденти</h2>
      <p>
        Към момента няма публично оповестени инциденти. При възникване ще
        публикуваме summary на тази страница.
      </p>
    </LegalLayout>
  );
}
