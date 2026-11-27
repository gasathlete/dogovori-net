/**
 * DTrust — публичен вход към слоя за електронно подписване.
 *
 * Днес връща sandbox доставчика. Когато B-Trust договорът е налице,
 * `getSignatureProvider` ще избира реалния адаптер по конфигурация,
 * без промяна в UI-а.
 */

export * from "./types";
export { SandboxSignatureProvider, sandboxProvider } from "./sandboxProvider";
export { sha256HexOfBlob } from "./hash";

import type { SignatureProvider } from "./types";
import { sandboxProvider } from "./sandboxProvider";

export function getSignatureProvider(): SignatureProvider {
  return sandboxProvider;
}
