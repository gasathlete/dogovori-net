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
    <section id="faq" className="container py-14 sm:py-20">
      <div className="mb-8 max-w-2xl">
        <h2 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">Често задавани въпроси</h2>
      </div>

      <div className="max-w-3xl space-y-10">
        {/* Как работи системата — част от FAQ, не отделна секция */}
        <div id="process">
          <h3 className="mb-3 font-serif text-lg font-bold text-foreground sm:text-xl">
            Как работи системата — 6 стъпки
          </h3>
          <Accordion type="single" collapsible className="border-t border-foreground/80">
            {PROCESS_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <AccordionItem
                  key={step.n}
                  value={`step-${i}`}
                  className="border-b border-border"
                >
                  <AccordionTrigger className="text-left hover:no-underline">
                    <span className="flex items-center gap-3">
                      <span className="hidden">
                        <Icon className="h-3.5 w-3.5 text-gold" strokeWidth={1.8} />
                      </span>
                      <span className="text-sm font-semibold sm:text-[15px]">
                        <span className="mr-2 font-serif text-sm text-gold">
                          Стъпка {step.n}
                        </span>
                        {step.title}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                    <p>{step.text}</p>
                    <p className="mt-2 border-l-2 border-border pl-3 text-sm leading-relaxed">
                      <span className="font-semibold text-foreground">
                        Подробно:{" "}
                      </span>
                      {step.detail}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>

        <Accordion type="single" collapsible className="border-t border-foreground/80">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="border-b border-border"
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
