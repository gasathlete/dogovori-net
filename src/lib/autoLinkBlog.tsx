// Auto-link engine for blog/template prose. See header in original plan.
// (.tsx because it returns React nodes with <Link>.)

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
    .sort((a, b) => b.priority - a.priority);
  return cached;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface AutoLinkState {
  used: Set<string>;
  count: number;
  max: number;
}

export function createAutoLinkState(maxTotal = 6): AutoLinkState {
  return { used: new Set<string>(), count: 0, max: maxTotal };
}

/** Auto-link a single plain-text paragraph. Returns ReactNode safe to render. */
export function autoLinkParagraph(
  text: string,
  state: AutoLinkState,
  currentSlug?: string,
  maxLinks = 2,
): ReactNode {
  if (state.count >= state.max) return text;

  const resolved = getResolved();
  const out: ReactNode[] = [];
  let cursor = 0;
  let injectedHere = 0;

  while (cursor < text.length && injectedHere < maxLinks && state.count < state.max) {
    let bestStart = -1;
    let bestEnd = -1;
    let bestSlug = "";
    let bestMatched = "";

    for (const r of resolved) {
      if (r.slug === currentSlug) continue;
      if (state.used.has(r.slug)) continue;
      for (const phrase of r.phrases) {
        const re = new RegExp(
          "(^|[^\\p{L}\\p{N}])(" + escapeRegExp(phrase) + ")(?=$|[^\\p{L}\\p{N}])",
          "iu",
        );
        const slice = text.slice(cursor);
        const m = slice.match(re);
        if (!m || m.index === undefined) continue;
        const start = cursor + m.index + m[1].length;
        const end = start + m[2].length;
        if (
          bestStart === -1 ||
          start < bestStart ||
          (start === bestStart && end - start > bestEnd - bestStart)
        ) {
          bestStart = start;
          bestEnd = end;
          bestSlug = r.slug;
          bestMatched = m[2];
        }
      }
    }

    if (bestStart === -1) break;

    if (bestStart > cursor) out.push(text.slice(cursor, bestStart));
    out.push(
      <Link
        key={"al-" + state.count + "-" + bestStart}
        to={"/shablon/" + bestSlug}
        className="text-gold underline-offset-4 hover:underline"
      >
        {bestMatched}
      </Link>,
    );
    state.used.add(bestSlug);
    state.count++;
    injectedHere++;
    cursor = bestEnd;
  }

  if (cursor < text.length) out.push(text.slice(cursor));
  if (out.length === 0) return text;
  return <Fragment>{out}</Fragment>;
}
