/**
 * Shared Escape rule for hand-rolled overlays (menu, AI chooser/panel).
 * Radix layers (dialogs, popovers, menus) own Escape themselves, so a custom
 * layer only reacts when no Radix layer is open and nobody handled the key.
 */
export function shouldHandleEscape(event: KeyboardEvent, doc: Document = document): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  return !doc.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper]');
}
