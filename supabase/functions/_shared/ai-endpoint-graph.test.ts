/**
 * ТРАНЗИТИВНО ОТКРИВАНЕ НА AI ВХОДОВЕ.
 *
 * Не търсим само пряко повикване към шлюза в index.ts: изграждаме граф на
 * вносовете (включително общите помощници) и на делегирането между функции
 * (supabase.functions.invoke и /functions/v1/<име>). Нерегистриран вход или
 * ново делегиране през нов помощник прекъсва CI.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AI_ENDPOINT_POLICIES, findAiEndpointPolicy } from "./ai-endpoint-policy.ts";

const FUNCTIONS_DIR = new URL("../", import.meta.url).pathname;

const SEED_MARKERS = ["ai.gateway.lovable.dev", "createProductModelPort"];

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return null;
  }
}

function localImports(src: string): string[] {
  return [...src.matchAll(/from\s+"(\.[^"]+\.ts)"/g)].map((m) => m[1]);
}

function delegations(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(/functions\.invoke\(\s*"([a-z0-9-]+)"/g)) names.add(m[1]);
  for (const m of src.matchAll(/functions\/v1\/([a-z0-9-]+)/g)) names.add(m[1]);
  return [...names];
}

/** Помощници, които сами по себе си правят AI повикване. */
async function aiHelpers(): Promise<Set<string>> {
  const set = new Set<string>();
  for await (const entry of Deno.readDir(`${FUNCTIONS_DIR}_shared`)) {
    if (!entry.isFile || !entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
    const src = await readIfExists(`${FUNCTIONS_DIR}_shared/${entry.name}`);
    if (src && SEED_MARKERS.some((m) => src.includes(m))) set.add(`./${entry.name}`);
  }
  return set;
}

async function discover(): Promise<{ endpoints: string[]; delegated: Map<string, string[]> }> {
  const helpers = await aiHelpers();
  const endpoints: string[] = [];
  const delegated = new Map<string, string[]>();

  for await (const entry of Deno.readDir(FUNCTIONS_DIR)) {
    if (!entry.isDirectory || entry.name === "_shared" || entry.name === "tests") continue;
    const dir = `${FUNCTIONS_DIR}${entry.name}`;
    const index = await readIfExists(`${dir}/index.ts`);
    if (!index) continue;

    // Транзитивно: index.ts + всички локални вносове в същата функция.
    let combined = index;
    const seen = new Set<string>();
    const queue = localImports(index);
    let usesAiHelper = false;
    while (queue.length) {
      const rel = queue.shift()!;
      if (seen.has(rel)) continue;
      seen.add(rel);
      if (rel.startsWith("../_shared/")) {
        if (helpers.has(`./${rel.replace("../_shared/", "")}`)) usesAiHelper = true;
        continue;
      }
      const src = await readIfExists(`${dir}/${rel.replace(/^\.\//, "")}`);
      if (!src) continue;
      combined += `\n${src}`;
      queue.push(...localImports(src));
    }
    // Вносове през динамичен import() също се отчитат по текстов маркер.
    for (const helper of helpers) {
      if (index.includes(helper.replace("./", "_shared/"))) usesAiHelper = true;
    }

    const isAi = SEED_MARKERS.some((m) => combined.includes(m)) || usesAiHelper;
    const deleg = delegations(combined).filter((n) => n !== entry.name);
    if (deleg.length) delegated.set(entry.name, deleg);
    if (isAi) endpoints.push(entry.name);
  }
  return { endpoints: endpoints.sort(), delegated };
}

Deno.test("транзитивно откритите AI входове са класифицирани", async () => {
  const { endpoints } = await discover();
  assert(endpoints.length > 0, "не са открити AI входове");
  const unknown = endpoints.filter((n) => !findAiEndpointPolicy(n));
  assertEquals(unknown, [], `неклассифицирани AI входове: ${unknown.join(", ")}`);
});

Deno.test("делегиране към AI функция е описано в регистъра", async () => {
  const { endpoints, delegated } = await discover();
  const aiSet = new Set(endpoints);
  const offenders: string[] = [];
  for (const [fn, targets] of delegated) {
    for (const target of targets) {
      if (!aiSet.has(target) && !findAiEndpointPolicy(target)) continue;
      if (!findAiEndpointPolicy(fn)) offenders.push(`${fn} -> ${target}`);
    }
  }
  assertEquals(offenders, [], `нерегистрирано делегиране: ${offenders.join(", ")}`);
});

Deno.test("регистърът остава непразен и без дублирани имена", () => {
  const names = AI_ENDPOINT_POLICIES.map((p) => p.name);
  assertEquals(names.length, new Set(names).size);
  assert(names.length >= 15);
});
