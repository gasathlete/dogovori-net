/**
 * Scroll to an element by id, waiting for it to be mounted.
 * Useful when the target lives inside a lazy-loaded section.
 */
export function scrollToHash(id: string, opts?: { updateHash?: boolean; timeoutMs?: number }) {
  const updateHash = opts?.updateHash ?? true;
  const timeoutMs = opts?.timeoutMs ?? 4000;
  const start = performance.now();

  const tryScroll = () => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      if (updateHash && window.location.hash !== `#${id}`) {
        window.history.replaceState(null, "", `#${id}`);
      }
      return true;
    }
    return false;
  };

  if (tryScroll()) return;

  // Force lazy sections below the fold to mount by scrolling near the bottom first.
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });

  const tick = () => {
    if (tryScroll()) return;
    if (performance.now() - start > timeoutMs) return;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
