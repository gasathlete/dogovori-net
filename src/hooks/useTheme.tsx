import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";
const STORAGE_KEY = "dogovori:theme";

type Ctx = { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void };
const ThemeCtx = createContext<Ctx | null>(null);

function readInitial(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  // New visitors get the light paper theme; an explicit saved choice always wins.
  return "light";
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

  // OS theme changes are intentionally not followed — light is the default.

  const setTheme = useCallback((t: Theme) => { setUserChose(true); setThemeState(t); }, []);
  const toggle = useCallback(() => { setUserChose(true); setThemeState((p) => (p === "dark" ? "light" : "dark")); }, []);

  return <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeCtx);
  if (!ctx) {
    // Fallback (e.g. used before provider mounts) — no-op writer.
    return { theme: "light", setTheme: () => {}, toggle: () => {} };
  }
  return ctx;
}
