import { BrandMark } from "@/components/BrandLogo";

export type WorkflowDocumentKind = "invitation" | "contract";

/** Adapted from BrandedDocumentShowcase, not a recovered customer document.
 * No contact identifiers, signature, signing claim or legal approval. */
export function WorkflowDocument({ kind, branded }: { kind: WorkflowDocumentKind; branded: boolean }) {
  const invitation = kind === "invitation";
  return (
    <article className={`workflow-letter workflow-paper ${branded ? "workflow-letter-branded" : ""}`} aria-label={invitation ? "Примерна покана за сътрудничество" : "Примерен откъс от документ за услуги"}>
      <header className="workflow-letterhead">
        <div className="flex min-w-0 items-center gap-3">
          {branded && <span className="workflow-im-mark" aria-hidden="true">ИМ</span>}
          <div className="min-w-0"><p className="font-serif text-lg font-bold">{branded ? "IM Development" : "Вашата фирма"}</p><p className="text-xs text-muted-foreground">{branded ? "Иванов и Милев Пропърти Девелъпмънт" : "Документ за Вашата работа"}</p></div>
        </div>
        {branded && <BrandMark decorative className="h-10 w-12" />}
      </header>
      <div className="workflow-letter-body">
        <p className="text-xs text-muted-foreground">Изх. № ПРИМЕР–01 / 02.09.2026 г.</p>
        <p className="mt-4 text-sm">До екипа на <strong>Договори.нет</strong></p>
        <h3 className="mt-4 font-serif text-2xl font-bold leading-tight">{invitation ? "Покана за сътрудничество" : "Договор за услуги"}</h3>
        <p className="mt-2 text-xs text-muted-foreground">{invitation ? "Относно: подготовка и обмен на фирмени документи" : "Откъс · предмет, приемане и промени в работата"}</p>
        <div className="workflow-letter-prose mt-5">
          {invitation ? <>
            <p>Уважаеми колеги,</p>
            <p>От името на IM Development Ви отправяме покана да обсъдим сътрудничество при подготовката на документите за нашата ежедневна работа.</p>
            <p>За нас е важно предложенията, договорите и протоколите да имат ясен текст и последователен фирмен облик. Предлагаме разговор по следните теми:</p>
            <ol><li>Подбор на образци за наеми, услуги и приемане на извършена работа.</li><li>Попълване на условията за конкретния случай и преглед на документа.</li><li>Прилагане на фирмено лого и стил при оформяне на PDF и DOCX.</li></ol>
            <p>Ако предложението представлява интерес, нека уточним обхвата и следващите стъпки в удобен за двете страни разговор.</p>
          </> : <>
            <p>Възложителят и Изпълнителят уточняват следните примерни условия за изработка на фирмена презентация:</p>
            <ol><li><strong>Предмет.</strong> Изпълнителят подготвя текст и оформление на презентация от 10 страници по предоставени от Възложителя материали.</li><li><strong>Срок и цена.</strong> Първият вариант се предава до 15 работни дни след получаване на материалите. Примерното възнаграждение е 600 € с ДДС.</li><li><strong>Приемане.</strong> Възложителят изпраща писмени бележки в срок от 5 работни дни. Приемането на работата се удостоверява с отделен протокол.</li><li><strong>Промени.</strong> Допълнителни страници, срокове и възнаграждение се уточняват писмено преди започване на допълнителната работа.</li></ol>
            <p>Този откъс показва структурата, а не всички условия на документ за услуги.</p>
          </>}
        </div>
        <div className="workflow-signature"><p className="text-xs text-muted-foreground">{invitation ? "С уважение," : "За страните:"}</p><div className="mt-4 w-40 border-b border-border" /><p className="mt-1 text-xs text-muted-foreground">Място за подпис · без подпис</p></div>
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground"><span>{branded ? "IM Development · примерен фирмен стил" : "Примерно оформление"}</span><span className="shrink-0">1 / 1</span></footer>
    </article>
  );
}
