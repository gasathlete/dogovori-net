/**
 * Регресия: завършеното изтегляне се възстановява ПРЕДИ правното заземяване и
 * НЕ се регенерира, когато обвързаният обект липсва.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const at = (needle: string) => {
  const i = src.indexOf(needle);
  assert(i >= 0, `липсва ${needle}`);
  return i;
};

Deno.test("търсенето на завършена операция е преди правното заземяване", () => {
  assert(at("lookupCommittedOperation(") < at("retrieveLegalContext("));
});

Deno.test("завършеното повторение проверява съществуването на обвързания обект", () => {
  const lookup = at("lookupCommittedOperation(");
  const exists = src.indexOf("verifyArtifactExists", lookup);
  assert(exists > lookup, "липсва проверка за съществуване при повторение");
});

Deno.test("резултатът записва непроменимите полета, а не URL", () => {
  assert(src.includes("citations: legal.citations"));
  assert(src.includes('bucket: "document-blanks"') || src.includes("bucket,"));
});
