import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQ_ITEMS, buildFaqJsonLd } from "@/data/faqItems";
import { PROCESS_STEPS } from "@/data/processSteps";

// Re-export so existing imports `import { FAQ_ITEMS, buildFaqJsonLd } from "@/components/FAQ"`
// keep working, while Index.tsx can import directly from "@/data/faqItems" to avoid
// pulling the FAQ React component into the main entry bundle.
export { FAQ_ITEMS, buildFaqJsonLd };

export function FAQ() {
  return (
    <section id="faq" className="container py-12 sm:py-16 md:py-20">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="eyebrow mb-3 justify-center">
          <span className="section-number font-serif text-base font-normal tracking-normal text-gold/60">10</span>
          <span className="h-px w-6 bg-gold/40" />
          Често задавани въпроси
        </div>
        <h2 className="font-serif text-3xl font-bold leading-tight text-balance sm:text-4xl md:text-5xl">
          Вашите въпроси ?
        </h2>
      </div>

      <div className="mx-auto max-w-3xl space-y-8">
        {/* Как работи системата — част от FAQ, не отделна секция */}
        <div id="process">
          <h3 className="mb-3 text-center font-serif text-lg font-bold text-foreground sm:text-xl">
            Как работи системата — 6 стъпки
          </h3>
          <Accordion type="single" collapsible className="space-y-2">
            {PROCESS_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <AccordionItem
                  key={step.n}
                  value={`step-${i}`}
                  className="rounded-lg border border-border/60 bg-card/40 px-4 sm:px-6"
                >
                  <AccordionTrigger className="text-left hover:no-underline">
                    <span className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10">
                        <Icon className="h-3.5 w-3.5 text-gold" strokeWidth={1.8} />
                      </span>
                      <span className="text-sm font-semibold sm:text-[15px]">
                        <span className="mr-2 font-serif text-xs uppercase tracking-[0.18em] text-gold/70">
                          Стъпка {step.n}
                        </span>
                        {step.title}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="max-w-prose pl-11 text-sm leading-relaxed text-muted-foreground">
                    <p>{step.text}</p>
                    <p className="mt-2 rounded-md border border-gold/20 bg-gold/5 p-3 text-xs leading-relaxed">
                      <span className="font-semibold uppercase tracking-[0.16em] text-gold/80">
                        Под капака:{" "}
                      </span>
                      {step.detail}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>

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
