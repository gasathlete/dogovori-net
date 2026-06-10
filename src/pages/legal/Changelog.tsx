import { useEffect, useState } from "react";
import { LegalLayout } from "./LegalLayout";
import { supabase } from "@/integrations/supabase/client";

type LegalVersion = {
  id: string;
  doc_key: string;
  version: string;
  effective_at: string;
  material_change: boolean;
  summary: string;
};

const DOC_LABELS: Record<string, string> = {
  terms: "Общи условия",
  privacy: "Поверителност",
  cookies: "Бисквитки",
  dpa: "DPA",
  refund: "Възстановяване",
  ai_processing: "AI политика",
  retention: "Съхранение",
  subprocessors: "Подпроцесори",
  incident_response: "Инциденти",
  ropa: "ROPA",
  dpia_summary: "DPIA резюме",
  security_policy: "Сигурност",
};

export default function Changelog() {
  const [rows, setRows] = useState<LegalVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("legal_versions")
        .select("id, doc_key, version, effective_at, material_change, summary")
        .order("effective_at", { ascending: false })
        .limit(200);
      setRows((data as LegalVersion[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <LegalLayout
      title="Хронология на правните документи"
      description="Публичен changelog с версии и съществени промени на правните документи на Dogovori.net."
    >
      <p className="text-sm text-muted-foreground">
        Тук публикуваме всяка съществена промяна в нашите правни документи. При material
        change уведомяваме регистрираните потребители по имейл поне 30 дни преди влизане
        в сила, когато промяната засяга техните права.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Зареждане…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Все още няма публикувани версии.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3">В сила от</th>
                <th className="py-2 pr-3">Документ</th>
                <th className="py-2 pr-3">Версия</th>
                <th className="py-2 pr-3">Тип</th>
                <th className="py-2">Резюме</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/30 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {new Date(r.effective_at).toLocaleDateString("bg-BG")}
                  </td>
                  <td className="py-2 pr-3">{DOC_LABELS[r.doc_key] ?? r.doc_key}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.version}</td>
                  <td className="py-2 pr-3">
                    {r.material_change ? (
                      <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[11px] font-medium text-gold">
                        Съществена
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Редакционна</span>
                    )}
                  </td>
                  <td className="py-2">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </LegalLayout>
  );
}
