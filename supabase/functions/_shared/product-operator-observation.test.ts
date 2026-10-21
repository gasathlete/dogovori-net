import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { boundedOperatorProbe } from "./product-operator-observation.ts";
import { readProductIntegrationConfig } from "./product-integration-config.ts";

Deno.test("operator errors remain unknown rather than false", async () => {
  assertEquals(await boundedOperatorProbe(async () => { throw new Error("private detail"); }), { state: "unknown", code: "probe_error" });
});
Deno.test("operator timeout remains unknown rather than false", async () => {
  assertEquals(await boundedOperatorProbe(() => new Promise(() => {}), 1), { state: "unknown", code: "probe_timeout" });
});
Deno.test("operator distinguishes verified readiness from verified not ready", async () => {
  assertEquals(await boundedOperatorProbe(async () => true), { state: "ready" });
  assertEquals(await boundedOperatorProbe(async () => false), { state: "not_ready" });
});
Deno.test("config projection never includes credential values", () => {
  const config = readProductIntegrationConfig(() => "synthetic-private-value");
  assertEquals(JSON.stringify(config).includes("synthetic-private-value"), false);
  assertEquals(config.checkoutEnabled, false);
  assertEquals(config.zeroRetentionVerified, false);
  assertEquals(config.stripe.sandbox.configured, true);
});