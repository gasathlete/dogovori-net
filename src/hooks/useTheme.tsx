import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";
const STORAGE_KEY = "dogovori:theme";

type Ctx = { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void };
const ThemeCtx = createContext<Ctx | null>(null);

function readInitial(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  // Default to dark; OS preference is ignored until the user explicitly picks a theme.
  return "dark";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readInitial());
  // Track whether the user has made an explicit choice. If not, follow the OS.
  const [userChose, setUserChose] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === "light" || v === "dark";
    } catch { return false; }
  });

  useEffect(() => {
    apply(theme);
    if (userChose) {
      try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
    }
  }, [theme, userChose]);

  // Follow OS theme changes until the user explicitly picks one.
  useEffect(() => {
    if (userChose || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) => setThemeState(e.matches ? "light" : "dark");
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [userChose]);

  const setTheme = useCallback((t: Theme) => { setUserChose(true); setThemeState(t); }, []);
  const toggle = useCallback(() => { setUserChose(true); setThemeState((p) => (p === "dark" ? "light" : "dark")); }, []);

  return <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeCtx);
  if (!ctx) {
    // Fallback (e.g. used before provider mounts) — no-op writer.
    return { theme: "dark", setTheme: () => {}, toggle: () => {} };
  }
  return ctx;
}
