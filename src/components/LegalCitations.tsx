import { BookOpen, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LegalCitation {
  chunk_id: string;
  citation_label: string;
  short_code: string;
  title: string;
  article_no: string | null;
  paragraph_no: string | null;
  official_url: string | null;
  jurisdiction: "BG" | "EU";
  similarity: number;
}

interface Props {
  citations: LegalCitation[];
  className?: string;
}

export function LegalCitations({ citations, className }: Props) {
  if (!citations || citations.length === 0) return null;
  return (
    <div className={cn("mt-3 rounded-md border border-gold/20 bg-gold/5 p-3", className)}>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gold">
        <BookOpen className="h-3 w-3" />
        Източници от нормативната база ({citations.length})
      </div>
      <ol className="space-y-1.5 text-[11px] text-muted-foreground">
        {citations.map((c, i) => (
          <li key={c.chunk_id} className="flex items-start gap-2">
            <span className="font-mono text-gold">[S{i + 1}]</span>
            <span className="flex-1">
              <span className="text-foreground">{c.citation_label}</span>
              {c.jurisdiction === "EU" && (
                <span className="ml-1 rounded bg-gold/10 px-1 py-0.5 text-[9px] text-gold">ЕС</span>
              )}
              {c.official_url && (
                <a
                  href={c.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 inline-flex items-center gap-0.5 text-gold hover:underline"
                  aria-label="Официален източник"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
