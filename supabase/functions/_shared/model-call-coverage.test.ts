/**
 * ПОКРИТИЕ НА ПОВИКВАНИЯТА КЪМ МОДЕЛ
 *
 * Тестът пази три неща:
 *  1) Всяка крайна точка, обявена за защитена в model-call-manifest.json, НЕ
 *     използва наследените квотни RPC и наистина има трайна резервация +
 *     терминално уреждане (потвърждаване/отмяна) и само-четящо търсене.
 *  2) Всяка функция, която чете LOVABLE_API_KEY, е описана в манифеста — нова
 *     крайна точка не може да мине тихо.
 *  3) Празнините са изброени честно като блокиращи пускането, а не обявени за
 *     зелени.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const ROOT = new URL("../", import.meta.url).pathname;

type ManifestEntry = { function: string; mechanism: string };
type Manifest = {
  ledgerEnforced: ManifestEntry[];
  releaseBlockingInventory: (ManifestEntry & { gap: string })[];
  notUserTriggered: string[];
  noModelCall: string[];
};

const manifest: Manifest = JSON.parse(
  await Deno.readTextFile(`${ROOT}_shared/model-call-manifest.json`),
);

const LEGACY_RPCS = [
  "consume_quota",
  "consume_quota_session",
  "refund_quota",
  "charge_corrections_wave",
];

async function readHandler(name: string): Promise<string> {
  return await Deno.readTextFile(`${ROOT}${name}/index.ts`);
}

Deno.test("защитените крайни точки не използват наследени квотни RPC", async () => {
  for (const entry of manifest.ledgerEnforced) {
    const src = await readHandler(entry.function);
    for (const rpc of LEGACY_RPCS) {
      assert(
        !src.includes(`"${rpc}"`) && !src.includes(`'${rpc}'`),
        `${entry.function} все още използва наследения RPC ${rpc}`,
      );
    }
  }
});

Deno.test("защитените крайни точки имат резервация, уреждане и само-четящо търсене", async () => {
  const reserve = /reserveQuota|reserveReviewOperation|reserveAnonDelivery/;
  const commit = /commitQuota|commitReviewOperation|commitAnonDelivery/;
  const lookup =
    /lookupCommittedOperation|lookupReviewOperation|lookupAnonDelivery|reserveAnonDelivery/;
  for (const entry of manifest.ledgerEnforced) {
    const src = await readHandler(entry.function);
    assert(reserve.test(src), `${entry.function} няма трайна резервация`);
    assert(commit.test(src), `${entry.function} няма терминално потвърждаване`);
    assert(lookup.test(src), `${entry.function} няма само-четящо търсене на завършена операция`);
  }
});

Deno.test("всяка функция с повикване към модел е описана в манифеста", async () => {
  const described = new Set([
    ...manifest.ledgerEnforced.map((e) => e.function),
    ...manifest.releaseBlockingInventory.map((e) => e.function),
    ...manifest.notUserTriggered,
    ...manifest.noModelCall,
  ]);
  const missing: string[] = [];
  for await (const dir of Deno.readDir(ROOT)) {
    if (!dir.isDirectory || dir.name.startsWith("_")) continue;
    let src: string;
    try {
      src = await readHandler(dir.name);
    } catch {
      continue;
    }
    if (!src.includes("LOVABLE_API_KEY")) continue;
    if (!described.has(dir.name)) missing.push(dir.name);
  }
  assertEquals(
    missing,
    [],
    `Неописани крайни точки с повикване към модел: ${missing.join(", ")}`,
  );
});

Deno.test("празнините са изброени честно, а не обявени за зелени", () => {
  for (const entry of manifest.releaseBlockingInventory) {
    assert(entry.gap.trim().length > 0, `${entry.function} няма описана празнина`);
    assert(
      !manifest.ledgerEnforced.some((e) => e.function === entry.function),
      `${entry.function} е едновременно защитен и блокиращ — противоречие`,
    );
  }
});
