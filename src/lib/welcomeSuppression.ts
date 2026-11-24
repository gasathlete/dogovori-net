/**
 * Приветственият прозорец не се отваря върху покупка, плащане или резултат —
 * там човекът е по средата на задача.
 */
export function isWelcomeSuppressedPath(pathname: string): boolean {
  return (
    /^\/produkti\/[^/]+\/start\/?$/.test(pathname) ||
    pathname.startsWith("/produkti/rezultat") ||
    pathname.startsWith("/produkti/moite-pokupki") ||
    pathname.startsWith("/checkout")
  );
}
