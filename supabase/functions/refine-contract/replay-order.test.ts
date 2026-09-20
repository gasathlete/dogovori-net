/**
 * Регресия върху ПОРЕДНОСТТА в refine-contract: точното повторение на вече
 * завършена операция се разпознава ПРЕДИ правното заземяване и модела, и НИКОГА
 * не издава нов пропуск за ревизия.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const at = (needle: string) => {
  const i = src.indexOf(needle);
  assert(i >= 0, `липсва ${needle}`);
  return i;
};

Deno.test("само-четящото търсене е преди правното заземяване", () => {
  assert(at("lookupCommittedOperation(ledgerDb") < at("retrieveLegalContext("));
});

Deno.test("само-четящото търсене е преди резервацията на квота", () => {
  assert(at("lookupCommittedOperation(ledgerDb") < at("reserveQuota(ledgerDb"));
});

Deno.test("точният отпечатък се изчислява преди търсенето", () => {
  assert(at("requestDigest") < at("lookupCommittedOperation(ledgerDb"));
});

Deno.test("пропуск за ревизия се издава точно веднъж и само по нов резултат", () => {
  const mints = src.match(/reviewGrantForRefinedContract\(/g) ?? [];
  // едно определение + едно единствено извикване
  assert(mints.length === 2, `очаквано 2 споменавания, намерени ${mints.length}`);
  // извикването е СЛЕД модела и резервацията, тоест никога по пътя на повторение
  assert(at("reserveQuota(ledgerDb") < src.lastIndexOf("reviewGrantForRefinedContract("));
});

Deno.test("повторението връща записания товар, без модел", () => {
  const replay = src.indexOf("exactReplayResponse(stored)");
  assert(replay >= 0 && replay < at("retrieveLegalContext("));
});
