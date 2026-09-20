import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AI_ENDPOINT_POLICIES, findAiEndpointPolicy } from "./ai-endpoint-policy.ts";

const FUNCTIONS_DIR = new URL("../", import.meta.url).pathname;

const GATEWAY_MARKERS = [
  "ai.gateway.lovable.dev",
  "createProductModelPort",
  "functions/v1/generate-contract",
];

async function discoverAiEndpoints(): Promise<string[]> {
  const found: string[] = [];
  for await (const entry of Deno.readDir(FUNCTIONS_DIR)) {
    if (!entry.isDirectory || entry.name === "_shared" || entry.name === "tests") continue;
    let src = "";
    try {
      src = await Deno.readTextFile(`${FUNCTIONS_DIR}${entry.name}/index.ts`);
    } catch {
      continue;
    }
    if (GATEWAY_MARKERS.some((m) => src.includes(m))) found.push(entry.name);
  }
  return found.sort();
}

Deno.test("всеки AI вход е класифициран в регистъра", async () => {
  const discovered = await discoverAiEndpoints();
  assert(discovered.length > 0, "не са открити AI входове");
  const unknown = discovered.filter((n) => !findAiEndpointPolicy(n));
  assertEquals(unknown, [], `неклассифицирани AI входове: ${unknown.join(", ")}`);
});

Deno.test("регистърът не описва изчезнали функции", async () => {
  const discovered = new Set(await discoverAiEndpoints());
  const stale = AI_ENDPOINT_POLICIES.map((p) => p.name).filter((n) => !discovered.has(n));
  assertEquals(stale, [], `остарели записи: ${stale.join(", ")}`);
});

Deno.test("всеки клиентски правен вход има строга преграда в кода", async () => {
  const required = AI_ENDPOINT_POLICIES.filter((p) => p.requiresStrictLegalGate);
  for (const policy of required) {
    const src = await Deno.readTextFile(`${FUNCTIONS_DIR}${policy.name}/index.ts`);
    const grounded = src.includes("retrieveLegalContext")
      || src.includes("legal_verification_unavailable");
    assert(grounded, `${policy.name} няма извличане/преграда за правен контекст`);
  }
});

Deno.test("редакционните входове не могат да одобряват или публикуват", async () => {
  const editorial = AI_ENDPOINT_POLICIES.filter((p) => p.kind === "editorial_draft_only");
  for (const policy of editorial) {
    const src = await Deno.readTextFile(`${FUNCTIONS_DIR}${policy.name}/index.ts`);
    assert(!/status:\s*"approved"/.test(src), `${policy.name} задава status approved`);
    assert(!/published_at:\s*new Date\(\)/.test(src), `${policy.name} публикува автоматично`);
    assert(!/reviewed_by:\s*userId/.test(src), `${policy.name} се самопрегледва`);
  }
});
