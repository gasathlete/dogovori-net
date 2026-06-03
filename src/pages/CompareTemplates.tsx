// Compare two templates side-by-side. Routes:
//   /sravni            — picker
//   /sravni/:a/vs/:b   — comparison view (programmatic SEO)
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allTemplates, getTemplateBySlug, type TemplateEntry } from "@/lib/templateIndex";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";

function rows(a: TemplateEntry, b: TemplateEntry) {
  return [
    { label: "Категория", a: a.category.title, b: b.category.title },
    { label: "Сектор", a: a.category.sectorId ?? "—", b: b.category.sectorId ?? "—" },
    { label: "Цел", a: a.doc.purpose ?? "", b: b.doc.purpose ?? "" },
    { label: "Ключова клауза", a: a.doc.keyClause ?? "", b: b.doc.keyClause ?? "" },
    { label: "Двуезичен", a: a.doc.bilingual ? "Да" : "Не", b: b.doc.bilingual ? "Да" : "Не" },
  ];
}


export default function CompareTemplates() {
  const { a, b } = useParams();
  const navigate = useNavigate();
  const all = useMemo(() => allTemplates(), []);

  if (!a || !b) {
    return <ComparePicker all={all} />;
  }

  const ta = getTemplateBySlug(a);
  const tb = getTemplateBySlug(b);
  if (!ta || !tb) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container py-12 text-center space-y-3">
          <h1 className="text-2xl font-serif">Невалидно сравнение</h1>
          <Link to="/sravni" className="text-gold hover:underline">Избери два шаблона →</Link>
        </main>
      </div>
    );
  }

  const title = `${ta.doc.name} vs ${tb.doc.name} — сравнение`;
  const desc = `Сравнение между „${ta.doc.name}“ и „${tb.doc.name}“: категория, тип, приложимост и кога да изберете кой образец.`;

  return (
    <div className="min-h-screen">
      <Seo
        title={title}
        description={desc}
        canonical={`/sravni/${ta.slug}/vs/${tb.slug}`}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: title,
          description: desc,
        }}
      />
      <Header />
      <main className="container max-w-5xl py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-serif">{ta.doc.name} <span className="text-muted-foreground">срещу</span> {tb.doc.name}</h1>
          <p className="text-muted-foreground">{desc}</p>
        </header>

        <section className="grid md:grid-cols-2 gap-4">
          {[ta, tb].map((t) => (
            <article key={t.slug} className="border rounded-lg p-5 bg-card space-y-3">
              <h2 className="font-serif text-xl">{t.doc.name}</h2>
              <p className="text-sm text-muted-foreground">{t.doc.purpose}</p>
              <Button asChild size="sm"><Link to={`/shablon/${t.slug}`}>Виж образеца <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
            </article>
          ))}
        </section>

        <section>
          <h2 className="font-serif text-2xl mb-3">Сравнителна таблица</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr><th className="p-3 text-left">Характеристика</th><th className="p-3 text-left">{ta.doc.name}</th><th className="p-3 text-left">{tb.doc.name}</th></tr>
              </thead>
              <tbody className="divide-y">
                {rows(ta, tb).map((r) => (
                  <tr key={r.label}>
                    <td className="p-3 font-medium">{r.label}</td>
                    <td className="p-3">{r.a}</td>
                    <td className="p-3">{r.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border rounded-lg p-5 bg-card space-y-3">
          <h2 className="font-serif text-xl">Кога да изберете кой?</h2>
          <ul className="text-sm space-y-2">
            <li><CheckCircle2 className="h-4 w-4 text-emerald-600 inline mr-2" /><strong>{ta.doc.name}</strong> е подходящ, когато сте в категория „{ta.category.title}“.</li>
            <li><CheckCircle2 className="h-4 w-4 text-emerald-600 inline mr-2" /><strong>{tb.doc.name}</strong> е подходящ, когато сте в категория „{tb.category.title}“.</li>
            <li><XCircle className="h-4 w-4 text-destructive inline mr-2" /> Никой от двата не заменя индивидуална правна консултация.</li>
          </ul>
        </section>

        <p className="text-sm">
          <Link to="/sravni" className="text-gold hover:underline">← Избери други шаблони</Link>
        </p>
      </main>
    </div>
  );
}

function ComparePicker({ all }: { all: TemplateEntry[] }) {
  const navigate = useNavigate();
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return all.filter((t) => !needle || t.doc.name.toLowerCase().includes(needle)).slice(0, 30);
  }, [all, q]);

  function go() {
    if (a && b && a !== b) navigate(`/sravni/${a}/vs/${b}`);
  }

  return (
    <div className="min-h-screen">
      <Seo
        title="Сравни два шаблона на договори"
        description="Изберете два юридически образеца и вижте разликите им един до друг — категория, приложимост, кога да изберете кой."
        canonical="/sravni"
      />
      <Header />
      <main className="container max-w-3xl py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-serif">Сравни два шаблона</h1>
          <p className="text-muted-foreground">Изберете два образеца, за да видите разликите им един до друг.</p>
        </header>

        <Input placeholder="Търси шаблон…" value={q} onChange={(e) => setQ(e.target.value)} />

        <div className="grid md:grid-cols-2 gap-6">
          {(["А", "Б"] as const).map((label, i) => (
            <div key={label} className="space-y-2">
              <h2 className="font-semibold">Шаблон {label}</h2>
              <div className="border rounded-lg max-h-80 overflow-auto divide-y">
                {filtered.map((t) => {
                  const sel = (i === 0 ? a : b) === t.slug;
                  return (
                    <button
                      key={t.slug}
                      onClick={() => (i === 0 ? setA(t.slug) : setB(t.slug))}
                      className={`w-full text-left p-3 text-sm hover:bg-muted/40 ${sel ? "bg-gold/10 font-semibold" : ""}`}
                    >
                      {t.doc.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <Button onClick={go} disabled={!a || !b || a === b}>Сравни →</Button>
      </main>
    </div>
  );
}
