// Wrapper around the generated sub-wizard payload.
// The actual data lives in `subWizards.generated.json` (318 entries) to keep
// this TS surface tiny — large generated payloads do not need to be re-parsed
// as TypeScript on every edit. Public API is unchanged.
import type { SubWizard } from "./sectors";
import registryData from "./subWizards.generated.json";

export const REGISTRY: Record<string, SubWizard> = registryData as Record<string, SubWizard>;

export function getGeneratedSubWizard(documentName: string): SubWizard | undefined {
  return REGISTRY[documentName];
}

export const GENERATED_SUBWIZARD_NAMES: string[] = Object.keys(REGISTRY);
