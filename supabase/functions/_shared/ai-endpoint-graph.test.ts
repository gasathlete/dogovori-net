/**
 * ТРАНЗИТИВНО ОТКРИВАНЕ НА AI ВХОДОВЕ.
 *
 * Обхождането е рекурсивно и безопасно при цикли: статични и динамични вносове,
 * локални файлове на функцията и общи помощници (на произволна дълбочина), както
 * и делегиране между функции. Нерегистриран вход или ново делегиране прекъсва CI.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AI_ENDPOINT_POLICIES, findAiEndpointPolicy } from "./ai-endpoint-policy.ts";
import {
  buildAiEndpointGraph,
  reachableFiles,
  referencedModules,
  resolvePath,
} from "./ai-endpoint-graph.ts";

const FUNCTIONS_DIR = new URL("../", import.meta.url).pathname;

const SEED_MARKERS = ["ai.gateway.lovable.dev", "createProductModelPort"];

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return null;
  }
}

/** Чете целия корпус от функции в карта „нормализиран път -> съдържание“. */
async function loadFiles(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  async function walk(prefix: string) {
    for await (const entry of Deno.readDir(`${FUNCTIONS_DIR}${prefix}`)) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory) {
        if (entry.name === "tests") continue;
        await walk(rel);
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
      const src = await readIfExists(`${FUNCTIONS_DIR}${rel}`);
      if (src !== null) files.set(rel, src);
    }
  }
  await walk("");
  return files;
}

Deno.test("транзитивно открити AI входове са класифицирани", async () => {
  const files = await loadFiles();
  const { aiEndpoints } = buildAiEndpointGraph({ files, seedMarkers: SEED_MARKERS });
  assert(aiEndpoints.length > 0, "не са открити AI входове");
  const unknown = aiEndpoints.filter((n) => !findAiEndpointPolicy(n));
  assertEquals(unknown, [], `неклассифицирани AI входове: ${unknown.join(", ")}`);
});

Deno.test("делегиране към AI функция е описано в регистъра", async () => {
  const files = await loadFiles();
  const { aiEndpoints, delegations } = buildAiEndpointGraph({ files, seedMarkers: SEED_MARKERS });
  const aiSet = new Set(aiEndpoints);
  const offenders: string[] = [];
  for (const [fn, targets] of delegations) {
    for (const target of targets) {
      if (target === fn) continue;
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

// ---------------------------------------------------------------------------
// Фикстури: верига, цикъл, динамичен внос, непознат достигнат файл
// ---------------------------------------------------------------------------

function fx(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

Deno.test("относителните пътища се нормализират", () => {
  assertEquals(resolvePath("a/index.ts", "./local.ts"), "a/local.ts");
  assertEquals(resolvePath("a/index.ts", "../_shared/x.ts"), "_shared/x.ts");
  assertEquals(resolvePath("a/sub/f.ts", "../../_shared/x.ts"), "_shared/x.ts");
});

Deno.test("статични и динамични вносове се разпознават", () => {
  const src = `import { a } from "./a.ts";\nconst m = await import("../_shared/b.ts");`;
  assertEquals(referencedModules(src).sort(), ["../_shared/b.ts", "./a.ts"]);
});

Deno.test("дълга верига през общи помощници достига AI повикването", () => {
  const files = fx({
    "chain/index.ts": `import { a } from "../_shared/a.ts";`,
    "_shared/a.ts": `import { b } from "./b.ts";`,
    "_shared/b.ts": `const m = await import("./c.ts");`,
    "_shared/c.ts": `fetch("https://ai.gateway.lovable.dev/v1/chat/completions");`,
  });
  const g = buildAiEndpointGraph({ files, seedMarkers: SEED_MARKERS });
  assertEquals(g.aiEndpoints, ["chain"]);
});

Deno.test("цикличен внос не зацикля обхождането", () => {
  const files = fx({
    "loop/index.ts": `import { a } from "../_shared/a.ts";`,
    "_shared/a.ts": `import { b } from "./b.ts";`,
    "_shared/b.ts": `import { a } from "./a.ts";\nfetch("https://ai.gateway.lovable.dev/v1");`,
  });
  const g = buildAiEndpointGraph({ files, seedMarkers: SEED_MARKERS });
  assertEquals(g.aiEndpoints, ["loop"]);
  assertEquals(reachableFiles(files, "loop/index.ts").sort(), [
    "_shared/a.ts",
    "_shared/b.ts",
    "loop/index.ts",
  ]);
});

Deno.test("функция без AI по веригата не се отчита като вход", () => {
  const files = fx({
    "plain/index.ts": `import { u } from "../_shared/u.ts";`,
    "_shared/u.ts": `export const u = 1;`,
  });
  assertEquals(buildAiEndpointGraph({ files, seedMarkers: SEED_MARKERS }).aiEndpoints, []);
});

Deno.test("делегиране се открива и през внесен помощник", () => {
  const files = fx({
    "caller/index.ts": `import { go } from "./go.ts";`,
    "caller/go.ts": `supabase.functions.invoke("target");`,
    "target/index.ts": `fetch("https://ai.gateway.lovable.dev/v1");`,
  });
  const g = buildAiEndpointGraph({ files, seedMarkers: SEED_MARKERS });
  assertEquals(g.delegations.get("caller"), ["target"]);
  assertEquals(g.aiEndpoints, ["target"]);
});

Deno.test("непознат достигнат файл не чупи обхождането", () => {
  const files = fx({ "x/index.ts": `import { q } from "./missing.ts";` });
  assertEquals(reachableFiles(files, "x/index.ts").sort(), ["x/index.ts", "x/missing.ts"]);
});
