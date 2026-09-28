import { LegalLayout } from "./LegalLayout";
import { Mail, Shield, AlertTriangle, Building2, MessageSquare, Scale } from "@/icons";

import { CONTACT_EMAIL as EMAIL, CONTACT_COMPANY as COMPANY, CONTACT_EIK as EIK, CONTACT_ADDRESS as ADDRESS } from "../../data/contactPublicInfo";

type Channel = {
  icon: typeof Mail;
  title: string;
  purpose: string;
  email: string;
  sla: string;
};

const CHANNELS: Channel[] = [
  {
    icon: MessageSquare,
    title: "Обща поддръжка",
    purpose: "Въпроси за акаунт, абонамент, шаблони, счетоводни справки.",
    email: EMAIL,
    sla: "1–2 работни дни",
  },
  {
    icon: Shield,
    title: "Защита на личните данни (GDPR)",
    purpose: "Упражняване на права по чл. 15–22 GDPR, оттегляне на съгласия, DPO въпроси.",
    email: EMAIL,
    sla: "до 30 календарни дни (чл. 12 GDPR)",
  },
  {
    icon: AlertTriangle,
    title: "Сигурност и уязвимости",
    purpose: "Доклад за уязвимости, инциденти, злоупотреба. Виж и /well-known/security.txt.",
    email: EMAIL,
    sla: "потвърждение до 48 часа",
  },
  {
    icon: Scale,
    title: "Правни съобщения и рекламации",
    purpose: "Рекламации по ЗЗП, заявления за отказ (чл. 50 ЗЗП), правни уведомления.",
    email: EMAIL,
    sla: "до 14 календарни дни (чл. 125 ЗЗП)",
  },
];

export default function Contacts() {
  return (
    <LegalLayout
      title="Контакти"
      description="Официални канали за връзка с Dogovori.net — поддръжка, GDPR права, сигурност, правни съобщения и рекламации."
      basis={["ЗЕТ чл. 4", "ЗЗП чл. 4", "GDPR чл. 13, ал. 1"]}
    >
      <h2>1. Търговец</h2>
      <div className="not-prose my-4 rounded-lg border border-border/60 bg-card/40 p-4 text-sm">
        <div className="flex items-start gap-3">
          <Building2 className="mt-0.5 h-5 w-5 text-gold" />
          <div className="space-y-1">
            <p className="font-semibold">{COMPANY}</p>
            <p className="text-muted-foreground">ЕИК: {EIK}</p>
            <p className="text-muted-foreground">{ADDRESS}</p>
            <p>
              <a href={`mailto:${EMAIL}`} className="text-gold hover:underline">
                {EMAIL}
              </a>
            </p>
          </div>
        </div>
      </div>

      <h2>2. Канали за връзка</h2>
      <p>
        Използваме единен email за всички запитвания, но моля посочете темата на
        писмото си, за да бъде насочено към правилния екип и обработено в срок:
      </p>

      <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
        {CHANNELS.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.title}
              className="rounded-lg border border-border/60 bg-card/40 p-4"
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 text-gold" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-sm font-semibold">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{c.purpose}</p>
                  <p className="text-xs">
                    <a href={`mailto:${c.email}`} className="text-gold hover:underline">
                      {c.email}
                    </a>
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Отговор: {c.sla}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <h2>3. Работно време</h2>
      <p>
        Обработваме запитвания <strong>понеделник–петък, 09:00–18:00 EET</strong>,
        с изключение на официалните празници в Република България. Съобщенията,
        получени извън това време, се обработват на следващия работен ден.
      </p>

      <h2>4. Ескалация към надзорни органи</h2>
      <p>
        Ако смятате, че не сме отговорили адекватно, имате право да подадете жалба
        до компетентния орган — пълен списък и адреси виж в{" "}
        <a href="/provider-info">Информация за доставчика</a> и{" "}
        <a href="/privacy">Политиката за поверителност</a>.
      </p>

      <h2>5. Официална кореспонденция</h2>
      <p>
        Изявления и уведомления с правно значение (прекратяване на договор, отказ,
        рекламации, съдебни съобщения) се изпращат в писмена форма — по email на{" "}
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a> или с препоръчано писмо на адреса
        по т. 1. Считат се за получени в деня на постъпване в inbox-а на
        Доставчика, съответно от датата на връчване по хартиен носител.
      </p>
    </LegalLayout>
  );
}
