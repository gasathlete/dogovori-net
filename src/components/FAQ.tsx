import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQ_ITEMS, buildFaqJsonLd } from "@/data/faqItems";

// Re-export so existing imports `import { FAQ_ITEMS, buildFaqJsonLd } from "@/components/FAQ"`
// keep working, while Index.tsx can import directly from "@/data/faqItems" to avoid
// pulling the FAQ React component into the main entry bundle.
export { FAQ_ITEMS, buildFaqJsonLd };

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
