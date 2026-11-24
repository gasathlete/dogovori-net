export type PurchaseStatusReason = "live_closed" | "sandbox_staff_only" | "unavailable" | null;
export type PurchaseStatus = { available: boolean; reason: PurchaseStatusReason; signInRequired?: boolean };

/** Чиста логика: затворен LIVE ред или не-staff в sandbox → не може да се купи. */
export function purchaseStatus(input: {
  environment: "sandbox" | "live";
  launchOpen: boolean;
  signedIn: boolean;
  staff: boolean;
}): PurchaseStatus {
  if (input.environment === "live") {
    return input.launchOpen
      ? { available: true, reason: null, ...(input.signedIn ? {} : { signInRequired: true }) }
      : { available: false, reason: "live_closed" };
  }
  // Sandbox: само екипът може да плаща с тестова карта. Гост още не е известен.
  if (!input.signedIn) return { available: true, reason: null, signInRequired: true };
  return input.staff ? { available: true, reason: null } : { available: false, reason: "sandbox_staff_only" };
}
