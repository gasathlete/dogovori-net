import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Library, ExternalLink, Loader2, Wand2, CheckCircle2, Package } from "@/icons";
import { useConsoleStore } from "@/hooks/useConsoleStore";
import { AddToKitDialog } from "@/components/AddToKitDialog";

export function TemplatePane({ slug }: { slug: string }) {
  const { openTab } = useConsoleStore();
  const [tpl, setTpl] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [kitOpen, setKitOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("template_search_index")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      setTpl(data);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tpl) {
    return <div className="p-6 text-sm text-muted-foreground">Шаблонът не е намерен.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Library className="h-3.5 w-3.5 text-gold" /> {tpl.category_title}
      </div>
      <h1 className="mt-1 font-serif text-2xl font-bold">{tpl.name}</h1>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {tpl.bilingual && (
          <span className="rounded-full border border-blue-500/30 bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-300">
            Двуезичен
          </span>
        )}
        {tpl.has_dynamic_wizard && (
          <span className="rounded-full border border-gold/30 bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
            Wizard
          </span>
        )}
        {tpl.lawyer_reviewed && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
            <CheckCircle2 className="h-2.5 w-2.5 text-success" /> Прегледан от юрист
          </span>
        )}
      </div>

      {tpl.purpose && (
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{tpl.purpose}</p>
      )}

      {tpl.key_clause && (
        <div className="mt-5 rounded-lg border border-border/60 bg-card/40 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ключова клауза
          </div>
          <p className="mt-1.5 text-sm leading-relaxed">{tpl.key_clause}</p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <a
          href={`/template/${tpl.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-gradient-gold px-4 py-2 text-sm font-semibold text-navy hover:opacity-90"
        >
          <Wand2 className="h-4 w-4" /> Изготви по този шаблон
        </a>
        <a
          href={`/template/${tpl.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-border/60 px-4 py-2 text-sm hover:bg-muted/40"
        >
          <ExternalLink className="h-4 w-4" /> Преглед в каталог
        </a>
        <button
          onClick={() => setKitOpen(true)}
          className="inline-flex items-center gap-2 rounded-md border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold hover:bg-gold/20"
        >
          <Package className="h-4 w-4" /> Добави в комплект
        </button>
      </div>

      <AddToKitDialog
        open={kitOpen}
        onClose={() => setKitOpen(false)}
        defaultKitTitle={tpl.name}
        item={{ role: "primary", ref_label: tpl.name, planned_doc_name: tpl.name }}
      />
    </div>
  );
}
