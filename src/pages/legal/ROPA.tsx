import { LegalLayout } from "./LegalLayout";

const QO = "\u201E"; // „
const QC = "\u201C"; // "

export default function ROPA() {
  return (
    <LegalLayout
      title="Регистър на дейностите по обработка (ROPA)"
      description="Регистър по чл. 30 GDPR за дейностите по обработка на лични данни в Dogovori.net."
      basis={["GDPR чл. 30"]}
    >
      <p className="text-sm text-muted-foreground">
        Версия 1.0 · Последна актуализация: 10.06.2026 г.
      </p>

      <h2>1. Администратор</h2>
      <p>
        <strong>Dogovori.net</strong> {QO}Платформата{QC} — администратор по смисъла на чл. 4, т. 7 GDPR.
        Контакт по защита на данните: <a href="mailto:privacy@dogovori.net">privacy@dogovori.net</a>.
      </p>

      <h2>2. Регистър на дейностите</h2>
      <p className="text-sm">
        В таблицата по-долу е документирана всяка дейност по обработка съгласно чл. 30, ал. 1 GDPR.
        Категориите субекти, данни, получатели, срокове и мерки са поддържани отделно и в DPIA документа.
      </p>

      {ACTIVITIES.map((a, i) => (
        <section key={a.id} className="my-6 rounded-md border border-border/50 p-4 text-sm">
          <h3 className="text-base font-semibold mb-2">
            {i + 1}. {a.name}
          </h3>
          <dl className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            <dt className="font-medium text-muted-foreground">Цел</dt>
            <dd>{a.purpose}</dd>

            <dt className="font-medium text-muted-foreground">Правно основание</dt>
            <dd>{a.legalBasis}</dd>

            <dt className="font-medium text-muted-foreground">Категории субекти</dt>
            <dd>{a.subjects}</dd>

            <dt className="font-medium text-muted-foreground">Категории данни</dt>
            <dd>{a.data}</dd>

            <dt className="font-medium text-muted-foreground">Получатели</dt>
            <dd>{a.recipients}</dd>

            <dt className="font-medium text-muted-foreground">Срок на съхранение</dt>
            <dd>{a.retention}</dd>

            <dt className="font-medium text-muted-foreground">Технически и организационни мерки</dt>
            <dd>{a.measures}</dd>

            <dt className="font-medium text-muted-foreground">Трансфер извън ЕИП</dt>
            <dd>{a.transfer}</dd>
          </dl>
        </section>
      ))}

      <h2>3. Промени в регистъра</h2>
      <p>
        Регистърът се преглежда поне веднъж годишно или при материална промяна в обработките
        (нов подпроцесор, нова цел, нова категория данни).
      </p>

      <h2>4. Свързани документи</h2>
      <ul>
        <li><a href="/privacy">Политика за поверителност</a></li>
        <li><a href="/legal/retention">Политика за съхранение</a></li>
        <li><a href="/legal/subprocessors">Регистър на подпроцесорите</a></li>
        <li><a href="/legal/ai-processing">AI обработка</a></li>
        <li><a href="/dpa">Споразумение за обработка на данни (DPA)</a></li>
      </ul>
    </LegalLayout>
  );
}

type Activity = {
  id: string;
  name: string;
  purpose: string;
  legalBasis: string;
  subjects: string;
  data: string;
  recipients: string;
  retention: string;
  measures: string;
  transfer: string;
};

