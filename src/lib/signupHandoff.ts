import { safeReturnPath } from "@/lib/safeRoute";

/** Captured once at auth identity creation; never read back from mutable metadata. */
export function signupHandoff(marketing: boolean, returnPath: string) {
  return {
    event_id: crypto.randomUUID(), terms: true, privacy: true, age_18: true,
    operational_notifications: true, marketing,
    return_path: safeReturnPath(returnPath, "/account"),
  };
}