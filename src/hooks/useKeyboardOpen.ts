import { useEffect, useState } from "react";

/**
 * Отчита софтуерната клавиатура на мобилно (visualViewport се смалява спрямо
 * layout viewport) и връща височината ѝ, за да могат фиксираните долни ленти
 * да се повдигнат вместо да се застъпват с клавиатурата.
 */
export function useKeyboardInset(threshold = 140) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const diff = window.innerHeight - vv.height - vv.offsetTop;
      setInset(diff > threshold ? Math.round(diff) : 0);
    };
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, [threshold]);

  return inset;
}

/** Удобен булев вариант. */
export function useKeyboardOpen(threshold = 140) {
  return useKeyboardInset(threshold) > 0;
}
