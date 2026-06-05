// Bulgarian legal-terms glossary index — programmatic SEO.
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Seo } from "@/components/Seo";
import { breadcrumbSchema } from "@/lib/jsonLd";
import { Header } from "@/components/Header";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface Term { slug: string; term: string; short_definition: string }

export default function Glossary() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("glossary_terms")
      .select("slug, term, short_definition")
      .eq("published", true)
      .order("term")
      .then(({ data }) => { setTerms((data as any) ?? []); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return terms;
    const needle = q.toLowerCase();
    return terms.filter((t) => t.term.toLowerCase().includes(needle) || t.short_definition.toLowerCase().includes(needle));
  }, [terms, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, Term[]>();
    for (const t of filtered) {
      const letter = (t.term[0] ?? "?").toUpperCase();
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(t);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "bg"));
  }, [filtered]);

  return (
    <div className="min-h-screen">
      <Seo
        title="Юридически речник — основни термини в българското право"
        description="Безплатен онлайн речник на често използвани правни термини в България: договори, гражданско право, трудово право, GDPR и др."
        canonical="/rechnik"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "DefinedTermSet",
            name: "Юридически речник — Dogovori.net",
            inDefinedTermSet: terms.map((t) => ({
              "@type": "DefinedTerm",
              name: t.term,
              description: t.short_definition,
              url: `https://dogovori.net/rechnik/${t.slug}`,
            })),
          },
          breadcrumbSchema([
            { name: "Начало", url: "/" },
            { name: "Речник" },
          ]),
        ]}
      />
      <Header />
      <main className="container max-w-4xl py-10 space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-serif">Юридически речник</h1>
          <p className="text-muted-foreground">Кратки и ясни определения на най-често срещаните правни термини в българското право.</p>
          <Input placeholder="Търсене на термин…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
        </header>

        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        ) : grouped.length === 0 ? (
          <p className="text-muted-foreground">Няма открити термини.</p>
        ) : (
          <div className="space-y-8">
            {grouped.map(([letter, list]) => (
              <section key={letter}>
                <h2 className="text-xl font-serif text-gold mb-3">{letter}</h2>
                <ul className="space-y-3">
                  {list.map((t) => (
                    <li key={t.slug}>
                      <Link to={`/rechnik/${t.slug}`} className="block group">
                        <div className="font-semibold group-hover:text-gold transition-colors">{t.term}</div>
                        <div className="text-sm text-muted-foreground line-clamp-2">{t.short_definition}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
