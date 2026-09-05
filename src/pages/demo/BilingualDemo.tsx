import { Link } from "react-router-dom";
import { Languages, ArrowRight, FileText, Library } from "@/icons";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";

const ROWS: Array<{ bg: string; en: string }> = [
  {
    bg: "Чл. 1. Предмет. Изпълнителят се задължава срещу възнаграждение да предостави на Възложителя услугите, описани в Приложение № 1.",
    en: "Art. 1. Subject. The Contractor undertakes, for a fee, to provide the Client with the services described in Annex 1.",
  },
  {
    bg: "Чл. 2. Срок. Договорът се сключва за срок от 12 (дванадесет) месеца, считано от датата на подписване.",
    en: "Art. 2. Term. This Agreement is concluded for a term of 12 (twelve) months from the signature date.",
  },
  {
    bg: "Чл. 3. Възнаграждение. Възложителят заплаща месечна такса в размер на 2 500,00 EUR без ДДС.",
    en: "Art. 3. Fee. The Client shall pay a monthly fee of EUR 2,500.00 excluding VAT.",
  },
  {
    bg: "Чл. 4. Конфиденциалност. Страните се задължават да пазят в тайна цялата информация, получена във връзка с изпълнението.",
    en: "Art. 4. Confidentiality. The Parties undertake to keep confidential all information received in connection with the performance.",
  },
  {
    bg: "Чл. 5. Приложимо право. Договорът се урежда от българското право. Споровете се решават от АС при БТПП — София.",
    en: "Art. 5. Governing law. This Agreement is governed by Bulgarian law. Disputes shall be settled by the Arbitration Court at BCCI — Sofia.",
  },
];

export default function BilingualDemo() {
  return (
    <div className="min-h-dvh bg-background">
      <Seo
        title="Двуезични договори · Пример BG/EN — Dogovori.net"
        description="Вижте как изглежда професионален двуезичен договор BG/EN — клауза по клауза. Създайте свой с DogovaryAI за минути."
        canonical="/demo/bilingual"
      />
      <Header />
      <main className="container max-w-6xl py-10 sm:py-14">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
          <Languages className="h-3.5 w-3.5" /> Пример · Двуезичен договор
        </div>
        <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">
          Договор на два езика — <span className="text-accent-gradient">с еднаква правна сила</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          DogovaryAI генерира паралелни клаузи BG/EN (или DE, FR) с професионален юридически превод и
          номерация, готови за подпис от чуждестранен партньор.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/build?bilingual=1"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-gold px-5 py-2.5 text-sm font-semibold text-navy shadow-gold hover:opacity-95"
          >
            <FileText className="h-4 w-4" /> Създай свой двуезичен договор
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/catalog?bilingual=1"
            className="inline-flex items-center gap-2 rounded-lg border border-gold/40 px-5 py-2.5 text-sm font-semibold text-gold hover:bg-gold/10"
          >
            <Library className="h-4 w-4" /> Двуезични в каталога
          </Link>
        </div>

        <section className="mt-10 overflow-hidden rounded-2xl border border-border/60 bg-card/50">
          <div className="grid grid-cols-2 border-b border-border/60 bg-muted/30 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Български</div>
            <div className="border-l border-border/60 pl-4">English</div>
          </div>
          <ul>
            {ROWS.map((r, i) => (
              <li
                key={i}
                className="grid grid-cols-2 border-b border-border/40 px-4 py-4 text-sm leading-relaxed last:border-b-0 hover:bg-muted/20"
              >
                <p className="pr-4 text-foreground">{r.bg}</p>
                <p className="border-l border-border/40 pl-4 text-foreground/90">{r.en}</p>
              </li>
            ))}
          </ul>
          <div className="border-t border-border/60 bg-muted/20 px-4 py-3 text-[11px] text-muted-foreground">
            Пример. Реалните документи се персонализират по ваши данни и сектор.
          </div>
        </section>

        <div className="mt-10 rounded-xl border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent p-6 text-center">
          <h2 className="font-serif text-2xl font-bold">Готов за международния си партньор?</h2>
          <p className="mt-2 text-sm text-muted-foreground">Двуезични шаблони · 600+ в каталога · безплатен старт.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link to="/build?bilingual=1" className="inline-flex items-center gap-2 rounded-lg bg-gradient-gold px-6 py-3 text-sm font-semibold text-navy">
              Създай документ <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/catalog?bilingual=1" className="inline-flex items-center gap-2 rounded-lg border border-gold/40 px-6 py-3 text-sm font-semibold text-gold hover:bg-gold/10">
              Виж двуезични шаблони
            </Link>
          </div>
        </div>
      </main>
      <SeoFooter />
    </div>
  );
}
