import type { BlogSource } from "@/lib/blog";

interface Props {
  sources: readonly BlogSource[];
  /** Show the restrained "checked against official sources" note. */
  verified?: boolean;
  reviewedAt?: string;
}

/**
 * Restrained list of official sources for an article. Never claims review by a
 * lawyer or named expert — only that the text was checked against the sources.
 */
export function OfficialSources({ sources, verified, reviewedAt }: Props) {
  if (!sources || sources.length === 0) return null;
  return (
    <section className="mt-14 rounded-xl border border-border/50 bg-card/30 p-6" aria-label="Официални източници">
      <h2 className="mb-4 font-serif text-lg font-bold leading-tight">Официални източници</h2>
      <ul className="space-y-3 text-sm leading-relaxed">
        {sources.map((s) => (
          <li key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold hover:underline"
            >
              {s.title}
            </a>
            {s.note && <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>}
          </li>
        ))}
      </ul>
      {verified && (
        <p className="mt-5 text-xs text-muted-foreground">
          Проверено спрямо официални източници
          {reviewedAt ? ` (${reviewedAt})` : ""}.
        </p>
      )}
    </section>
  );
}
