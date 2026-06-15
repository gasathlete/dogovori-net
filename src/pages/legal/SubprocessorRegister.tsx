import { LegalLayout } from "./LegalLayout";

export default function SubprocessorRegisterPage() {
  return (
    <LegalLayout
      title="Регистър на подпроцесори"
      description="Списък на трети страни, които обработват лични данни от името на Dogovori.net (чл. 28 GDPR)."
      basis={["GDPR чл. 28, ал. 2", "GDPR чл. 44–49"]}
    >
      <p>
        Актуален списък към <strong>9 юни 2026 г.</strong> на подпроцесорите,
        които обработват лични данни от името на „Иванов и Милев Пропърти
        Девелъпмент" ЕООД (Dogovori.net).
      </p>

      <table className="my-4 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-left">
            <th className="py-2 pr-3">Подпроцесор</th>
            <th className="py-2 pr-3">Цел</th>
            <th className="py-2 pr-3">Регион</th>
            <th className="py-2">Гаранции</th>
          </tr>
        </thead>
        <tbody className="text-foreground/80">
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Supabase Inc.</td>
            <td className="py-2 pr-3 align-top">База данни, autentication, storage, edge functions</td>
            <td className="py-2 pr-3 align-top">ЕС (Франкфурт, Германия)</td>
            <td className="py-2 align-top">DPA, чл. 28 GDPR</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Google LLC / Google Ireland Ltd.</td>
            <td className="py-2 pr-3 align-top">AI генериране и анализ (Gemini)</td>
            <td className="py-2 pr-3 align-top">САЩ + ЕС</td>
            <td className="py-2 align-top">SCC + DPF; без обучение върху данни на клиента; zero data retention</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">OpenAI Ireland Ltd.</td>
            <td className="py-2 pr-3 align-top">Резервен AI модел при срив на първичния</td>
            <td className="py-2 pr-3 align-top">Ирландия (ЕС) + САЩ (zero retention API)</td>
            <td className="py-2 align-top">SCC + DPF; ZDR; без обучение</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Stripe Payments Europe Ltd.</td>
            <td className="py-2 pr-3 align-top">Обработка на плащания и абонаменти</td>
            <td className="py-2 pr-3 align-top">Ирландия (ЕС) + САЩ</td>
            <td className="py-2 align-top">DPF + SCC; PCI-DSS Level 1</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Resend Inc.</td>
            <td className="py-2 pr-3 align-top">Транзакционен email</td>
            <td className="py-2 pr-3 align-top">САЩ</td>
            <td className="py-2 align-top">DPF + SCC</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Plausible Insights OÜ</td>
            <td className="py-2 pr-3 align-top">Анонимизирана аналитика (без бисквитки)</td>
            <td className="py-2 pr-3 align-top">Естония (ЕС)</td>
            <td className="py-2 align-top">Без лични данни; cookieless</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3 align-top">Sentry (Functional Software Inc.)</td>
            <td className="py-2 pr-3 align-top">Мониторинг на грешки (опционално)</td>
            <td className="py-2 pr-3 align-top">САЩ + ЕС опция</td>
            <td className="py-2 align-top">SCC + DPF; PII filtering</td>
          </tr>
          <tr>
            <td className="py-2 pr-3 align-top">Cloudflare, Inc.</td>
            <td className="py-2 pr-3 align-top">CDN, DDoS защита</td>
            <td className="py-2 pr-3 align-top">Глобален CDN (terminating edge в ЕС)</td>
            <td className="py-2 align-top">SCC + DPF</td>
          </tr>
        </tbody>
      </table>

      <h2>Уведомяване за нови подпроцесори</h2>
      <p>
        Преди добавяне на нов подпроцесор Ви уведомяваме чрез email и/или
        вътрешно известие поне <strong>30 дни предварително</strong>. Ако не сте
        съгласни с конкретен подпроцесор, имате право да прекратите услугата без
        неустойка преди влизане в сила.
      </p>

      <h2>Възражения и контакт</h2>
      <p>
        За въпроси или възражения:
        <a href="mailto:imdevelopmentoffice@gmail.com"> imdevelopmentoffice@gmail.com</a>
      </p>
    </LegalLayout>
  );
}
