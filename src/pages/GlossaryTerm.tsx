// Single glossary term page — /rechnik/:slug
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Seo } from "@/components/Seo";
import { breadcrumbSchema } from "@/lib/jsonLd";
import { Header } from "@/components/Header";
import { allTemplates, getTemplateBySlug } from "@/lib/templateIndex";
import { Loader2 } from "@/icons";

interface Term {
  slug: string; term: string; short_definition: string; body_md: string;
  related_template_slugs: string[]; seo_title: string | null; seo_description: string | null;
}

export default function GlossaryTerm() {
  const { slug = "" } = useParams();
  const [term, setTerm] = useState<Term | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    supabase.from("glossary_terms")
      .select("*").eq("slug", slug).eq("published", true).maybeSingle()
      .then(({ data }) => {
        if (!data) setMissing(true); else setTerm(data as any);
        setLoading(false);
      });
  }, [slug]);

  if (loading) return <div className="min-h-dvh grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  if (missing || !term) {
    return (
      <div className="min-h-dvh">
        <Header />
        <main className="container py-12 text-center">
          <h1 className="text-2xl font-serif mb-2">Терминът не е намерен</h1>
          <Link to="/rechnik" className="text-gold hover:underline">← Към речника</Link>
        </main>
      </div>
    );
  }

  const related = (term.related_template_slugs ?? []).map((s) => getTemplateBySlug(s)).filter(Boolean);

  return (
    <div className="min-h-dvh">
      <Seo
        title={term.seo_title || `${term.term} — определение и значение`}
        description={term.seo_description || term.short_definition}
        canonical={`/rechnik/${term.slug}`}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "DefinedTerm",
            name: term.term,
            description: term.short_definition,
            inDefinedTermSet: { "@type": "DefinedTermSet", name: "Юридически речник — Dogovori.net" },
          },
          breadcrumbSchema([
            { name: "Начало", url: "/" },
            { name: "Речник", url: "/rechnik" },
            { name: term.term },
          ]),
        ]}
      />
      <Header />
      <main className="container max-w-3xl py-10 space-y-6">
        <nav className="text-sm text-muted-foreground">
          <Link to="/rechnik" className="hover:text-gold">Речник</Link> / <span>{term.term}</span>
        </nav>
        <header>
          <h1 className="text-3xl md:text-4xl font-serif mb-3">{term.term}</h1>
          <p className="text-lg text-muted-foreground">{term.short_definition}</p>
        </header>
        {term.body_md && (
          <article className="prose prose-sm max-w-none whitespace-pre-wrap font-serif text-foreground/90">
            {term.body_md}
          </article>
        )}
        {related.length > 0 && (
          <section className="border-t pt-6">
            <h2 className="font-semibold mb-3">Свързани образци</h2>
            <ul className="space-y-2">
              {related.map((r) => (
                <li key={r!.slug}>
                  <Link to={`/shablon/${r!.slug}`} className="text-gold hover:underline">{r!.doc.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
