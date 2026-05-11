import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ShieldCheck, Scale, Gavel, FileCheck2 } from "lucide-react";

const pillars = [
  {
    icon: Scale,
    title: "ЗЗД — Закон за задълженията и договорите",
    text: "Облигационни отношения, действителност, изпълнение, неустойка и прекратяване по чл. 1–319 ЗЗД.",
  },
  {
    icon: Gavel,
    title: "Търговски закон",
    text: "Търговски сделки, представителство, прокура и отговорност по чл. 286 и сл. ТЗ.",
  },
  {
    icon: FileCheck2,
    title: "ЗУТ и специални режими",
    text: "Строителство, ЗЗП, ЗЗЛД/GDPR, ЗЕДЕУУ — електронен подпис, ЗТРРЮЛНЦ.",
  },
];

const faqs = [
  {
    q: "На какъв правен стандарт отговарят договорите в Dogovori.net?",
    a: "Всички шаблони са съобразени с действащото българско законодателство — Закон за задълженията и договорите (ЗЗД), Търговски закон (ТЗ), Закон за устройство на територията (ЗУТ), Закон за защита на потребителите (ЗЗП), Регламент (ЕС) 2016/679 (GDPR) и Закона за електронния документ и електронните удостоверителни услуги (ЗЕДЕУУ).",
  },
  {
    q: "Какви защитни клаузи се включват по подразбиране?",
    a: "Частична недействителност (severability), форсмажор, конфиденциалност, приложимо право (българско), език на договора и компетентна юрисдикция — Софийски градски съд или Арбитражен съд при БТПП по избор на страните.",
  },
  {
    q: "Заместват ли договорите консултация с адвокат?",
    a: "Не. Dogovori.net предоставя професионално подготвени образци и AI асистенция за персонализация. За сделки с висока стойност, нестандартни условия или съдебни производства препоръчваме окончателен преглед от лицензиран адвокат.",
  },
  {
    q: "Признават ли се електронните подписи в България?",
    a: "Да. Прост, усъвършенстван и квалифициран електронен подпис имат правна сила съгласно eIDAS и ЗЕДЕУУ. Нашата платформа поддържа подписване с биометричен подпис в браузър и експорт към PDF с одиторска следа.",
  },
];

export function ComplianceSection() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <section id="compliance" className="container py-14 sm:py-16 md:py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-gradient-card p-8 shadow-elegant md:p-14">
        <div className="absolute inset-x-0 top-0 hairline-x" />

        <div className="text-center">
          <div className="eyebrow mb-4 justify-center">
            <ShieldCheck className="h-3.5 w-3.5" />
            Съответствие
          </div>
          <h2 className="font-serif text-xl font-bold leading-tight text-balance sm:text-2xl md:text-[32px]">
            Закон за задълженията и договорите · Търговски закон · ЗУТ
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground md:text-base">
            Всеки договор включва клаузи за частична недействителност, форсмажор и подсъдност (Софийски градски съд / Арбитраж при БТПП). В зависимост от казуса, препоръчваме окончателен преглед от лицензиран адвокат.
          </p>
        </div>

        <ul className="mt-10 grid gap-3 sm:grid-cols-3">
          {pillars.map(({ icon: Icon, title, text }) => (
            <li
              key={title}
              className="rounded-xl border border-hairline bg-card/40 p-4 text-left transition-colors hover:border-gold/30"
            >
              <div className="flex items-center gap-2 text-gold">
                <Icon className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">
                  {title.split(" — ")[0]}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <Accordion type="single" collapsible className="mx-auto max-w-3xl">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-hairline">
                <AccordionTrigger className="text-left text-sm font-medium hover:text-gold">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
