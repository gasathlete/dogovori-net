// Generates supabase/functions/_shared/blank-drafts.json from src/data/templateDrafts/*.ts
// Run: bun run scripts/gen-shared-blank-drafts.ts
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const SRC = "src/data/templateDrafts";
const OUT = "supabase/functions/_shared/blank-drafts.json";

async function main() {
  const files = (await readdir(SRC)).filter((f) => f.endsWith(".ts") && f !== "index.ts");
  const out: Record<string, string> = {};
  for (const f of files) {
    const slug = f.replace(/\.ts$/, "");
    const src = await readFile(join(SRC, f), "utf8");
    // Match: const draft = "...";  (single-line escaped string)
    const m = src.match(/const\s+draft\s*=\s*("(?:\\.|[^"\\])*")\s*;/);
    if (!m) {
      console.warn(`[skip] no draft literal: ${f}`);
      continue;
    }
    try {
      out[slug] = JSON.parse(m[1]);
    } catch (e) {
      console.warn(`[skip] parse failed: ${f}`, e);
    }
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out));
  console.log(`Wrote ${Object.keys(out).length} drafts to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
