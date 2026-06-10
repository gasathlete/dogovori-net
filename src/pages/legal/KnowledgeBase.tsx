import { useEffect, useState } from "react";
import { LegalLayout } from "./LegalLayout";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface SourceRow {
  id: string;
  short_code: string;
  title: string;
  jurisdiction: "BG" | "EU";
  source_type: string;
  issuer: string | null;
  official_url: string | null;
  version: string | null;
  updated_at: string;
  active: boolean;
}

export default function KnowledgeBasePage() {
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("legal_sources")
        .select("id,short_code,title,jurisdiction,source_type,issuer,official_url,version,updated_at,active")
        .eq("active", true)
        .order("jurisdiction")
        .order("short_code");
      setRows((data ?? []) as SourceRow[]);
      setLoading(false);
    })();
  }, []);

  const bg = rows.filter((r) => r.jurisdiction === "BG");
  const eu = rows.filter((r) => r.jurisdiction === "EU");

  return (
    <LegalLayout
      title="Нормативна база на AI"
      description="Всеки AI отговор в Dogovori.net е обоснован изключително върху индексирани извадки от официално публикувани български и европейски нормативни актове."
    >
      <h2>1. Принцип</h2>
      <p>
        Платформата прилага архитектура за извличане с допълване (RAG) върху vector база с
        нормативни актове. Преди всеки AI извикване системата търси релевантни параграфи в
        собствената си индексирана база и инструктира модела да отговаря{" "}
        <strong>само от тях</strong> с цитати. Ако няма основание в базата, AI явно отказва
        отговор и насочва към квалифициран адвокат.
      </p>

      <h2>2. Източници</h2>
      <p className="text-xs text-muted-foreground">
        Използваме само публично достъпни нормативни актове и решения. Официални публикации
        в „Държавен вестник" (свободно използване по чл. 4, ал. 1 ЗАвПСП) и EUR-Lex (open
        data). Не използваме затворени бази (lex.bg, ciela, apis.bg).
      </p>

      <h3>2.1 Българско право ({bg.length})</h3>
      {loading && <p className="text-xs text-muted-foreground">Зареждане...</p>}
      <SourcesTable rows={bg} />

      <h3>2.2 Право на ЕС ({eu.length})</h3>
      <SourcesTable rows={eu} />

      <h2>3. Прозрачност на цитатите</h2>
      <p>
        Под всеки AI отговор се показва списък <code>[S1] [S2]…</code> с точното позоваване
        (член, алинея) и линк към официалния източник. Това позволява проверка от потребителя.
      </p>

      <h2>4. Поддръжка и обновяване</h2>
      <p>
        Индексът се обновява периодично от администратора. Всяка версия пази SHA-256 на
        изходния текст за идемпотентен ingest и одит. При промяна на закон, старите чункове
        се деактивират, а нови се добавят.
      </p>

      <h2>5. Ограничения</h2>
      <p>
        AI остава консултативен. Той не замества адвокат и не предоставя обвързващи правни
        съвети. За конкретен казус задължително се обърнете към квалифициран юрист.
      </p>
    </LegalLayout>
  );
}

function SourcesTable({ rows }: { rows: SourceRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">Все още няма индексирани актове.</p>;
  }
  return (
    <table className="my-4 w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-border/60 text-left">
          <th className="py-2 pr-3">Код</th>
          <th className="py-2 pr-3">Заглавие</th>
          <th className="py-2 pr-3">Тип</th>
          <th className="py-2">Източник</th>
        </tr>
      </thead>
      <tbody className="text-foreground/80">
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-border/30">
            <td className="py-2 pr-3 font-mono">{r.short_code}</td>
            <td className="py-2 pr-3">{r.title}</td>
            <td className="py-2 pr-3">
              <Badge variant="outline" className="text-[10px]">
                {r.source_type}
              </Badge>
            </td>
            <td className="py-2">
              {r.official_url ? (
                <a
                  href={r.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold hover:underline"
                >
                  Официален текст
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
