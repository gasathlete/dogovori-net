/**
 * ProcessChips — четирите стъпки на процеса като clickable чипове.
 * Преместени от Hero-то, за да остане първият екран чист.
 */
import { Link } from "react-router-dom";

const STEPS = [
  { slug: "dogovaryay", label: "Договаряй" },
  { slug: "sazday", label: "Създай" },
  { slug: "pretsiziray", label: "Прецизирай" },
  { slug: "podpishi", label: "Подпиши" },
];

export function ProcessChips({ className }: { className?: string }) {
  return (
    <nav aria-label="Четирите стъпки на процеса" className={className}>
      <ul
        role="list"
        className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-1.5 gap-y-2 sm:gap-x-2"
      >
        {STEPS.map((s, i, arr) => (
          <li key={s.slug} className="inline-flex items-center gap-1.5 sm:gap-2">
            <Link
              to={`/proces/${s.slug}`}
              className="inline-flex items-center rounded-full border border-gold/30 bg-card/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold/90 shadow-sm transition-colors hover:border-gold/60 hover:bg-gold/10 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 sm:text-[12px]"
            >
              {s.label}
            </Link>
            {i < arr.length - 1 && (
              <span aria-hidden="true" className="text-gold/40">
                ·
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
