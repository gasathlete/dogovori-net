import { LegalLayout } from "./LegalLayout";
import { Link } from "react-router-dom";

interface Item {
  to: string;
  title: string;
  desc: string;
}

interface Section {
  code: string;
  title: string;
  intro: string;
  items: Item[];
}

const SECTIONS: Section[] = [
  {
    code: "ЗЗП",
    title: "Защита на потребителите",
    intro:
      "Закон за защита на потребителите (ЗЗП) — задължителна преддоговорна информация, право на отказ (чл. 50–57), алтернативно решаване на спорове (ОРС/ODR).",
    items: [
      { to: "/refund", title: "Възстановяване и отказ", desc: "Условия за 14-дневен отказ при дигитално съдържание (чл. 57 ЗЗП) и възстановяване." },
      { to: "/withdrawal-form", title: "Стандартен формуляр за отказ", desc: "Образец по Приложение № 6 към чл. 47, ал. 1, т. 8 ЗЗП." },
      { to: "/provider-info", title: "Идентификация на търговеца", desc: "Преддоговорна информация по чл. 47 ЗЗП и чл. 4 ЗЕТ." },
      { to: "/contacts", title: "Контакти и жалби", desc: "Канали за връзка и подаване на жалби. ОРС платформа на ЕК." },
    ],
  },
  {
    code: "ЗЕТ",
    title: "Електронна търговия",
    intro:
      "Закон за електронната търговия (ЗЕТ) — изисквания за идентификация на доставчика, ред за сключване на електронен договор, отговорност на междинни доставчици.",
    items: [
      { to: "/terms", title: "Общи условия", desc: "Условия за ползване по чл. 16 ЗЗД във вр. с чл. 5 ЗЕТ." },
      { to: "/provider-info", title: "Информация за доставчика", desc: "Чл. 4, ал. 1 ЗЕТ — пълни идентификационни данни." },
      { to: "/legal/changelog", title: "История на промените", desc: "Версиониране и информиране за изменения." },
    ],
  },
  {
    code: "GDPR",
    title: "Защита на личните данни",
    intro:
      "Регламент (ЕС) 2016/679 (GDPR) и Закон за защита на личните данни (ЗЗЛД) — права на субектите, основания за обработка, регистри, оценки на въздействието.",
    items: [
      { to: "/privacy", title: "Политика за поверителност", desc: "Чл. 13–14 GDPR — информация при събиране на данни." },
      { to: "/dpa", title: "DPA (Споразумение за обработка)", desc: "Чл. 28 GDPR — отношения администратор/процесор." },
      { to: "/cookies", title: "Бисквитки и проследяване", desc: "Чл. 4а ЗЕС и чл. 7 GDPR — съгласие за non-essential cookies." },
      { to: "/legal/ropa", title: "ROPA (Регистър на дейностите)", desc: "Чл. 30 GDPR." },
      { to: "/legal/dpia-summary", title: "DPIA — обобщение", desc: "Чл. 35 GDPR — оценка на въздействието." },
      { to: "/legal/retention", title: "Политика за съхранение", desc: "Чл. 5, ал. 1, б. \u201eд\u201c GDPR — ограничение на съхранението." },
      { to: "/legal/subprocessors", title: "Подпроцесори", desc: "Чл. 28, ал. 2 GDPR — регистър на подпроцесорите." },
      { to: "/legal/incident-response", title: "Инциденти с данни", desc: "Чл. 33–34 GDPR — уведомяване в 72 ч." },
    ],
  },
  {
    code: "AI",
    title: "AI прозрачност и сигурност",
    intro:
      "Регламент (ЕС) 2024/1689 (AI Act) и принципи за обяснимост — нормативна база, маршрутизация на модели, постоянен надзор.",
    items: [
      { to: "/legal/ai-processing", title: "AI обработка", desc: "Какви данни се подават към моделите и при какви гаранции." },
      { to: "/legal/model-routing", title: "Маршрутизация на модели", desc: "Кой модел отговаря за коя задача и защо." },
      { to: "/legal/knowledge-base", title: "Нормативна база (RAG)", desc: "Списък на индексираните актове и версии." },
      { to: "/legal/security", title: "Сигурност", desc: "Технически и организационни мерки (чл. 32 GDPR)." },
    ],
  },
];

