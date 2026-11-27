// Generates rich SEO content for every template in the catalog.
// For each template, asks Lovable AI to produce:
//   - intro paragraph (2-3 sentences, SEO-optimized)
//   - 3-5 usage cases
//   - 5-8 mandatory requirements (Bulgarian law specific)
//   - 4-6 common mistakes
//   - 5-6 FAQ Q&A pairs
//
// Output: src/data/templateContent.ts
//
// Usage: bun run scripts/generate-template-content.ts

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { CATALOG } from "../src/data/catalog";
import { slugify } from "../src/lib/slugify";

const API_KEY = process.env.LOVABLE_API_KEY;
if (!API_KEY) {
  console.error("LOVABLE_API_KEY not set");
  process.exit(1);
}

const MODEL = "google/gemini-2.5-flash";
const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface TemplateContent {
  intro: string;
  usageCases: string[];
  requirements: string[];
  mistakes: string[];
  faq: { q: string; a: string }[];
}

const SYSTEM = `Ти си български юрист с 15 години опит и експерт по SEO съдържание. Пишеш ясно, точно, на правен български. Цитираш конкретни закони (ЗЗД, ТЗ, КТ, ЗУТ, ЗЗП, GDPR/ЗЗЛД, ЗДДС). Никога не измисляш членове или закони.`;

function buildPrompt(name: string, purpose: string, keyClause: string, category: string): string {
  return `Изготви SEO-оптимизирано съдържание за страница за договор/документ:

Име: "${name}"
Категория: "${category}"
Цел: ${purpose}
Ключова клауза: ${keyClause}

Върни СТРОГО JSON със следната структура (без markdown, без обяснения):
{
  "intro": "2-3 изречения въведение, естествено включващо ключовите думи. Без клишета.",
  "usageCases": ["3 до 5 конкретни сценария кога се използва, започващи с глагол или 'Когато...'"],
  "requirements": ["5 до 8 задължителни реквизита за този конкретен договор по българското право, кратки и конкретни"],
  "mistakes": ["4 до 6 най-чести грешки при изготвянето на този конкретен договор"],
  "faq": [{"q": "Въпрос?", "a": "Отговор в 1-3 изречения, съдържащ цитиране на закон ако е приложимо."}]
}

Изисквания: faq да има 5-6 въпроса. Отговорите да са фактически точни и специфични за БЪЛГАРСКОТО право. Не използвай общи фрази.`;
}

async function generate(name: string, purpose: string, keyClause: string, category: string): Promise<TemplateContent | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: buildPrompt(name, purpose, keyClause, category) },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (res.status === 429) {
        console.warn(`  rate limited, waiting 10s...`);
        await new Promise((r) => setTimeout(r, 10000));
        continue;
      }
      if (!res.ok) {
        console.error(`  HTTP ${res.status}: ${await res.text()}`);
        return null;
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) return null;
      const parsed = JSON.parse(text) as TemplateContent;
      // Light validation
      if (!parsed.intro || !Array.isArray(parsed.faq) || parsed.faq.length < 3) {
        console.warn(`  invalid output, retrying`);
        continue;
      }
      return parsed;
    } catch (e: any) {
      console.error(`  error: ${e.message}, retry ${attempt + 1}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}

async function main() {
  const outPath = "src/data/templateContent.ts";
  const existing: Record<string, TemplateContent> = {};
  if (existsSync(outPath)) {
    try {
      const raw = readFileSync(outPath, "utf8");
      const m = raw.match(/= (\{[\s\S]*\}) as const;/);
      if (m) Object.assign(existing, JSON.parse(m[1]));
      console.log(`Loaded ${Object.keys(existing).length} existing entries`);
    } catch {
      // ignore
    }
  }

  const result: Record<string, TemplateContent> = { ...existing };
  const used = new Set<string>();
  let total = 0, generated = 0, skipped = 0, failed = 0;

  for (const cat of CATALOG) {
    for (const doc of cat.documents) {
      total++;
      let base = slugify(doc.name);
      if (!base) base = "shablon";
      let slug = base;
      let i = 2;
      while (used.has(slug)) slug = `${base}-${i++}`;
      used.add(slug);

      if (existing[slug]) {
        skipped++;
        continue;
      }

      console.log(`[${total}] ${doc.name}`);
      const content = await generate(doc.name, doc.purpose, doc.keyClause, cat.title);
      if (content) {
        result[slug] = content;
        generated++;
        // Persist after every successful gen so we can resume
        writeFileSync(outPath, serialize(result), "utf8");
      } else {
        failed++;
        console.error(`  FAILED: ${doc.name}`);
      }

      await new Promise((r) => setTimeout(r, 400));
    }
  }

  console.log(`\nDone. total=${total} generated=${generated} skipped=${skipped} failed=${failed}`);
}

function serialize(obj: Record<string, TemplateContent>): string {
  return `// AUTO-GENERATED by scripts/generate-template-content.ts
// Rich SEO content per template slug. Do not edit by hand — re-run script instead.

export interface TemplateContent {
  intro: string;
  usageCases: string[];
  requirements: string[];
  mistakes: string[];
  faq: { q: string; a: string }[];
}

export const TEMPLATE_CONTENT: Record<string, TemplateContent> = ${JSON.stringify(obj, null, 2)} as const;
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
