/** Ephemeral observed auth event, not URL consent or a server authorization. */
let recoveryOwner: string | null = null;
export function observeRecovery(event: string, userId?: string) {
  if (event === "PASSWORD_RECOVERY") recoveryOwner = userId ?? null;
  else if (event === "SIGNED_OUT") recoveryOwner = null;
}
export function isRecoveryOwner(userId?: string) {
  return Boolean(userId && userId === recoveryOwner);
}
export function finishRecovery() { recoveryOwner = null; }