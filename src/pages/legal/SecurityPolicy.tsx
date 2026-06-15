import { LegalLayout } from "./LegalLayout";

export default function SecurityPolicy() {
  return (
    <LegalLayout
      title="Политика за разкриване на уязвимости"
      description="Vulnerability Disclosure Policy (VDP) за Dogovori.net съгласно RFC 9116."
      basis={["GDPR чл. 32", "RFC 9116"]}
    >
      <p className="text-sm text-muted-foreground">Версия: 2026-06-25</p>

      <h2>1. Обхват</h2>
      <p>
        Тази политика обхваща всички production системи на Dogovori.net, включително
        <code> dogovori.net</code>, <code>www.dogovori.net</code>, публични API endpoints
        и edge функции. Извън обхвата са трети страни (Supabase, Stripe, OpenAI и др.) —
        моля, докладвайте директно на тях.
      </p>

      <h2>2. Как да докладвате</h2>
      <ul>
        <li>Имейл: <a href="mailto:security@dogovori.net">security@dogovori.net</a></li>
        <li>PGP: предоставя се при поискване.</li>
        <li>
          Машинно четим контакт: <code>/.well-known/security.txt</code> (RFC 9116).
        </li>
      </ul>

      <h2>3. Какво очакваме от изследователите (Safe Harbor)</h2>
      <ul>
        <li>Не извличайте, не съхранявайте и не споделяйте чужди потребителски данни.</li>
        <li>Без DoS/DDoS, спам, социално инженерство или физически атаки.</li>
        <li>Спрете тестването при получаване на достъп и докладвайте веднага.</li>
        <li>
          Добросъвестни изследвания, които спазват тези правила, няма да бъдат третирани
          като нарушение на ОУ или преследвани правно.
        </li>
      </ul>

      <h2>4. Срокове за отговор</h2>
      <ul>
        <li>Потвърждение на получаване: до 3 работни дни.</li>
        <li>Първоначална оценка: до 10 работни дни.</li>
        <li>Решение/корекция: според критичността (Critical: 7 дни, High: 30 дни, Medium: 90 дни).</li>
      </ul>

      <h2>5. Признание</h2>
      <p>
        С Ваше съгласие добавяме името Ви в Hall of Fame. В момента не предлагаме парично
        възнаграждение (bug bounty), но това може да се промени.
      </p>

      <h2>6. Свързани документи</h2>
      <ul>
        <li><a href="/legal/incident-response">Политика за инциденти</a></li>
        <li><a href="/privacy">Политика за поверителност</a></li>
        <li><a href="/.well-known/security.txt">security.txt</a></li>
      </ul>
    </LegalLayout>
  );
}
