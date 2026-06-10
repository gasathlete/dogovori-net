import { useEffect, useState } from "react";
import { LegalLayout } from "./LegalLayout";
import { supabase } from "@/integrations/supabase/client";

type LegalVersion = {
  id: string;
  document_key: string;
  version: string;
  effective_date: string;
  change_type: string | null;
  summary: string | null;
  created_at: string;
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

const CHANGE_LABELS: Record<string, string> = {
  material_change: "Съществена промяна",
  minor_clarification: "Уточнение",
  typo: "Редакционна",
  new_document: "Нов документ",
};

export default function Changelog() {
  const [rows, setRows] = useState<LegalVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("legal_versions")
        .select("id, document_key, version, effective_date, change_type, summary, created_at")
        .order("effective_date", { ascending: false })
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
        Тук публикуваме всяка съществена промяна в нашите правни документи. При
        material change уведомяваме регистрираните потребители по имейл поне 30 дни
        преди влизане в сила, когато промяната засяга техните права.
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
                <th className="py-2 pr-3">Дата</th>
                <th className="py-2 pr-3">Документ</th>
                <th className="py-2 pr-3">Версия</th>
                <th className="py-2 pr-3">Тип</th>
                <th className="py-2">Резюме</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/30 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{r.effective_date}</td>
                  <td className="py-2 pr-3">{DOC_LABELS[r.document_key] ?? r.document_key}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.version}</td>
                  <td className="py-2 pr-3">
                    {r.change_type ? CHANGE_LABELS[r.change_type] ?? r.change_type : "—"}
                  </td>
                  <td className="py-2">{r.summary ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </LegalLayout>
  );
}
