// Auto-link engine for blog/template prose.
//
// Scans plain-text paragraphs and wraps the FIRST occurrence of each known
// keyword phrase in an internal <Link> to its `/shablon/<slug>` page.
//
// Why: Google reads anchor text as a strong topical signal. Long descriptive
// BG anchors pointing at the right URL boost rankings for those queries —
// without rewriting any URL.
//
// Rules:
//  - Each phrase links AT MOST ONCE per paragraph + AT MOST ONCE per page
//  - Cap total links at ~1 per ~200 words to avoid over-optimisation
//  - Never link to the current page (currentSlug excluded)
//  - Longer/higher-priority phrases match before shorter overlapping ones
//
// Output is a React fragment (array of strings + <Link> nodes). Use inside
// existing <p> wrappers.

import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ANCHOR_DICT } from "@/data/anchorDictionary";
import { allTemplates } from "@/lib/templateIndex";

interface ResolvedAnchor {
  phrases: string[];
  slug: string;
  priority: number;
}

let cached: ResolvedAnchor[] | null = null;

function getResolved(): ResolvedAnchor[] {
  if (cached) return cached;
  const byName = new Map(allTemplates().map((t) => [t.doc.name, t.slug]));
  cached = ANCHOR_DICT
    .map((e) => {
      const slug = byName.get(e.docName);
      if (!slug) return null;
      return { phrases: e.phrases, slug, priority: e.priority ?? 1 };
    })
    .filter((x): x is ResolvedAnchor => x !== null)
    // Sort by priority desc, then by longest phrase first within entry — both
    // ensure specific matches win over generic ones.
    .sort((a, b) => b.priority - a.priority);
  return cached;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Auto-link a single paragraph of text. Returns ReactNode (strings + Links).
 *
 * @param text       Paragraph text (plain, no HTML).
 * @param state      Mutable state shared across paragraphs of one article —
 *                   tracks which slugs already linked + total link count.
 * @param currentSlug When rendering on a /shablon/<slug> page, skip self.
 * @param maxLinks   Hard cap of links injected in this paragraph.
 */
export function autoLinkParagraph(
  text: string,
  state: { used: Set<string>; count: number; max: number },
  currentSlug?: string,
  maxLinks = 2,
): ReactNode {
  if (state.count >= state.max) return text;

  const resolved = getResolved();
  // Find best match position in the text — leftmost match across all phrases.
  type Hit = { start: number; end: number; slug: string; matched: string };
  const out: ReactNode[] = [];
  let cursor = 0;
  let injectedHere = 0;

  while (cursor < text.length && injectedHere < maxLinks && state.count < state.max) {
    let best: Hit | null = null;

    for (const r of resolved) {
      if (r.slug === currentSlug) continue;
      if (state.used.has(r.slug)) continue;
      for (const phrase of r.phrases) {
        const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(phrase)})(?=$|[^\\p{L}\\p{N}])`, "iu");
        const slice = text.slice(cursor);
        const m = slice.match(re);
        if (!m || m.index === undefined) continue;
        const start = cursor + m.index + m[1].length;
        const end = start + m[2].length;
        if (!best || start < best.start || (start === best.start && (end - start) > (best.end - best.start))) {
          best = { start, end, slug: r.slug, matched: m[2] };
        }
      }
    }

    if (!best) break;

    if (best.start > cursor) out.push(text.slice(cursor, best.start));
    out.push(
      <Link
        key={`al-${state.count}-${best.start}`}
        to={`/shablon/${best.slug}`}
        className="text-gold underline-offset-4 hover:underline"
      >
        {best.matched}
      </Link>,
    );
    state.used.add(best.slug);
    state.count++;
    injectedHere++;
    cursor = best.end;
  }

  if (cursor < text.length) out.push(text.slice(cursor));
  if (out.length === 0) return text;
  return <Fragment>{out}</Fragment>;
}

/** Create a fresh state object for one article render. */
export function createAutoLinkState(maxTotal = 6) {
  return { used: new Set<string>(), count: 0, max: maxTotal };
}
