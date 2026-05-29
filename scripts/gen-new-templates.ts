/**
 * Bulk-generates new templates: 10 per documentType × 15 types = 150 templates.
 *
 * For each template, writes:
 *   - src/data/templateContent/<slug>.ts      (intro, usageCases, requirements, mistakes, faq)
 *   - src/data/templateDrafts/<slug>.ts       (full draft text with [placeholders])
 * And appends an entry to src/data/newTemplates.ts.
 *
 * After loop, regenerates:
 *   - src/data/templateContent/index.ts       (full loader registry)
 *   - src/data/templateDrafts/index.ts        (full loader registry)
 *   - src/data/templateContentMeta.ts         (intro excerpts for SEO)
 *
 * Resume-friendly: skips templates whose files already exist.
 *
 * Usage:
 *   bun run scripts/gen-new-templates.ts          # generate everything (resumes)
 *   bun run scripts/gen-new-templates.ts finalize # rebuild indices only
 *   bun run scripts/gen-new-templates.ts specs    # regenerate the spec list only
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const API_KEY = process.env.LOVABLE_API_KEY;
if (!API_KEY) {
  console.error("LOVABLE_API_KEY not set");
  process.exit(1);
}

const MODEL = "google/gemini-2.5-flash";
const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

const CONTENT_DIR = join(process.cwd(), "src/data/templateContent");
const DRAFTS_DIR = join(process.cwd(), "src/data/templateDrafts");
const SPECS_FILE = join(process.cwd(), "scripts/.new-templates-specs.json");
const NEW_TEMPLATES_FILE = join(process.cwd(), "src/data/newTemplates.ts");
const META_FILE = join(process.cwd(), "src/data/templateContentMeta.ts");
const CONTENT_INDEX = join(CONTENT_DIR, "index.ts");
const DRAFTS_INDEX = join(DRAFTS_DIR, "index.ts");

mkdirSync(DRAFTS_DIR, { recursive: true });

// --- Document types & their distribution -------------------------------------

interface TypePlan {
  type: string;        // DocumentTypeId
  category: string;    // catalog category id where new docs go
  count: number;
  hint: string;        // domain hint for AI
}

const PLAN: TypePlan[] = [
  { type: "contract",          category: "uslugi",         count: 10, hint: "разнообразни търговски и граждански договори (комисионен, наем на оборудване, поръчка, доставка, посредничество, спедиция, аренда, ишлеме, дистрибуция, мандатен)" },
  { type: "agreement",         category: "korp",           count: 10, hint: "споразумения между страни – акционерно, споразумение за поверителност между съдружници, споразумение за прекратяване, медиационно, ликвидационно, споразумение за съвместна дейност, споразумение за неконкуриране, споразумение за консолидация на дълг, споразумение за обезщетение, споразумение за разсрочване" },
  { type: "appendix",          category: "uslugi",         count: 10, hint: "приложения към основни договори – техническо задание, ценова листа, спецификация, списък на персонал, SLA параметри, гаранционни условия, описание на материали, обхват на услугите, схема на работа, график на доставки" },
  { type: "annex",             category: "trudovi",        count: 10, hint: "анекси/изменения към договори – промяна на длъжност, промяна на възнаграждение, удължаване на срок, промяна на обем, добавяне на услуги, промяна на цена, промяна на адрес, преминаване от срочен в безсрочен, промяна на работно време, промяна на условия за прекратяване" },
  { type: "protocol",          category: "stroitelstvo",   count: 10, hint: "приемо-предавателни и констативни протоколи – предаване на ключове, предаване на стока, констативен протокол за щети, протокол за брак, протокол за изпитване, протокол за инвентаризация, протокол за разпит на свидетел при ПТП, протокол за приемане на услуга, протокол за прекъсване на работа, протокол за съгласуване" },
  { type: "receipt",           category: "decl",           count: 10, hint: "разписки за получена сума/вещ – разписка за получени пари, разписка за задатък, разписка за заем, разписка за връщане на сума, разписка за получена стока, разписка за получени документи, разписка за получен депозит, разписка за получено имущество при наем, разписка за получено възнаграждение, разписка за получена помощ" },
  { type: "power_of_attorney", category: "punomoshtni",    count: 10, hint: "пълномощни (обикновени и нотариални) – пълномощно за получаване на документи от НАП, пълномощно за управление на МПС, пълномощно за продажба на МПС, генерално пълномощно, пълномощно за банкови операции, пълномощно за съдебно представителство, пълномощно за КАТ, пълномощно за участие в общо събрание, пълномощно за наследствени дела, пълномощно за регистрация на фирма" },
  { type: "declaration",       category: "decl",           count: 10, hint: "декларации по различни закони – декларация за гражданство, декларация за семейно положение, декларация за липса на задължения, декларация за съгласие за пътуване на дете в чужбина, декларация за приемане на наследство, декларация по чл. 92 ЗДДФЛ, декларация по ЗМИП за произход на средства (нова), декларация за действителен собственик, декларация за обработка на лични данни на служител, декларация за поверителност" },
  { type: "complaint",         category: "decl",           count: 10, hint: "жалби до институции – жалба до КЗП, жалба до КЗД, жалба до КЗЛД, жалба до Инспекция по труда, жалба до НАП, жалба до НЗОК, жалба до общинска администрация, жалба срещу глоба от КАТ, жалба до банков омбудсман, жалба до Прокуратура" },
  { type: "claim",             category: "decl",           count: 10, hint: "искови молби по ГПК – искова молба за паричен иск, искова молба за неоснователно обогатяване, искова молба за развод по взаимно съгласие, искова молба за издръжка, искова молба за делба на наследство, искова молба за установителен иск, искова молба за непозволено увреждане, искова молба за прекратяване на трудово правоотношение, искова молба за отмяна на дисциплинарно наказание, искова молба за обезщетение от ПТП" },
  { type: "notary_invitation", category: "decl",           count: 10, hint: "нотариални покани по чл. 50 ЗННД – за плащане на дълг, за връщане на заем, за изпълнение по договор, за прекратяване на наемен договор, за освобождаване на имот, за изпълнение на гаранция, за връщане на задатък, за приемане на дарение, за приемане на наследство, за реализиране на право на изкупуване" },
  { type: "offer",             category: "trade",          count: 10, hint: "търговски оферти – оферта за СМР, оферта за доставка на стоки, оферта за консултантски услуги, оферта за софтуерна разработка, оферта за обучение, оферта за наем на оборудване, оферта за транспортни услуги, оферта за охрана, оферта за маркетинг, оферта по ЗОП" },
  { type: "invoice",           category: "schetovodni",    count: 10, hint: "фактури и сходни документи – проформа фактура, данъчна фактура за услуги, кредитно известие, дебитно известие, фактура за авансово плащане, фактура за ВОД, фактура за износ, опростена фактура, обратна фактура (self-billing), фактура за освободена доставка по ЗДДС" },
  { type: "smr",               category: "stroitelstvo",   count: 10, hint: "СМР документация – акт обр.12 (нарушения), акт обр.14 (приемане на конструкция), акт обр.15 (установяване годност за приемане), акт обр.16 (въвеждане в експлоатация), констативен акт по чл.176, протокол за скрити работи, протокол за нивелация, заповедна книга за СМР, акт за временно спиране, акт за възобновяване на СМР" },
  { type: "kss",               category: "stroitelstvo",   count: 10, hint: "КСС за различни строителни обекти – КСС за груб строеж на еднофамилна сграда, КСС за вътрешен ремонт на апартамент, КСС за фасадна санация, КСС за покривен ремонт, КСС за ВиК инсталация, КСС за електроинсталация, КСС за саниране на обществена сграда, КСС за пътен ремонт, КСС за озеленяване, КСС за изграждане на ограда" },
];

const TOTAL_TARGET = PLAN.reduce((s, p) => s + p.count, 0);

// --- Helpers -----------------------------------------------------------------

function slugify(name: string): string {
  const map: Record<string, string> = {
    "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ж":"zh","з":"z","и":"i","й":"y",
    "к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u",
    "ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sht","ъ":"a","ь":"y","ю":"yu","я":"ya"
  };
  return name.toLowerCase().split("").map(ch => map[ch] ?? ch).join("")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80);
}

async function callAI(system: string, user: string, jsonMode = true): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const body: any = {
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      };
      if (jsonMode) body.response_format = { type: "json_object" };
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify(body),
      });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 12000 + attempt*5000));
        continue;
      }
      if (!res.ok) {
        const t = await res.text();
        console.error(`HTTP ${res.status}: ${t.slice(0,300)}`);
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      const j = await res.json();
      const txt = j.choices?.[0]?.message?.content ?? "";
      return jsonMode ? JSON.parse(txt) : txt;
    } catch (e: any) {
      console.error("attempt", attempt, e?.message);
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  return null;
}

// --- Phase 1: Spec generation -----------------------------------------------

interface Spec {
  name: string;
  purpose: string;
  keyClause: string;
  documentType: string;
  categoryId: string;
  slug: string;
}

async function generateSpecs(): Promise<Spec[]> {
  if (existsSync(SPECS_FILE) && process.argv[2] !== "specs") {
    return JSON.parse(readFileSync(SPECS_FILE, "utf8"));
  }
  console.log("[specs] generating list of 150 templates via AI...");
  const all: Spec[] = [];
  for (const tp of PLAN) {
    console.log(`  ${tp.type} (${tp.count})...`);
    const sys = "Ти си български юрист. Отговаряш само със стриктно валиден JSON.";
    const usr = `Дай ${tp.count} ПРОФЕСИОНАЛНИ бланки от тип "${tp.type}". Тематичен обхват: ${tp.hint}.

Върни СТРОГО JSON: { "items": [ { "name": "...", "purpose": "...", "keyClause": "..." }, ... ] }

Правила:
- name: пълно и точно име на български (40-90 символа), напр. "Пълномощно за получаване на удостоверение за наследници"
- purpose: 1 кратко изречение (60-140 символа) за какво се използва
- keyClause: 1 кратко изречение (50-130 символа) за най-важната клауза/реквизит
- Бланките да бъдат РАЗНООБРАЗНИ – не повтаряй темите.
- Никакви markdown, обяснения или допълнителен текст.`;
    const json = await callAI(sys, usr);
    if (!json?.items || !Array.isArray(json.items)) {
      console.error(`  failed for ${tp.type}`);
      continue;
    }
    for (const it of json.items.slice(0, tp.count)) {
      if (!it.name || !it.purpose || !it.keyClause) continue;
      all.push({
        name: String(it.name).trim(),
        purpose: String(it.purpose).trim(),
        keyClause: String(it.keyClause).trim(),
        documentType: tp.type,
        categoryId: tp.category,
        slug: slugify(it.name),
      });
    }
  }
  // dedupe by slug
  const seen = new Set<string>();
  const unique = all.filter(s => {
    if (seen.has(s.slug) || !s.slug) return false;
    seen.add(s.slug); return true;
  });
  writeFileSync(SPECS_FILE, JSON.stringify(unique, null, 2), "utf8");
  console.log(`[specs] saved ${unique.length} specs to ${SPECS_FILE}`);
  return unique;
}

// --- Phase 2: Content + Draft generation ------------------------------------

const CONTENT_SYSTEM = `Ти си български юрист с 15 години опит и експерт по SEO съдържание и съставяне на бланки. Пишеш на точен правен български. Цитираш конкретни закони (ЗЗД, ТЗ, КТ, ЗУТ, ЗЗП, GDPR/ЗЗЛД, ЗДДС, ГПК, ЗННД, ЗМИП). Никога не измисляш членове или закони. Отговаряш само с валиден JSON.`;

function buildContentPrompt(s: Spec): string {
  return `Изготви СЪДЪРЖАНИЕ + ГОТОВ ДРАФТ за бланка:

Име: "${s.name}"
Тип документ: ${s.documentType}
Цел: ${s.purpose}
Ключова клауза: ${s.keyClause}

Върни СТРОГО JSON:
{
  "intro": "2-3 изречения SEO въведение, естествено включващо ключови думи. Без клишета.",
  "usageCases": ["3-5 конкретни сценария кога се използва"],
  "requirements": ["5-8 задължителни реквизита по българското право, кратки и конкретни"],
  "mistakes": ["4-6 най-чести грешки"],
  "faq": [{"q":"...?","a":"1-3 изречения, с цитат на закон ако приложимо."}],
  "draft": "ПЪЛЕН готов текст на бланката на български. Употреби [квадратни скоби] за полета, които потребителят попълва (напр. [ИМЕ НА СТРАНАТА], [ЕГН], [ДАТА], [СУМА В ЛЕВА], [ОПИСАНИЕ]). Включи: заглавие, страни, основание, предмет, основни клаузи (членове по подходящ номер), задължения, отговорност, прекратяване, заключителни разпоредби, дата и подписи. Дължина: 1500-3500 символа. Използвай \\n за нов ред. Никакъв markdown – само чист текст."
}

Изисквания: faq да има точно 5 въпроса. Draft да е реалистична професионална бланка по българското право, готова за подпис след попълване на скобите.`;
}

interface ContentResult {
  intro: string;
  usageCases: string[];
  requirements: string[];
  mistakes: string[];
  faq: { q: string; a: string }[];
  draft: string;
}

async function generateOne(s: Spec): Promise<boolean> {
  const contentPath = join(CONTENT_DIR, `${s.slug}.ts`);
  const draftPath = join(DRAFTS_DIR, `${s.slug}.ts`);
  if (existsSync(contentPath) && existsSync(draftPath)) return true;

  const r = (await callAI(CONTENT_SYSTEM, buildContentPrompt(s))) as ContentResult | null;
  if (!r?.intro || !r?.draft) {
    console.error(`  fail: ${s.slug}`);
    return false;
  }
  const content = {
    intro: r.intro,
    usageCases: r.usageCases ?? [],
    requirements: r.requirements ?? [],
    mistakes: r.mistakes ?? [],
    faq: (r.faq ?? []).map(f => ({ q: f.q, a: f.a })),
  };
  writeFileSync(contentPath,
`// AUTO-GENERATED by scripts/gen-new-templates.ts
import type { TemplateContent } from "../templateContentTypes";

const content: TemplateContent = ${JSON.stringify(content, null, 2)};

export default content;
`, "utf8");
  writeFileSync(draftPath,
`// AUTO-GENERATED by scripts/gen-new-templates.ts
const draft = ${JSON.stringify(r.draft)};
export default draft;
`, "utf8");
  return true;
}

async function runWithConcurrency<T>(items: T[], conc: number, fn: (x: T, i: number) => Promise<any>) {
  let i = 0;
  const workers = Array.from({ length: conc }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

// --- Phase 3: Finalize -------------------------------------------------------

function rebuildIndices(specs: Spec[]) {
  // 1) Rebuild templateContent/index.ts based on every .ts in the directory.
  const contentSlugs = readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith(".ts") && f !== "index.ts")
    .map(f => f.replace(/\.ts$/, ""));
  const cIdx = `// AUTO-GENERATED by scripts/gen-new-templates.ts
import type { TemplateContent } from "../templateContentTypes";

export type TemplateContentLoader = () => Promise<TemplateContent>;

const loaders: Record<string, TemplateContentLoader> = {
${contentSlugs.map(s => `  ${JSON.stringify(s)}: () => import("./${s}").then((m) => m.default),`).join("\n")}
};

export function loadTemplateContent(slug: string): Promise<TemplateContent> | undefined {
  const fn = loaders[slug];
  return fn ? fn() : undefined;
}

export function hasTemplateContent(slug: string): boolean {
  return slug in loaders;
}
`;
  writeFileSync(CONTENT_INDEX, cIdx, "utf8");

  // 2) Rebuild templateDrafts/index.ts.
  const draftSlugs = readdirSync(DRAFTS_DIR)
    .filter(f => f.endsWith(".ts") && f !== "index.ts")
    .map(f => f.replace(/\.ts$/, ""));
  const dIdx = `// AUTO-GENERATED by scripts/gen-new-templates.ts
export type TemplateDraftLoader = () => Promise<string>;

const loaders: Record<string, TemplateDraftLoader> = {
${draftSlugs.map(s => `  ${JSON.stringify(s)}: () => import("./${s}").then((m) => m.default),`).join("\n")}
};

export function loadTemplateDraft(slug: string): Promise<string> | undefined {
  const fn = loaders[slug];
  return fn ? fn() : undefined;
}

export function hasTemplateDraft(slug: string): boolean {
  return slug in loaders;
}
`;
  writeFileSync(DRAFTS_INDEX, dIdx, "utf8");

  // 3) Update templateContentMeta.ts (read previous + merge new).
  let existing: Record<string, { introExcerpt: string }> = {};
  if (existsSync(META_FILE)) {
    try {
      // eval-style import via dynamic require would be heavy; parse JSON block instead
      const txt = readFileSync(META_FILE, "utf8");
      const m = txt.match(/=\s*({[\s\S]*});?\s*$/);
      if (m) existing = JSON.parse(m[1]);
    } catch {}
  }
  for (const slug of contentSlugs) {
    if (existing[slug]) continue;
    try {
      const txt = readFileSync(join(CONTENT_DIR, `${slug}.ts`), "utf8");
      const im = txt.match(/"intro":\s*"((?:\\"|[^"])*)"/);
      const intro = im ? im[1].replace(/\\"/g, '"') : "";
      existing[slug] = { introExcerpt: intro.slice(0, 200) };
    } catch {}
  }
  writeFileSync(META_FILE,
`// AUTO-GENERATED — synced by scripts/gen-new-templates.ts
export interface TemplateContentMeta {
  introExcerpt: string;
}

export const TEMPLATE_CONTENT_META: Record<string, TemplateContentMeta> = ${JSON.stringify(existing, null, 2)};
`, "utf8");

  // 4) Write newTemplates.ts — only specs whose content+draft both exist.
  const have = new Set(contentSlugs.filter(s => draftSlugs.includes(s)));
  const entries = specs.filter(s => have.has(s.slug));
  const tsArr = entries.map(s => `  { categoryId: ${JSON.stringify(s.categoryId)}, doc: { name: ${JSON.stringify(s.name)}, purpose: ${JSON.stringify(s.purpose)}, keyClause: ${JSON.stringify(s.keyClause)}, documentType: ${JSON.stringify(s.documentType)}, badge: "NEW" } },`).join("\n");
  writeFileSync(NEW_TEMPLATES_FILE,
`// AUTO-GENERATED by scripts/gen-new-templates.ts
import type { CatalogDocument } from "./catalog";

export interface NewTemplateEntry {
  categoryId: string;
  doc: CatalogDocument;
}

export const NEW_TEMPLATES: NewTemplateEntry[] = [
${tsArr}
];
`, "utf8");

  console.log(`[finalize] content=${contentSlugs.length} drafts=${draftSlugs.length} catalog=${entries.length}`);
}

// --- Main --------------------------------------------------------------------

const mode = process.argv[2];

async function main() {
  const specs = await generateSpecs();
  console.log(`[main] ${specs.length} specs (target ${TOTAL_TARGET})`);

  if (mode === "finalize") {
    rebuildIndices(specs);
    return;
  }
  if (mode === "specs") {
    return;
  }

  const todo = specs.filter(s => !(existsSync(join(CONTENT_DIR, `${s.slug}.ts`)) && existsSync(join(DRAFTS_DIR, `${s.slug}.ts`))));
  console.log(`[main] ${todo.length} to generate, ${specs.length - todo.length} already done`);

  let done = 0, fail = 0;
  await runWithConcurrency(todo, 6, async (s, idx) => {
    const ok = await generateOne(s);
    if (ok) done++; else fail++;
    if ((done+fail) % 5 === 0) console.log(`  progress ${done+fail}/${todo.length} (ok=${done} fail=${fail})`);
  });
  console.log(`[main] generated ok=${done} fail=${fail}`);

  rebuildIndices(specs);
}

main().catch(e => { console.error(e); process.exit(1); });
