import { useEffect, useState } from "react";

/**
 * Отчита дали софтуерната клавиатура е отворена на мобилно устройство
 * (visualViewport се смалява значително спрямо layout viewport).
 * Използва се, за да не се застъпват фиксираните долни ленти с клавиатурата.
 */
export function useKeyboardOpen(threshold = 140) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const diff = window.innerHeight - vv.height;
      setOpen(diff > threshold);
    };
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, [threshold]);

  return open;
}
