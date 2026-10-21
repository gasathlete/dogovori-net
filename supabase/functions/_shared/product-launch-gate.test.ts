import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { publicProductLaunchAllowed, type LaunchGateClient } from "./product-launch-gate.ts";
function client(data: { live_enabled: boolean } | null, error: unknown = null): LaunchGateClient {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }) }) };
}
Deno.test("LIVE default false blocks new public purchases", async () => {
  assertEquals(await publicProductLaunchAllowed(client({ live_enabled: false }), "live"), false);
});
Deno.test("LIVE explicit service opening permits new purchases", async () => {
  assertEquals(await publicProductLaunchAllowed(client({ live_enabled: true }), "live"), true);
});
Deno.test("LIVE missing control or query error fails closed", async () => {
  assertEquals(await publicProductLaunchAllowed(client(null), "live"), false);
  assertEquals(await publicProductLaunchAllowed(client({ live_enabled: true }, "unavailable"), "live"), false);
});
Deno.test("sandbox remains independent of LIVE switch", async () => {
  assertEquals(await publicProductLaunchAllowed(client({ live_enabled: false }), "sandbox"), true);
});