const ACTIVITIES: Activity[] = [
  {
    id: "launch_notice",
    name: "Известие при пускане на услуга (тестов период)",
    purpose: "Еднократно уведомяване, когато избраната група услуги стане достъпна.",
    legalBasis: "Чл. 6, ал. 1, б. 'а' GDPR — изрично, неотметнато предварително съгласие.",
    subjects: "Посетители, оставили имейл за известие.",
    data: "Имейл, група услуги, версия и момент на съгласието. Без IP, UA и име.",
    recipients: "Хостинг на базата данни в ЕС. Имейли не се изпращат в тестовия период.",
    retention: "90 дни от съгласието; автоматично ежедневно изтриване. Оперативна настройка на собственика за тестовия период (owner-testmonth-20260928).",
    measures: "Без директен достъп от браузъра; запис само чрез сървърна функция с общ лимит; оттегляне при заявка.",
    transfer: "Не.",
  },
  {
    id: "auth",
    name: "Регистрация и удостоверяване",
    purpose: "Създаване и поддръжка на потребителски акаунт.",
    legalBasis: "Чл. 6, ал. 1, б. 'б' GDPR — изпълнение на договор.",
    subjects: "Регистрирани потребители (физически лица и представители на ЮЛ).",
    data: "Имейл, парола (хеш), потребителско име, IP, User-Agent.",
    recipients: "Supabase (хостинг auth), Resend (потвърдителни имейли).",
    retention: "До оттегляне на акаунта; счетоводни записи 10 г.",
    measures: "Хеширане на пароли, 2FA препоръка, RLS, TLS 1.2+.",
    transfer: "Не. Хостинг в ЕС (Frankfurt).",
  },
  {
    id: "generate",
    name: "Генериране на проекти на договори",
    purpose: "AI-подпомогнато създаване на правни документи по параметри от потребителя.",
    legalBasis: "Чл. 6, ал. 1, б. 'б' GDPR — изпълнение на договор.",
    subjects: "Платени и активни потребители.",
    data: "Параметри на договора, имена на страни, ЕИК/ЕГН (псевдонимизирани преди AI).",
    recipients: "Google (Gemini API, EU), OpenAI (fallback, EU). Без обучение.",
    retention: "Метаданни в ai_audit_log — 12 м. Съдържание не се логва.",
    measures: "Псевдонимизация (PII redaction), unredact в RAM, без логване на съдържание.",
    transfer: "Не. AI providerите оперират в EU регион със SCC.",
  },
  {
    id: "analyze",
    name: "Анализ на качени документи",
    purpose: "Извличане на рискови клаузи и предложения за корекции.",
    legalBasis: "Чл. 6, ал. 1, б. 'б' GDPR — изпълнение на договор.",
    subjects: "Платени потребители.",
    data: "Качен документ; може да съдържа имена, ЕГН, IBAN, адреси.",
    recipients: "Google (Gemini), OpenAI (fallback).",
    retention: "Временните файлове: 24 ч. Запазените: до изтриване от потребителя.",
    measures: "MIME whitelist, magic-bytes валидация, псевдонимизация, retention-sweeper cron.",
    transfer: "Не.",
  },
  {
    id: "assistant",
    name: "AI асистент чат",
    purpose: "Отговор на правни въпроси (не-съвет) и помощ при ползване на платформата.",
    legalBasis: "Чл. 6, ал. 1, б. 'б' GDPR — изпълнение на договор.",
    subjects: "Активни потребители.",
    data: "Текст на въпроса; история на разговор.",
    recipients: "Google (Gemini).",
    retention: "12 месеца (assistant_messages).",
    measures: "Класификация на риска преди изпращане, AI disclaimer, прозрачност чл. 50 AI Act.",
    transfer: "Не.",
  },
  {
    id: "billing",
    name: "Билинг и абонаменти",
    purpose: "Обработка на плащания, фактуриране, метеринг на операции.",
    legalBasis: "Чл. 6, ал. 1, б. 'б' + б. 'в' GDPR — договор + счетоводно задължение.",
    subjects: "Платени потребители.",
    data: "Stripe customer ID, име на фирма, ДДС номер, адрес за фактуриране.",
    recipients: "Stripe (Ирландия, DPF + SCC).",
    retention: "Активни записи + 10 г. за фактури (ЗСч).",
    measures: "Не съхраняваме картови данни; Stripe е PCI-DSS L1 сертифициран.",
    transfer: "Stripe оперира с DPF за US-резервни мощности.",
  },
  {
    id: "signing",
    name: "Електронно подписване (споделяне за подпис)",
    purpose: "Изпращане на документ за подпис към насрещна страна.",
    legalBasis: "Чл. 6, ал. 1, б. 'б' GDPR — изпълнение на договор.",
    subjects: "Потребители и насрещни подписващи страни.",
    data: "Имена, имейли на подписващи, IP, време на подпис, хеш на документа.",
    recipients: "Resend (имейл), Supabase Storage (PDF).",
    retention: "Запис за одит: 10 г. (доказателствена стойност).",
    measures: "Audit log, OTP за подпис, имуутабъл хеш на финалния PDF.",
    transfer: "Не.",
  },
  {
    id: "analytics",
    name: "Анонимна продуктова аналитика",
    purpose: "Подобряване на функционалности и UX.",
    legalBasis: "Чл. 6, ал. 1, б. 'е' GDPR — легитимен интерес.",
    subjects: "Посетители на сайта.",
    data: "Хеширан IP, страница, referrer, държава, устройство.",
    recipients: "Google Ireland Ltd. — GA4 (EU + US, SCC + DPF, anonymize_ip, Consent Mode v2), Sentry (EU, PII scrubbing).",
    retention: "page_views: 13 м. Sentry: 90 дни.",
    measures: "Без бисквитки за tracking, IP-хеш с дневен salt, PII scrubbing.",
    transfer: "Не.",
  },
  {
    id: "conversion-quality-metrics",
    name: "Метрики за конверсия и качество",
    purpose:
      "Измерване къде потребителите спират по пътя към готов документ (конверсия) и следене дали техническото качество на документите се запазва (оценка от автоматичната ревизия, блокирани непопълнени полета, провали при генериране, завършени подписвания).",
    legalBasis:
      "Чл. 6, ал. 1, б. 'а' GDPR — съгласие за аналитични бисквитки; агрегираните вътрешни показатели за качество — чл. 6, ал. 1, б. 'е' (легитимен интерес от безопасен продукт).",
    subjects: "Посетители и регистрирани потребители.",
    data:
      "Псевдонимен идентификатор на сесия (случаен UUID), име на събитие, път на страницата, тип/формат на документа, числови резултати (оценка, брой пропуски), сегмент (фирма/фрийлансър), тип устройство. Без имена, имейли, IP или съдържание на документи.",
    recipients: "Вътрешен админ панел (само служители), Google Ireland Ltd. — GA4 при дадено съгласие.",
    retention: "funnel_events: 13 м., след което се изтриват.",
    measures:
      "Санитизация на свойствата (допускат се само числа, булеви и кратки контролирани етикети), staff-only достъп чрез SECURITY DEFINER агрегации, липса на достъп до сурови редове за потребители.",
    transfer: "Не (GA4 — SCC + DPF).",
  },
  {
    id: "moderation",
    name: "Модерация на потребителски статии",
    purpose: "Преглед на подадено от потребители съдържание (блог) преди публикуване.",
    legalBasis: "Чл. 6, ал. 1, б. 'е' GDPR — легитимен интерес (качество и законност).",
    subjects: "Автори, изпратили статия.",
    data: "Заглавие, тяло, имейл на автор.",
    recipients: "Вътрешни модератори.",
    retention: "До 24 м. след решение.",
    measures: "Анонимизация в admin UI чрез admin-redact-payload.",
    transfer: "Не.",
  },
  {
    id: "transactional-email",
    name: "Транзакционни имейли",
    purpose: "Известия за акаунт, билинг, изтичане на абонамент, подписи.",
    legalBasis: "Чл. 6, ал. 1, б. 'б' GDPR — изпълнение на договор.",
    subjects: "Регистрирани потребители.",
    data: "Имейл, име, контекст на събитието.",
    recipients: "Resend.",
    retention: "Send log: 6 месеца.",
    measures: "Unsubscribe токени, suppression list, DKIM/SPF/DMARC.",
    transfer: "Не.",
  },
  {
    id: "security",
    name: "Сигурност и предотвратяване на злоупотреби",
    purpose: "Откриване на опити за обработка на незаконно съдържание или ограничени категории данни (чл. 9 GDPR), спам, abuse.",
    legalBasis: "Чл. 6, ал. 1, б. 'е' GDPR — легитимен интерес (LIA проведен).",
    subjects: "Всички потребители.",
    data: "restricted_processing_events: hash на IP, категория, тип събитие (illegal_content_blocked / special_category_detected), функция, user_id. БЕЗ съдържание и БЕЗ открити термини.",
    recipients: "Само вътрешен security екип (staff достъп).",
    retention: "12 месеца.",
    measures: "RLS, само staff достъп, минимизация на данните, без съхранение на сурово съдържание.",
    transfer: "Не.",
  },
];
