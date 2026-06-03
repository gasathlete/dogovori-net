/**
 * Seeds public.template_search_index from the static CATALOG.
 * Marks has_dynamic_wizard=true for slugs registered in QUESTION_GRAPHS.
 *
 * Run with:  bun run scripts/seed-template-search-index.ts
 */
import { createClient } from "@supabase/supabase-js";
import { CATALOG } from "../src/data/catalog";
import { QUESTION_GRAPHS } from "../src/data/questionGraphs/dogovor-za-naem-na-zhilishte";
import { slugify } from "../src/lib/slugify";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
                 ?? process.env.SUPABASE_SERVICE_KEY
                 ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or fallbacks)");
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

type Row = {
  slug: string;
  name: string;
  category_id: string;
  category_title: string;
  purpose: string;
  key_clause: string;
  document_type: string | null;
  bilingual: boolean;
  has_dynamic_wizard: boolean;
  lawyer_reviewed: boolean;
  locale: string;
};

const dynamicSlugs = new Set(Object.keys(QUESTION_GRAPHS));
const rows: Row[] = [];
const seen = new Set<string>();

for (const cat of CATALOG) {
  for (const doc of cat.documents) {
    let base = slugify(doc.name);
    let slug = base;
    let i = 2;
    while (seen.has(slug)) { slug = `${base}-${i++}`; }
    seen.add(slug);
    rows.push({
      slug,
      name: doc.name,
      category_id: cat.id,
      category_title: cat.title,
      purpose: doc.purpose ?? "",
      key_clause: doc.keyClause ?? "",
      document_type: doc.documentType ?? null,
      bilingual: doc.bilingual === true || cat.id === "bilingual",
      has_dynamic_wizard: dynamicSlugs.has(slug),
      lawyer_reviewed: false,
      locale: "bg",
    });
  }
}

console.log(`Prepared ${rows.length} rows (${rows.filter(r => r.has_dynamic_wizard).length} dynamic).`);

// Upsert in chunks of 200 to stay well under PostgREST request limits.
const CHUNK = 200;
let written = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const slice = rows.slice(i, i + CHUNK);
  const { error } = await supa
    .from("template_search_index")
    .upsert(slice, { onConflict: "slug" });
  if (error) {
    console.error("Upsert failed:", error);
    process.exit(1);
  }
  written += slice.length;
  console.log(`  upserted ${written}/${rows.length}`);
}
console.log("Done.");
