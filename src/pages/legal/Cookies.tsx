import { LegalLayout } from "./LegalLayout";
import { Button } from "@/components/ui/button";
import { revokeCookieConsent } from "@/lib/analytics";
import { toast } from "sonner";

type Row = {
  name: string;
  provider: string;
  purpose: string;
  duration: string;
  type: "strict" | "analytics" | "marketing";
};

const ROWS: Row[] = [
  { name: "sb-*-auth-token", provider: "Supabase (ЕС, Франкфурт)", purpose: "Поддържа сесията на влезлия потребител.", duration: "1 час (refresh до 30 дни)", type: "strict" },
  { name: "sb-*-auth-refresh", provider: "Supabase", purpose: "Автоматично подновяване на JWT токена.", duration: "30 дни", type: "strict" },
  { name: "dogovori.cookieConsent", provider: "Dogovori.net", purpose: "Запис на Вашия избор от cookie банера.", duration: "12 месеца", type: "strict" },
  { name: "wizard-progress-*", provider: "Dogovori.net (localStorage)", purpose: "Запазва прогреса Ви в Wizard, за да не губите въведени данни.", duration: "До ръчно изтриване или завършване на договора", type: "strict" },
  { name: "aiDisclaimerAccepted", provider: "Dogovori.net (sessionStorage)", purpose: "Помни, че сте приели AI дисклеймъра за текущата сесия.", duration: "До затваряне на браузъра", type: "strict" },
  { name: "__stripe_mid, __stripe_sid", provider: "Stripe (Ирландия)", purpose: "Защита от измами по време на плащане.", duration: "1 година / 30 мин", type: "strict" },
  { name: "_ga, _ga_1LV139YG8J", provider: "Google Analytics 4 (Google Ireland)", purpose: "Разграничаване на потребители и сесии за анонимизирана уеб аналитика (IP анонимизация, Consent Mode v2).", duration: "до 24 месеца (само при opt-in)", type: "analytics" },
];

const TYPE_LABEL: Record<Row["type"], string> = {
  strict: "Строго необходими",
  analytics: "Аналитични",
  marketing: "Маркетингови",
};

const TYPE_TONE: Record<Row["type"], string> = {
  strict: "bg-emerald-500/10 text-emerald-600",
  analytics: "bg-blue-500/10 text-blue-600",
  marketing: "bg-amber-500/10 text-amber-600",
};

