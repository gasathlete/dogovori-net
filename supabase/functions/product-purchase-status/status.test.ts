import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { purchaseStatus } from "./status.ts";

Deno.test("затворен LIVE ред → не може да се купи, дори за влязъл", () => {
  assertEquals(purchaseStatus({ environment: "live", launchOpen: false, signedIn: true, staff: true }).available, false);
  assertEquals(purchaseStatus({ environment: "live", launchOpen: false, signedIn: false, staff: false }).reason, "live_closed");
});
Deno.test("отворен LIVE ред → може", () => {
  assertEquals(purchaseStatus({ environment: "live", launchOpen: true, signedIn: true, staff: false }), { available: true, reason: null });
});
Deno.test("sandbox: не-staff не може, staff може", () => {
  assertEquals(purchaseStatus({ environment: "sandbox", launchOpen: true, signedIn: true, staff: false }).reason, "sandbox_staff_only");
  assertEquals(purchaseStatus({ environment: "sandbox", launchOpen: true, signedIn: true, staff: true }).available, true);
});
