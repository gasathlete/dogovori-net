import { LegalLayout } from "./LegalLayout";

export default function AIProcessingPolicyPage() {
  return (
    <LegalLayout
      title="Политика за AI обработка"
      description="Как Dogovori.net използва изкуствен интелект — модели, защити, забранени категории документи и права на потребителя."
      basis={["Регламент (ЕС) 2024/1689 (AI Act)", "GDPR чл. 22", "GDPR чл. 13"]}
    >
      <h2>1. Цел и обхват</h2>
      <p>
        Тази политика описва принципите, по които платформата Dogovori.net използва
        системи за изкуствен интелект (AI) за генериране, анализ и корекция на
        правни документи в съответствие с Регламент (ЕС) 2024/1689 (AI Act),
        Регламент (ЕС) 2016/679 (GDPR) и приложимото българско законодателство.
      </p>

      <h2>2. AI операции</h2>
      <table className="my-4 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-left">
            <th className="py-2 pr-3">Операция</th>
            <th className="py-2 pr-3">Цел</th>
            <th className="py-2">Класификация (AI Act)</th>
          </tr>
        </thead>
        <tbody className="text-foreground/80">
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3">generate-contract</td>
            <td className="py-2 pr-3">Генериране на проект на договор</td>
            <td className="py-2">Limited risk (чл. 50)</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3">build-custom-contract</td>
            <td className="py-2 pr-3">Изграждане на договор по описание</td>
            <td className="py-2">Limited risk</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3">analyze-contract</td>
            <td className="py-2 pr-3">Анализ на риск и преглед</td>
            <td className="py-2">Limited risk</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3">apply-corrections</td>
            <td className="py-2 pr-3">Прилагане на предложени корекции</td>
            <td className="py-2">Limited risk</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3">correct-uploaded</td>
            <td className="py-2 pr-3">Корекция на качен договор</td>
            <td className="py-2">Limited risk</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3">ocr-contract</td>
            <td className="py-2 pr-3">Извличане на текст от PDF/снимка</td>
            <td className="py-2">Minimal risk</td>
          </tr>
          <tr>
            <td className="py-2 pr-3">assistant-chat</td>
            <td className="py-2 pr-3">Чат с правен асистент</td>
            <td className="py-2">Limited risk</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Защити преди AI заявка</h2>
      <ul>
        <li>
          <strong>Класификация:</strong> Всеки документ преминава през класификатор,
          който открива лични данни (ЕГН, ЕИК, IBAN, имена, адреси) и специални
          категории по чл. 9 GDPR (здраве, етнос, политически възгледи, синдикат,
          религия, сексуална ориентация, биометрия).
        </li>
        <li>
          <strong>Псевдонимизация:</strong> Откритите лични данни се заменят с
          placeholder-и (<code>&lt;NAME_1&gt;</code>, <code>&lt;EGN_1&gt;</code>,
          <code>&lt;IBAN_1&gt;</code> и др.) преди заявката към AI модела.
          Mapping-ът остава само в паметта на сесията и не се съхранява.
        </li>
        <li>
          <strong>Ограничаване (не „незаконно"):</strong> При откриване на специална
          категория лични данни по чл. 9 GDPR (здраве, биометрия, политически възгледи,
          религия и др.) автоматизираният AI анализ се отказва с код{" "}
          <code>422 blocked_special_category</code>. Това не означава, че данните са
          незаконни — просто платформата не поддържа автоматизирано обработване на
          такива категории. Събитието се записва в неутрален регистър{" "}
          <code>restricted_processing_events</code> с минимални метаданни (категория,
          функция, потребител) — без съдържание и без откъси.
        </li>
        <li>
          <strong>Изрично потвърждение:</strong> При засечени лични данни системата
          връща <code>428 confirmation_required</code> и показва диалог
          „Чувствителни данни" за съгласие от потребителя.
        </li>
      </ul>

      <h2>4. Модели и routing</h2>
      <p>
        Подробната таблица operation × model е публикувана на отделна страница{" "}
        <a href="/legal/model-routing">Политика за роутинг на модели</a>.
        Резюме:
      </p>
      <ul>
        <li><strong>Първичен:</strong> Google Gemini Flash (псевдонимизирани данни, ЕС регион когато е възможно).</li>
        <li><strong>Резерв:</strong> Google Gemini Flash-Lite при недостъпност на първичния.</li>
        <li><strong>OpenAI</strong> — резерв само при срив на Google и само с активиран Zero Data Retention API.</li>
        <li><strong>Pro/висок риск:</strong> Gemini Pro — само след допълнително потвърждение и пълна псевдонимизация.</li>
      </ul>

      <h2>5. Забранени документи</h2>
      <p>Не качвайте и не обработвайте чрез платформата:</p>
      <ul>
        <li>Лични карти, паспорти, СУМПС, удостоверения за раждане/брак.</li>
        <li>Медицински документи (болнични листове, ТЕЛК, рецепти, диагнози).</li>
        <li>Документи на деца под 18 г.</li>
        <li>Биометрични или ДНК данни.</li>
        <li>Документи, съдържащи квалифицирани лични данни на трети лица без правно основание.</li>
        <li>Класифицирана информация по ЗЗКИ.</li>
      </ul>

      <h2>6. Без обучение върху Ваши данни</h2>
      <p>
        Договорно сме изключили използването на Ваши данни за обучение на AI модели
        от страна на който и да е подпроцесор (Google, OpenAI). При AI доставчиците
        е активиран „zero data retention" режим.
      </p>

      <h2>7. Прозрачност и audit log</h2>
      <p>
        Всеки AI акт се записва в таблица <code>ai_audit_log</code> с метаданни
        (риск, модел, fallback, токени) <strong>без</strong> сурово съдържание.
        Можете да изтеглите своя AI лог през „Изтегли моите данни" в настройките.
      </p>

      <h2>8. Право на човешка намеса</h2>
      <p>
        Платформата НЕ взема автоматизирани решения с правни последици за Вас по
        смисъла на чл. 22 GDPR — окончателното решение е изцяло Ваше. При
        несъгласие с AI резултат имате право да поискате човешки преглед на
        email-а на администратора в срок до 30 дни.
      </p>

      <h2>9. Контакт</h2>
      <p>
        Email: <a href="mailto:imdevelopmentoffice@gmail.com">imdevelopmentoffice@gmail.com</a>
      </p>
    </LegalLayout>
  );
}
