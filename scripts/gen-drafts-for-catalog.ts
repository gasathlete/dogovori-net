/**
 * Generates a full Bulgarian legal-style draft (template "бланка") for every
 * catalog document that doesn't already have one in src/data/templateDrafts/.
 *
 * For each missing doc:
 *   - slug = slugify(doc.name)              (must match templateDraftResolver)
 *   - writes src/data/templateDrafts/<slug>.ts with a `const draft = "..."; export default draft;`
 * After the loop it rebuilds src/data/templateDrafts/index.ts.
 *
 * Resume-friendly. Concurrency controlled by CONC env (default 12).
 *
 * Usage:
 *   bun run scripts/gen-drafts-for-catalog.ts                # all missing
 *   bun run scripts/gen-drafts-for-catalog.ts kits           # only kit docs (priority)
 *   bun run scripts/gen-drafts-for-catalog.ts finalize       # rebuild index only
 *   LIMIT=50 bun run scripts/gen-drafts-for-catalog.ts       # cap iterations
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CATALOG } from "../src/data/catalog";
import { DOCUMENT_KITS } from "../src/data/documentKits";
import { slugify } from "../src/lib/slugify";

const API_KEY = process.env.LOVABLE_API_KEY;
if (!API_KEY) {
  console.error("LOVABLE_API_KEY not set");
  process.exit(1);
}

const MODEL = process.env.MODEL || "google/gemini-2.5-flash";
const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DRAFTS_DIR = join(process.cwd(), "src/data/templateDrafts");
const DRAFTS_INDEX = join(DRAFTS_DIR, "index.ts");
const CONC = Number(process.env.CONC || 12);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const MODE = (process.argv[2] || "").toLowerCase(); // "" | kits | finalize

mkdirSync(DRAFTS_DIR, { recursive: true });

interface Target {
  name: string;
  slug: string;
  categoryId: string;
}

function collectTargets(): Target[] {
  const out: Target[] = [];
  const seen = new Set<string>();
  for (const cat of CATALOG) {
    for (const doc of cat.documents) {
      const slug = slugify(doc.name);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      out.push({ name: doc.name, slug, categoryId: cat.id });
    }
  }
  return out;
}

function kitTargets(): Target[] {
  const names = new Set<string>();
  for (const k of DOCUMENT_KITS) for (const it of k.items) names.add(it.docName);
  const all = collectTargets();
  const byName = new Map(all.map((t) => [t.name, t]));
  const out: Target[] = [];
  for (const n of names) {
    const t = byName.get(n);
    if (t) out.push(t);
    else {
      const slug = slugify(n);
      if (slug) out.push({ name: n, slug, categoryId: "" });
    }
  }
  return out;
}

const SYSTEM = `Ти си български юрист с 15 години опит в съставяне на бланки и договори. Пишеш на точен правен български. Цитираш конкретни закони (ЗЗД, ТЗ, КТ, ЗУТ, ЗЗП, ЗЗЛД/GDPR, ЗДДС, ГПК, ЗННД, ЗМИП, ЗС, ЗОЗ, ЗАвт.Прав, ЗДДФЛ) — само истински членове. Никога не измисляш членове. Отговаряш само с валиден JSON.`;

function userPrompt(t: Target): string {
  return `Изготви ПЪЛНА професионална бланка/draft за документ:

Име: "${t.name}"

Върни СТРОГО JSON: { "draft": "..." }

Изисквания към draft:
- Чист текст на български, без markdown.
- Започни с ЗАГЛАВИЕ С ГЛАВНИ БУКВИ.
- Включи (където е приложимо за този ТИП документ): дата и място на съставяне; страни с пълни реквизити (име/фирма, ЕГН/ЕИК, адрес/седалище, представляван от); правно основание (конкретен член от приложим закон); предмет; конкретни клаузи номерирани като "Чл. 1.", "Чл. 2." и т.н. с алинеи "(1)", "(2)"; задължения на страните; цена/възнаграждение/срок ако приложимо; отговорност и неустойки; срок и прекратяване; разрешаване на спорове; приложимо право; заключителни разпоредби; ПОДПИСИ в края с разделени линии за всяка страна.
- Структурата трябва да отговаря СПЕЦИФИЧНО на този тип документ — НЕ е общ договор. Например:
  • Учредителен акт на ЕООД → разделите по ТЗ: фирма, седалище, предмет на дейност, капитал, дял, едноличен собственик, управление, представителство, прекратяване.
  • Дружествен договор на ООД → чл. 115 ТЗ структура: данни за съдружници, фирма, седалище, предмет, капитал, дялове, управление, ОС, прехвърляне, прекратяване.
  • Протокол от ОС → дневен ред, кворум, гласуване, решения.
  • Решение на едноличния собственик → като еднолично решение, не като протокол.
  • Заявление А4/А5 → формуляр-стил с полета.
  • Декларация → "Долуподписаният ... декларирам, че ..." с конкретни обстоятелства.
  • Пълномощно → "Упълномощавам ... за следните действия: ..." нотариална форма ако нужно.
  • Разписка → кратък акт за получаване на сума/вещ.
  • Акт обр. 14/15/16 → строителен акт по Наредба №3 за съставяне на актове в строителството.
  • SAFE / Convertible Note / Term sheet / MSA / SOW / DPA → запази международната структура с български правни препратки.
- Полета, които потребителят попълва, са в [КВАДРАТНИ СКОБИ] с ясно описание, напр. [ПЪЛНО ИМЕ НА СТРАНАТА], [ЕГН], [ЕИК], [АДРЕС НА СЕДАЛИЩЕ], [ДАТА], [СУМА В EUR], [БРОЙ ДНИ], [ОПИСАНИЕ НА ИМОТА], [ПРОЦЕНТ]. ВАЖНО: валута EUR, не лв.
- Дължина: 1800-4500 символа.
- Използвай \\n за нов ред, \\n\\n за празен ред между параграфи. Никакъв markdown.

Върни само валиден JSON с единствено поле "draft". Никакви обяснения извън JSON.`;
}

async function callAI(t: Target): Promise<string | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
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
            { role: "user", content: userPrompt(t) },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 10000 + attempt * 5000));
        continue;
      }
      if (!res.ok) {
        const tx = await res.text();
        console.error(`[${t.slug}] HTTP ${res.status}: ${tx.slice(0, 200)}`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      const j: any = await res.json();
      const txt = j.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(txt);
      if (typeof parsed?.draft === "string" && parsed.draft.length > 400) {
        return parsed.draft;
      }
      console.error(`[${t.slug}] invalid draft shape`);
    } catch (e: any) {
      console.error(`[${t.slug}] attempt ${attempt}: ${e?.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return null;
}

async function generateOne(t: Target): Promise<"skip" | "ok" | "fail"> {
  const p = join(DRAFTS_DIR, `${t.slug}.ts`);
  if (existsSync(p)) return "skip";
  const draft = await callAI(t);
  if (!draft) return "fail";
  writeFileSync(
    p,
    `// AUTO-GENERATED by scripts/gen-drafts-for-catalog.ts\nconst draft = ${JSON.stringify(draft)};\nexport default draft;\n`,
    "utf8",
  );
  return "ok";
}

async function runWithConcurrency<T>(items: T[], conc: number, fn: (x: T, i: number) => Promise<any>) {
  let i = 0;
  let done = 0;
  const total = items.length;
  const workers = Array.from({ length: conc }, async () => {
    while (i < total) {
      const idx = i++;
      const r = await fn(items[idx], idx);
      done++;
      if (done % 10 === 0 || done === total) {
        console.log(`  progress ${done}/${total}`);
      }
    }
  });
  await Promise.all(workers);
}

function rebuildIndex() {
  const slugs = readdirSync(DRAFTS_DIR)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .map((f) => f.replace(/\.ts$/, ""))
    .sort();
  const body = `// AUTO-GENERATED by scripts/gen-drafts-for-catalog.ts\nexport type TemplateDraftLoader = () => Promise<string>;\n\nconst loaders: Record<string, TemplateDraftLoader> = {\n${slugs
    .map((s) => `  ${JSON.stringify(s)}: () => import("./${s}").then((m) => m.default),`)
    .join("\n")}\n};\n\nexport function loadTemplateDraft(slug: string): Promise<string> | undefined {\n  const fn = loaders[slug];\n  return fn ? fn() : undefined;\n}\n\nexport function hasTemplateDraft(slug: string): boolean {\n  return slug in loaders;\n}\n\nexport const TEMPLATE_DRAFT_SLUGS: string[] = Object.keys(loaders);\n`;
  writeFileSync(DRAFTS_INDEX, body, "utf8");
  console.log(`[index] wrote ${slugs.length} loaders to ${DRAFTS_INDEX}`);
}

async function main() {
  if (MODE === "finalize") {
    rebuildIndex();
    return;
  }

  let targets = MODE === "kits" ? kitTargets() : collectTargets();
  // Skip ones we already have.
  targets = targets.filter((t) => !existsSync(join(DRAFTS_DIR, `${t.slug}.ts`)));
  if (LIMIT < targets.length) targets = targets.slice(0, LIMIT);
  console.log(`Targets to generate: ${targets.length} (mode=${MODE || "all"}, conc=${CONC})`);

  let ok = 0, fail = 0;
  await runWithConcurrency(targets, CONC, async (t) => {
    const r = await generateOne(t);
    if (r === "ok") ok++;
    if (r === "fail") fail++;
  });
  console.log(`Generated: ${ok} ok, ${fail} fail`);
  rebuildIndex();
}

main().catch((e) => { console.error(e); process.exit(1); });
