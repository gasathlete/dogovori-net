import { LegalLayout } from "./LegalLayout";

export default function ProviderInfoPage() {
  return (
    <LegalLayout
      title="Информация за доставчика"
      description="Идентификационни данни на търговеца, който поддържа Dogovori.net, и компетентни органи за надзор."
      basis={["ЗЕТ чл. 4", "ЗЗП чл. 47", "ТЗ чл. 13"]}
    >
      <p>
        В съответствие с чл. 4 от Закона за електронната търговия (ЗЕТ) и чл. 52 от
        Закона за защита на потребителите (ЗЗП), Ви предоставяме пълна информация за
        търговеца, който управлява платформата „Dogovori.net".
      </p>

      <h2>1. Търговец (Доставчик)</h2>
      <ul>
        <li><strong>Наименование:</strong> „Иванов и Милев Пропърти Девелъпмент" ЕООД</li>
        <li><strong>Седалище и адрес на управление:</strong> гр. София, ж.к. Стрелбище, бул. България №13, ет. 1, магазин 4</li>
        <li><strong>ЕИК:</strong> 206957326</li>
        <li><strong>Представляващ (Управител):</strong> Даниел Милев</li>
        <li><strong>Електронна поща:</strong> <a href="mailto:imdevelopmentoffice@gmail.com">imdevelopmentoffice@gmail.com</a></li>
        <li><strong>Уебсайт:</strong> <a href="https://dogovori.net">https://dogovori.net</a></li>
      </ul>

      <h2>2. Регистрация по ДДС</h2>
      <p>
        Дружеството прилага действащия режим за облагане с ДДС според българското
        законодателство. Конкретният статус и идентификационен номер по ДДС (ако е
        приложим) се посочват върху всяка фактура.
      </p>

      <h2>3. Надзорни и компетентни органи</h2>
      <ul>
        <li>
          <strong>Комисия за защита на потребителите (КЗП)</strong> — за нарушения на
          ЗЗП и потребителски права.<br />
          гр. София 1000, ул. „Врабча“ № 1, ет. 3–5<br />
          Тел.: 02 933 05 65 · Гореща линия: 0700 111 22 / *2211 ·{" "}
          <a href="https://kzp.bg" target="_blank" rel="noopener noreferrer">kzp.bg</a>
        </li>
        <li>
          <strong>Комисия за защита на личните данни (КЗЛД)</strong> — за въпроси
          и жалби по GDPR/ЗЗЛД.<br />
          гр. София, бул. „Проф. Цветан Лазаров" № 2<br />
          Тел.: 02 / 91 53 518 · <a href="https://cpdp.bg" target="_blank" rel="noopener">cpdp.bg</a>
        </li>
        <li>
          <strong>Комисия за регулиране на съобщенията (КРС)</strong> — за услуги на
          информационното общество.<br />
          <a href="https://crc.bg" target="_blank" rel="noopener">crc.bg</a>
        </li>
      </ul>

      <h2>4. Извънсъдебно решаване на спорове (АРС)</h2>
      <p>
        При спор, който не може да бъде уреден чрез контакт с нас, потребителят може
        да се обърне към:
      </p>
      <ul>
        <li>
          <strong>Помирителна дейност на КЗП</strong> — общи и секторни помирителни
          комисии; редът, компетентността и адресите им са публикувани на{" "}
          <a href="https://kzp.bg/bg/pomiritelna-deynost" target="_blank" rel="noopener noreferrer">kzp.bg/bg/pomiritelna-deynost</a>.
        </li>
        <li>
          <strong>Портал на Европейската комисия за защита на потребителите (EU Consumer
          Redress)</strong> —{" "}
          <a href="https://consumer-redress.ec.europa.eu/index_bg" target="_blank" rel="noopener noreferrer">consumer-redress.ec.europa.eu</a>{" "}
          със{" "}
          <a href="https://consumer-redress.ec.europa.eu/list-alternative-dispute-resolution-adr-bodies_en?prefLang=bg" target="_blank" rel="noopener noreferrer">списък на признатите органи за АРС</a>{" "}
          в държавите членки. Порталът е информационен; процедурата се води пред
          избрания орган за АРС.
        </li>
      </ul>

      <h2>5. Език на услугата и договора</h2>
      <p>
        Услугата и сключваните чрез нея договори с Доставчика са на български език.
        Архив на сключените от потребителя договори и закупувания се пази в
        неговия профил.
      </p>
    </LegalLayout>
  );
}
