import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideSnapshot } from "./legal-monitor-core.ts";

Deno.test("unchanged law PDF with a new parser needs a fresh processing receipt", () => {
  const checksum = "b7bc47d0".repeat(8);
  assertEquals(decideSnapshot(checksum, checksum, { previous: "law-pdf-v1", current: "law-pdf-v2" }), "new_snapshot");
  assertEquals(decideSnapshot(checksum, checksum, { previous: "law-pdf-v2", current: "law-pdf-v2" }), "unchanged");
});
Deno.test("unknown parser provenance cannot become an unchanged verified snapshot", () => {
  assertEquals(decideSnapshot("same", "same", { previous: null, current: "law-pdf-v2" }), "new_snapshot");
  assertEquals(decideSnapshot("same", "same", { previous: "", current: "law-pdf-v2" }), "new_snapshot");
  assertEquals(decideSnapshot("same", "same", { previous: "law-pdf-v2", current: "" }), "new_snapshot");
});
Deno.test("changed bytes always need a new snapshot; legacy comparison is preserved", () => {
  assertEquals(decideSnapshot("old", "new", { previous: "v2", current: "v2" }), "new_snapshot");
  assertEquals(decideSnapshot(null, "new", { previous: null, current: "v2" }), "new_snapshot");
  assertEquals(decideSnapshot("same", "same"), "unchanged");
});
