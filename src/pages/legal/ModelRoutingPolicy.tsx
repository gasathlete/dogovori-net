import { LegalLayout } from "./LegalLayout";

export default function ModelRoutingPolicyPage() {
  return (
    <LegalLayout
      title="Политика за роутинг на AI модели"
      description="Кои AI модели се използват за всяка операция в Dogovori.net и как се прилагат правилата за fallback и риск."
    >
      <h2>1. Цел</h2>
      <p>
        Тази политика прозрачно описва кой AI модел се използва за всяка операция,
        кога се прилага fallback модел и какви ограничения важат при работа с
        чувствителни данни.
      </p>

      <h2>2. Таблица operation × модел</h2>
      <table className="my-4 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-left">
            <th className="py-2 pr-3">Операция</th>
            <th className="py-2 pr-3">Първичен модел</th>
            <th className="py-2 pr-3">Резервен (fallback)</th>
            <th className="py-2">При висок риск</th>
          </tr>
        </thead>
        <tbody className="text-foreground/80">
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3">generate-contract</td>
            <td className="py-2 pr-3">Gemini Flash</td>
            <td className="py-2 pr-3">Gemini Flash-Lite</td>
            <td className="py-2">Изисква псевдонимизация</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3">build-custom-contract</td>
            <td className="py-2 pr-3">Gemini Flash</td>
            <td className="py-2 pr-3">Gemini Flash-Lite</td>
            <td className="py-2">Изисква псевдонимизация + потвърждение</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3">analyze-contract</td>
            <td className="py-2 pr-3">Gemini Flash-Lite</td>
            <td className="py-2 pr-3">Gemini Flash</td>
            <td className="py-2">Само Flash-Lite + redaction</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3">apply-corrections</td>
            <td className="py-2 pr-3">Gemini Flash</td>
            <td className="py-2 pr-3">Gemini Flash-Lite</td>
            <td className="py-2">Pro блокиран при special category</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3">correct-uploaded</td>
            <td className="py-2 pr-3">Gemini Flash</td>
            <td className="py-2 pr-3">Gemini Flash-Lite</td>
            <td className="py-2">Pro блокиран при special category</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-2 pr-3">ocr-contract</td>
            <td className="py-2 pr-3">Gemini Flash (multimodal)</td>
            <td className="py-2 pr-3">—</td>
            <td className="py-2">Post-hoc класификация</td>
          </tr>
          <tr>
            <td className="py-2 pr-3">assistant-chat</td>
            <td className="py-2 pr-3">Gemini Flash-Lite</td>
            <td className="py-2 pr-3">Gemini Flash</td>
            <td className="py-2">Блокира special category</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Fallback правила</h2>
      <ul>
        <li>
          Fallback се активира при HTTP 5xx, rate limit (429) или timeout от
          първичния модел.
        </li>
        <li>
          Fallback моделът работи със същия псевдонимизиран payload — никога с
          оригиналния текст.
        </li>
        <li>
          Pro моделите (Gemini Pro, GPT-4 class) се използват само след изрично
          потвърждение и пълна редакция.
        </li>
        <li>
          При повторен срив на fallback верига операцията се отменя и квотата се
          възстановява.
        </li>
      </ul>

      <h2>4. Ограничения по риск</h2>
      <ul>
        <li>
          <strong>Special category data (чл. 9 GDPR):</strong> Всички модели се
          блокират; операцията връща HTTP 422.
        </li>
        <li>
          <strong>Висок риск личн. данни:</strong> Само модели с активиран
          zero-data-retention режим.
        </li>
        <li>
          <strong>Среден риск:</strong> Псевдонимизация задължителна, fallback
          позволен.
        </li>
        <li>
          <strong>Нисък риск (генерични шаблони без PII):</strong> Всички
          разрешени модели.
        </li>
      </ul>

      <h2>5. Промени в политиката</h2>
      <p>
        Промени в роутинг политиката се публикуват на тази страница и се
        отразяват в <a href="/legal/subprocessors">регистъра на подпроцесорите</a>.
      </p>
    </LegalLayout>
  );
}