export default function CookiesPage() {
  const handleRevoke = () => {
    revokeCookieConsent();
    toast.success("Изборът Ви е изчистен. Презаредете страницата, за да направите нов избор.");
  };

  return (
    <LegalLayout
      title="Политика за бисквитки"
      description="Какви бисквитки и подобни технологии използва Dogovori.net, техните доставчици, срокове и как да управлявате избора си по категории."
      basis={["ЗЕС чл. 4а", "GDPR чл. 7", "ePrivacy 2002/58/ЕО", "СЕС C-673/17 Planet49"]}
    >
      <h2>1. Какво са бисквитките</h2>
      <p>
        Бисквитките са малки текстови файлове, които сайтовете запазват в браузъра ви,
        за да запомнят информация — напр. че сте влезли в профила си или на кой език
        предпочитате да четете. В тази политика под „бисквитки" разбираме и сходни
        технологии: <code>localStorage</code>, <code>sessionStorage</code>, pixel tags,
        IndexedDB.
      </p>

      <h2>2. Категории, които използваме</h2>

      <h3>2.1. Строго необходими (винаги активни)</h3>
      <p>
        Без тях платформата не работи — например запазване на сесията, защита от
        измами при плащане и запис на Вашия избор от cookie банера. Тези бисквитки
        <strong> не изискват съгласие</strong> съгласно чл. 4а, ал. 3, т. 2 ЗЕТ.
      </p>

      <h3>2.2. Аналитични (opt-in)</h3>
      <p>
        Помагат ни да разберем кои страници се посещават най-често и къде има грешки,
        за да подобряваме услугата. Използваме <strong>Plausible</strong> — хостван в
        ЕС, без бисквитки на трети страни и без кръстосано проследяване. Активират се
        само след Вашето изрично съгласие.
      </p>

      <h3>2.3. Маркетингови (opt-in)</h3>
      <p>
        Засега <strong>не използваме</strong> маркетингови или ремаркетинг бисквитки
        на трети страни (Google Ads, Meta Pixel, TikTok и др.). Категорията е
        резервирана за бъдещи функции и ще бъде активирана само след изрично Ваше
        съгласие и предварителна актуализация на тази политика.
      </p>

      <h2>3. Пълен списък на активните бисквитки</h2>
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border/60 text-left">
              <th className="py-2 pr-3">Име</th>
              <th className="py-2 pr-3">Доставчик</th>
              <th className="py-2 pr-3">Цел</th>
              <th className="py-2 pr-3">Срок</th>
              <th className="py-2">Категория</th>
            </tr>
          </thead>
          <tbody className="text-foreground/85">
            {ROWS.map((r) => (
              <tr key={r.name} className="border-b border-border/30 align-top">
                <td className="py-2 pr-3 font-mono text-[11px]">{r.name}</td>
                <td className="py-2 pr-3">{r.provider}</td>
                <td className="py-2 pr-3">{r.purpose}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{r.duration}</td>
                <td className="py-2">
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_TONE[r.type]}`}>
                    {TYPE_LABEL[r.type]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Списъкът се актуализира при добавяне на нов доставчик. Дата на последна
        актуализация — виж най-горе на страницата.
      </p>

      <h2>4. Управление на Вашия избор</h2>
      <p>
        При първото си посещение получавате банер с трите категории. Можете да
        приемете всички, само необходимите или да направите детайлен избор. По всяко
        време можете да оттеглите или промените избора си с бутона по-долу — оттеглянето
        не засяга законосъобразността на обработването преди него:
      </p>
      <p>
        <Button
          variant="outline"
          onClick={handleRevoke}
          className="border-gold/40 hover:bg-gold/10 hover:text-gold"
        >
          Изчисти избора за бисквитки
        </Button>
      </p>
      <p>
        Можете също да изтриете бисквитките през настройките на браузъра си
        (<a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener">Chrome</a>,
        {" "}<a href="https://support.mozilla.org/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noopener">Firefox</a>,
        {" "}<a href="https://support.apple.com/HT201265" target="_blank" rel="noopener">Safari</a>,
        {" "}<a href="https://support.microsoft.com/microsoft-edge" target="_blank" rel="noopener">Edge</a>) — това ще
        изисква повторно влизане в профила.
      </p>

      <h2>5. Do Not Track и Global Privacy Control</h2>
      <p>
        Уважаваме заглавието <code>Sec-GPC: 1</code> (Global Privacy Control) — при
        негово наличие autoматично третираме посещението като отказ от аналитични и
        маркетингови бисквитки. Стандартът DNT (Do Not Track) не се прилага автоматично,
        тъй като не е ясно дефиниран правно.
      </p>

      <h2>6. Правно основание</h2>
      <p>
        Прилагаме <strong>чл. 4а от Закона за електронните съобщения (ЗЕТ)</strong>,
        Регламент (ЕС) 2016/679 (GDPR) и решението на Съда на ЕС по дело
        {" "}<em>Planet49</em> (C-673/17). За всички неабсолютно необходими бисквитки
        изискваме активно opt-in съгласие. Записът за Вашия избор се пази до 12 месеца
        или до оттегляне.
      </p>

      <h2>7. Промени в тази политика</h2>
      <p>
        Съществени промени се публикуват на <a href="/legal/changelog">/legal/changelog</a>
        {" "}и се съобщават с вътрешно известие поне 30 дни преди влизане в сила.
      </p>

      <h2>8. Контакт</h2>
      <p>
        При въпроси относно бисквитките пишете на{" "}
        <a href="mailto:imdevelopmentoffice@gmail.com">imdevelopmentoffice@gmail.com</a>
        {" "}или през страницата <a href="/contacts">Контакти</a>.
      </p>
    </LegalLayout>
  );
}
