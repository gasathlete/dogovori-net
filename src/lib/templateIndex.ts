// Builds an index of all catalog documents keyed by SEO slug.
// Used by /shablon/:slug page and sitemap generation.

import { CATALOG, type CatalogCategory, type CatalogDocument } from "@/data/catalog";
import { slugify } from "@/lib/slugify";

export interface TemplateEntry {
  slug: string;
  doc: CatalogDocument;
  category: CatalogCategory;
}

let cached: TemplateEntry[] | null = null;
let bySlug: Map<string, TemplateEntry> | null = null;

function build() {
  if (cached) return;
  cached = [];
  bySlug = new Map();
  const used = new Set<string>();
  for (const cat of CATALOG) {
    for (const doc of cat.documents) {
      let base = slugify(doc.name);
      if (!base) base = "shablon";
      let slug = base;
      let i = 2;
      while (used.has(slug)) {
        slug = `${base}-${i++}`;
      }
      used.add(slug);
      const entry: TemplateEntry = { slug, doc, category: cat };
      cached.push(entry);
      bySlug.set(slug, entry);
    }
  }
}

export function allTemplates(): TemplateEntry[] {
  build();
  return cached!;
}

export function getTemplateBySlug(slug: string): TemplateEntry | undefined {
  build();
  return bySlug!.get(slug);
}

export function getRelatedTemplates(entry: TemplateEntry, count = 3): TemplateEntry[] {
  build();
  return cached!
    .filter((t) => t.category.id === entry.category.id && t.slug !== entry.slug)
    .slice(0, count);
}
