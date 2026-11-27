/**
 * ГРАФ НА AI ВХОДОВЕТЕ — чиста, обходима и безопасна при цикли логика.
 *
 * Обхождат се статични И динамични вносове, локалните файлове на функцията и
 * общите помощници (рекурсивно, а не само на едно ниво), както и делегирането
 * между функции. Цикличните вносове не зациклят обхождането.
 *
 * Модулът работи върху карта „път -> съдържание“, за да може да се тества с
 * фикстури, без да чете файловата система.
 */

export interface GraphInput {
  /** Съдържание по нормализиран път, напр. "_shared/legal-rag.ts", "assistant-chat/index.ts". */
  files: Map<string, string>;
  /** Маркери, които сами по себе си означават AI повикване. */
  seedMarkers: string[];
}

export interface GraphResult {
  /** Функции, които достигат AI повикване пряко ИЛИ чрез делегиране. */
  aiEndpoints: string[];
  /** Функции с пряко AI повикване по веригата от вносове. */
  directAiEndpoints: string[];
  /** Функция -> функции, към които делегира. */
  delegations: Map<string, string[]>;
  /** Функция -> достигнати файлове (за диагностика). */
  reached: Map<string, string[]>;
  /** Достигнати локални модули, които липсват в корпуса. */
  unknownModules: string[];
  /** Делегирания към непознати функции. */
  unknownDelegates: string[];
}

// Двойни И единични кавички; `from`, странични вносове (`import "./x.ts"`),
// реекспорт (`export ... from`) и динамични `import("./x.ts")`.
const FROM_RE = /(?:from|import)\s+['"]([^'"]+)['"]/g;
const DYNAMIC_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
const INVOKE_RE = /functions\.invoke\(\s*['"]([a-z0-9-]+)['"]/g;
const URL_RE = /functions\/v1\/([a-z0-9-]+)/g;

export function referencedModules(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(FROM_RE)) out.add(m[1]);
  for (const m of src.matchAll(DYNAMIC_RE)) out.add(m[1]);
  return [...out].filter((s) => s.startsWith("."));
}

export function delegatedFunctions(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(INVOKE_RE)) out.add(m[1]);
  for (const m of src.matchAll(URL_RE)) out.add(m[1]);
  return [...out];
}

/** Нормализира относителен път спрямо директорията на текущия файл. */
export function resolvePath(fromFile: string, rel: string): string {
  const baseParts = fromFile.split("/").slice(0, -1);
  const parts = rel.split("/");
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") baseParts.pop();
    else baseParts.push(p);
  }
  return baseParts.join("/");
}

function isTest(path: string): boolean {
  return path.endsWith(".test.ts");
}

/** Разрешава разширение: точен път, после `.ts`, после `/index.ts`. */
export function resolveModule(files: Map<string, string>, path: string): string {
  if (files.has(path)) return path;
  if (files.has(`${path}.ts`)) return `${path}.ts`;
  if (files.has(`${path}/index.ts`)) return `${path}/index.ts`;
  return path;
}

/** Обхожда рекурсивно и безопасно при цикли; връща достигнатите файлове. */
export function reachableFiles(files: Map<string, string>, entry: string): string[] {
  const seen = new Set<string>();
  const queue = [resolveModule(files, entry)];
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path) || isTest(path)) continue;
    const src = files.get(path);
    if (src === undefined) {
      // Непознат файл се отчита като достигнат, но няма какво да се обходи.
      seen.add(path);
      continue;
    }
    seen.add(path);
    for (const rel of referencedModules(src)) {
      queue.push(resolveModule(files, resolvePath(path, rel)));
    }
  }
  return [...seen];
}

export function buildAiEndpointGraph(input: GraphInput): GraphResult {
  const { files, seedMarkers } = input;
  const functionNames = new Set<string>();
  for (const path of files.keys()) {
    const [dir, ...rest] = path.split("/");
    if (!dir || dir === "_shared" || dir === "tests" || rest.length === 0) continue;
    if (rest.join("/") === "index.ts") functionNames.add(dir);
  }

  const direct = new Set<string>();
  const delegations = new Map<string, string[]>();
  const reached = new Map<string, string[]>();
  const unknownModules = new Set<string>();
  const unknownDelegates = new Set<string>();

  for (const name of [...functionNames].sort()) {
    const entry = `${name}/index.ts`;
    const paths = reachableFiles(files, entry);
    reached.set(name, paths);
    let combined = "";
    for (const p of paths) {
      const src = files.get(p);
      if (src === undefined) unknownModules.add(p);
      combined += `\n${src ?? ""}`;
    }
    if (seedMarkers.some((m) => combined.includes(m))) direct.add(name);
    const del = new Set<string>();
    for (const p of paths) for (const d of delegatedFunctions(files.get(p) ?? "")) del.add(d);
    for (const d of del) if (d !== name && !functionNames.has(d)) unknownDelegates.add(d);
    delegations.set(name, [...del].sort());
  }

  // Транзитивно: ако A делегира към AI функция B, A също е AI вход.
  const ai = new Set(direct);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [fn, targets] of delegations) {
      if (ai.has(fn)) continue;
      if (targets.some((t) => t !== fn && ai.has(t))) {
        ai.add(fn);
        changed = true;
      }
    }
  }

  return {
    aiEndpoints: [...ai].sort(),
    directAiEndpoints: [...direct].sort(),
    delegations,
    reached,
    unknownModules: [...unknownModules].sort(),
    unknownDelegates: [...unknownDelegates].sort(),
  };
}