const HIERARCHY = [
  { level: "1", label: "Конституция на РБ", note: "Върховен закон; международни договори (ЕКПЧ)." },
  { level: "2", label: "Право на ЕС", note: "Регламенти (GDPR, AI Act), Директиви, решения на СЕС — примат." },
  { level: "3", label: "Кодекси и закони", note: "ЗЗД, ТЗ, ЗУТ, КТ, ГПК, ЗЗП, ЗЕТ, ЗЗЛД." },
  { level: "4", label: "Подзаконови актове", note: "Наредби, правилници, постановления на МС." },
  { level: "5", label: "Задължителна практика", note: "Тълкувателни решения на ВКС/ВАС." },
  { level: "6", label: "Незадължителна практика", note: "Отделни решения на ВКС/ВАС/окръжни съдилища." },
];

export default function LegalIndexPage() {
  return (
    <LegalLayout
      title="Правна рамка"
      description="Йерархична карта на правната информация на Dogovori.net — по ЗЗП, ЗЕТ, GDPR, AI Act и съдебна практика."
      basis={["Конституция", "ЕС право", "ЗЗП", "ЗЕТ", "GDPR", "AI Act"]}
    >
      <p>
        Тази страница е централната карта на цялата правна информация на платформата.
        Документите са организирани по приложимия нормативен акт, спазвайки официалната
        йерархия на източниците на правото.
      </p>

      <h2>Йерархия на източниците</h2>
      <ol className="my-4 list-decimal space-y-2 pl-5">
        {HIERARCHY.map((h) => (
          <li key={h.level}>
            <strong>{h.label}</strong> — <span className="text-foreground/70">{h.note}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        При конфликт между общ и специален закон — <em>lex specialis</em> има предимство.
        При конфликт между национален и ЕС акт — правото на ЕС има примат (чл. 5, ал. 4
        от Конституцията).
      </p>

      {SECTIONS.map((s) => (
        <section key={s.code} className="mt-10">
          <h2 className="!mt-0">
            <span className="mr-2 inline-flex items-center rounded border border-gold/40 bg-gold/5 px-2 py-0.5 text-sm font-medium text-foreground/80">
              {s.code}
            </span>
            {s.title}
          </h2>
          <p className="text-sm text-foreground/80">{s.intro}</p>
          <ul className="!my-4 !list-none !pl-0">
            {s.items.map((it) => (
              <li key={it.to} className="!my-0 border-b border-border/30 py-3 last:border-0">
                <Link to={it.to} className="!no-underline">
                  <div className="font-semibold text-foreground hover:text-gold">{it.title}</div>
                  <div className="text-xs text-muted-foreground">{it.desc}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <h2>Извънсъдебно решаване на спорове</h2>
      <p>
        В съответствие с чл. 181н ЗЗП и Регламент (ЕС) № 524/2013, потребителите имат
        достъп до европейската платформа за <strong>онлайн решаване на потребителски
        спорове (ОРС/ODR)</strong>:{" "}
        <a
          href="https://ec.europa.eu/consumers/odr"
          target="_blank"
          rel="noopener noreferrer"
        >
          ec.europa.eu/consumers/odr
        </a>
        . Компетентен орган в България —{" "}
        <a
          href="https://kzp.bg"
          target="_blank"
          rel="noopener noreferrer"
        >
          Комисия за защита на потребителите (КЗП)
        </a>
        .
      </p>

      <h2>Надзорен орган за лични данни</h2>
      <p>
        Комисия за защита на личните данни (КЗЛД) — гр. София, бул. „Проф. Цветан Лазаров"
        № 2,{" "}
        <a href="https://www.cpdp.bg" target="_blank" rel="noopener noreferrer">
          cpdp.bg
        </a>
        . Имате право на жалба съгласно чл. 77 GDPR.
      </p>
    </LegalLayout>
  );
}
