import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Документите валидни ли са пред НАП, съд и нотариус?",
    a: "Да. Всички шаблони са изготвени съгласно ЗЗД, ТЗ, ЗУТ и относимото законодателство и са валидни за подаване пред НАП, съд и нотариус, когато са попълнени с коректни данни и подписани по предвидения от закона начин.",
  },
  {
    q: "Какво се случва с моите данни?",
    a: "Данните Ви се съхраняват криптирано в защитен европейски сървър (GDPR-съвместимо). Не споделяме съдържанието на договорите Ви с трети лица. Можете да изтриете акаунта си и всички свързани документи по всяко време.",
  },
  {
    q: "Мога ли да спра абонамента по всяко време?",
    a: "Да. Абонаментът се прекратява с един клик от профила Ви и не се удължава автоматично след отмяна. Заплатеният период остава активен до края на месеца.",
  },
  {
    q: "Какво е безплатно и какво плащам?",
    a: "Получавате 5 безплатни операции при регистрация + 2/месец. Една операция = един изтеглен или анализиран документ. Професионалист — 12.90 €/мес. (50 операции), Предприемач — 19.90 €/мес. (120 операции, GPT-5, Premium 24/7), Екип — 109 €/място/год. (мин. 3 места = 327 €/год.), или еднократен пакет от 5 операции за 2.90 €. Всички цени са с ДДС.",
  },
  {
    q: "Имам ли право на корекции след генериране?",
    a: "Да. Всеки документ може да бъде преразглеждан и редактиран. Корекциите в рамките на същата сесия и документ са безплатни — нова вълна от AI-корекции се таксува като отделна операция.",
  },
  {
    q: "Електронният подпис правно обвързващ ли е в България?",
    a: "Да. Електронният подпис, изграден в платформата, е съобразен с Регламент (ЕС) 910/2014 (eIDAS) и Закона за електронния документ и електронните удостоверителни услуги, и е правно обвързващ за всички видове стандартни договори.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="container py-20 sm:py-24 md:py-28">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="eyebrow mb-3 justify-center">Често задавани въпроси</div>
        <h2 className="font-serif text-3xl font-bold leading-tight text-balance sm:text-4xl md:text-5xl">
          Всичко, което може да Ви спре — изяснено
        </h2>
      </div>
      <div className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible className="space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="rounded-lg border border-border/60 bg-card/40 px-4 sm:px-6"
            >
              <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline sm:text-[15px]">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

export function buildFaqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}
