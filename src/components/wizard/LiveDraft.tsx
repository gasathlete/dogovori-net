import type { Sector } from "@/data/sectors";

export function LiveDraft({
  sector,
  answers,
  generated,
}: {
  sector: Sector;
  answers: Record<string, string>;
  generated?: {
    title: string;
    preamble: string;
    clauses: { number: string; title: string; body: string }[];
    closing: string;
  } | null;
}) {
  // Live preview from current answers (before AI runs)
  const partyA = answers.party_a_name || `[${sector.parties.a}]`;
  const partyB = answers.party_b_name || `[${sector.parties.b}]`;

  if (generated) {
    return (
      <article className="legal-paper rounded-md p-8 shadow-elegant">
        <h1 className="text-center font-serif text-xl font-bold uppercase tracking-wide">
          {generated.title}
        </h1>
        <div className="my-4 gold-divider" />
        <p className="whitespace-pre-line text-sm leading-relaxed">{generated.preamble}</p>
        {generated.clauses.map((c) => (
          <section key={c.number} className="mt-6">
            <h2 className="font-serif text-base font-bold uppercase">
              {c.number} {c.title}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
          </section>
        ))}
        <div className="my-6 gold-divider" />
        <p className="text-sm italic">{generated.closing}</p>
        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-xs">
          <div>
            <div className="border-t border-foreground/40 pt-2">За {sector.parties.a}</div>
            <div className="mt-1 font-bold">{partyA}</div>
          </div>
          <div>
            <div className="border-t border-foreground/40 pt-2">За {sector.parties.b}</div>
            <div className="mt-1 font-bold">{partyB}</div>
          </div>
        </div>
      </article>
    );
  }

  // Skeleton live preview (pre-AI)
  return (
    <article className="legal-paper rounded-md p-8 shadow-elegant">
      <h1 className="text-center font-serif text-xl font-bold uppercase tracking-wide">
        {sector.contractName}
      </h1>
      <div className="my-4 gold-divider" />
      <p className="text-sm leading-relaxed">
        Днес, [ДАТА], в гр. София, между:
      </p>
      <p className="mt-3 text-sm leading-relaxed">
        <strong>1. {partyA}</strong>{answers.party_a_type ? ` — ${answers.party_a_type}` : ""},
        наричан по-долу „<em>{sector.parties.a}</em>“, и
      </p>
      <p className="mt-2 text-sm leading-relaxed">
        <strong>2. {partyB}</strong>{answers.party_b_type ? ` — ${answers.party_b_type}` : ""},
        наричан по-долу „<em>{sector.parties.b}</em>“,
      </p>
      <p className="mt-3 text-sm leading-relaxed">
        се сключи настоящият договор за следното:
      </p>

      <h2 className="mt-6 font-serif text-base font-bold uppercase">I. Предмет на договора</h2>
      <p className="mt-2 text-sm italic text-foreground/60">
        [Подробният текст ще бъде генериран от AI след завършване на интервюто.]
      </p>
      <h2 className="mt-6 font-serif text-base font-bold uppercase">II. Цена и плащане</h2>
      <p className="mt-2 text-sm italic text-foreground/60">[Очаква генериране…]</p>
      <h2 className="mt-6 font-serif text-base font-bold uppercase">III. Срокове</h2>
      <p className="mt-2 text-sm italic text-foreground/60">[Очаква генериране…]</p>
      <h2 className="mt-6 font-serif text-base font-bold uppercase">IV. Неустойки и прекратяване</h2>
      <p className="mt-2 text-sm italic text-foreground/60">[Очаква генериране…]</p>
      <h2 className="mt-6 font-serif text-base font-bold uppercase">V. Заключителни разпоредби</h2>
      <p className="mt-2 text-sm italic text-foreground/60">
        [Подсъдност, частична недействителност, форсмажор…]
      </p>
    </article>
  );
}
