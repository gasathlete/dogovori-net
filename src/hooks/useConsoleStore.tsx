/**
 * Console View store — мулти-таск с persistent табове.
 * Контекст + reducer + localStorage persist (без външни зависимости).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@/hooks/useAuth";

export type ConsoleTabKind =
  | "dashboard"
  | "deal"
  | "document"
  | "uploaded"
  | "template"
  | "client"
  | "analysis"
  | "wizard"
  | "signing";

export interface ConsoleTab {
  id: string;
  kind: ConsoleTabKind;
  entityId: string | null;
  title: string;
  icon?: string;
  pinned: boolean;
  dirty: boolean;
  openedAt: number;
  scrollY?: number;
  draft?: Record<string, unknown>;
}

export type ConsoleSection =
  | "dashboard"
  | "deals"
  | "documents"
  | "uploaded"
  | "templates"
  | "clients"
  | "analyses"
  | "signing"
  | "team";

interface State {
  section: ConsoleSection;
  tabs: ConsoleTab[];
  activeId: string | null;
  closed: ConsoleTab[]; // history stack
  sidebarCollapsed: boolean;
}

type Action =
  | { type: "set_section"; section: ConsoleSection }
  | { type: "open_tab"; tab: Omit<ConsoleTab, "id" | "openedAt" | "pinned" | "dirty"> & { id?: string; pinned?: boolean } }
  | { type: "activate"; id: string }
  | { type: "close"; id: string }
  | { type: "close_others"; id: string }
  | { type: "close_all" }
  | { type: "reopen_last" }
  | { type: "toggle_pin"; id: string }
  | { type: "set_dirty"; id: string; dirty: boolean }
  | { type: "patch_tab"; id: string; patch: Partial<ConsoleTab> }
  | { type: "toggle_sidebar" }
  | { type: "hydrate"; state: Partial<State> };

const DEFAULT_DASHBOARD: ConsoleTab = {
  id: "dashboard",
  kind: "dashboard",
  entityId: null,
  title: "Табло",
  pinned: true,
  dirty: false,
  openedAt: Date.now(),
};

const initialState: State = {
  section: "dashboard",
  tabs: [DEFAULT_DASHBOARD],
  activeId: "dashboard",
  closed: [],
  sidebarCollapsed: false,
};

function tabKey(kind: ConsoleTabKind, entityId: string | null) {
  return entityId ? `${kind}:${entityId}` : kind;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set_section":
      return { ...state, section: action.section };

    case "open_tab": {
      const id = action.tab.id ?? tabKey(action.tab.kind, action.tab.entityId);
      const existing = state.tabs.find((t) => t.id === id);
      if (existing) {
        return { ...state, activeId: id };
      }
      const tab: ConsoleTab = {
        id,
        kind: action.tab.kind,
        entityId: action.tab.entityId,
        title: action.tab.title,
        icon: action.tab.icon,
        pinned: action.tab.pinned ?? false,
        dirty: false,
        openedAt: Date.now(),
      };
      return { ...state, tabs: [...state.tabs, tab], activeId: id };
    }

    case "activate":
      return { ...state, activeId: action.id };

    case "close": {
      const tab = state.tabs.find((t) => t.id === action.id);
      if (!tab || tab.pinned) return state;
      const nextTabs = state.tabs.filter((t) => t.id !== action.id);
      const nextActive =
        state.activeId === action.id
          ? nextTabs[nextTabs.length - 1]?.id ?? null
          : state.activeId;
      return {
        ...state,
        tabs: nextTabs,
        activeId: nextActive,
        closed: [tab, ...state.closed].slice(0, 10),
      };
    }

    case "close_others": {
      const keep = state.tabs.filter((t) => t.id === action.id || t.pinned);
      const removed = state.tabs.filter((t) => t.id !== action.id && !t.pinned);
      return {
        ...state,
        tabs: keep,
        activeId: action.id,
        closed: [...removed, ...state.closed].slice(0, 10),
      };
    }

    case "close_all": {
      const keep = state.tabs.filter((t) => t.pinned);
      const removed = state.tabs.filter((t) => !t.pinned);
      return {
        ...state,
        tabs: keep,
        activeId: keep[0]?.id ?? null,
        closed: [...removed, ...state.closed].slice(0, 10),
      };
    }

    case "reopen_last": {
      const [last, ...rest] = state.closed;
      if (!last) return state;
      if (state.tabs.find((t) => t.id === last.id)) {
        return { ...state, closed: rest, activeId: last.id };
      }
      return {
        ...state,
        tabs: [...state.tabs, { ...last, openedAt: Date.now() }],
        activeId: last.id,
        closed: rest,
      };
    }

    case "toggle_pin":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...t, pinned: !t.pinned } : t,
        ),
      };

    case "set_dirty":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...t, dirty: action.dirty } : t,
        ),
      };

    case "patch_tab":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...t, ...action.patch } : t,
        ),
      };

    case "toggle_sidebar":
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };

    case "hydrate":
      return { ...state, ...action.state };

    default:
      return state;
  }
}

interface Ctx {
  state: State;
  setSection: (s: ConsoleSection) => void;
  openTab: (tab: Omit<ConsoleTab, "id" | "openedAt" | "pinned" | "dirty"> & { id?: string; pinned?: boolean }) => string;
  activate: (id: string) => void;
  close: (id: string) => void;
  closeOthers: (id: string) => void;
  closeAll: () => void;
  reopenLast: () => void;
  togglePin: (id: string) => void;
  setDirty: (id: string, dirty: boolean) => void;
  patchTab: (id: string, patch: Partial<ConsoleTab>) => void;
  toggleSidebar: () => void;
}

const ConsoleCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = "dogovori:console:v1";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);
  const hydrated = useRef(false);
  const storageKey = user ? `${STORAGE_KEY}:${user.id}` : null;

  // Hydrate on mount / user change
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        hydrated.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as { savedAt: number; state: State };
      if (Date.now() - parsed.savedAt < TTL_MS && parsed.state?.tabs?.length) {
        dispatch({ type: "hydrate", state: parsed.state });
      }
    } catch {
      /* ignore */
    }
    hydrated.current = true;
  }, [storageKey]);

  // Persist
  useEffect(() => {
    if (!storageKey || !hydrated.current) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ savedAt: Date.now(), state }),
      );
    } catch {
      /* ignore quota */
    }
  }, [state, storageKey]);

  const value = useMemo<Ctx>(
    () => ({
      state,
      setSection: (s) => dispatch({ type: "set_section", section: s }),
      openTab: (tab) => {
        const id = tab.id ?? tabKey(tab.kind, tab.entityId);
        dispatch({ type: "open_tab", tab });
        return id;
      },
      activate: (id) => dispatch({ type: "activate", id }),
      close: (id) => dispatch({ type: "close", id }),
      closeOthers: (id) => dispatch({ type: "close_others", id }),
      closeAll: () => dispatch({ type: "close_all" }),
      reopenLast: () => dispatch({ type: "reopen_last" }),
      togglePin: (id) => dispatch({ type: "toggle_pin", id }),
      setDirty: (id, dirty) => dispatch({ type: "set_dirty", id, dirty }),
      patchTab: (id, patch) => dispatch({ type: "patch_tab", id, patch }),
      toggleSidebar: () => dispatch({ type: "toggle_sidebar" }),
    }),
    [state],
  );

  return <ConsoleCtx.Provider value={value}>{children}</ConsoleCtx.Provider>;
}

export function useConsoleStore(): Ctx {
  const ctx = useContext(ConsoleCtx);
  if (!ctx) throw new Error("useConsoleStore must be used inside ConsoleProvider");
  return ctx;
}

export function useConsoleShortcuts() {
  const { close, reopenLast, toggleSidebar, state, activate } = useConsoleStore();
  const closeRef = useCallback(close, [close]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      // ignore inside inputs except ⌘B
      const target = e.target as HTMLElement;
      const inField =
        target &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target?.isContentEditable;

      if (e.key === "w" && !inField) {
        e.preventDefault();
        if (state.activeId) closeRef(state.activeId);
      } else if (e.key === "T" && e.shiftKey && !inField) {
        e.preventDefault();
        reopenLast();
      } else if (e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "]" && !inField) {
        e.preventDefault();
        const idx = state.tabs.findIndex((t) => t.id === state.activeId);
        const next = state.tabs[(idx + 1) % state.tabs.length];
        if (next) activate(next.id);
      } else if (e.key === "[" && !inField) {
        e.preventDefault();
        const idx = state.tabs.findIndex((t) => t.id === state.activeId);
        const prev = state.tabs[(idx - 1 + state.tabs.length) % state.tabs.length];
        if (prev) activate(prev.id);
      } else if (/^[1-9]$/.test(e.key) && !inField) {
        const i = parseInt(e.key, 10) - 1;
        const t = state.tabs[i];
        if (t) {
          e.preventDefault();
          activate(t.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeRef, reopenLast, toggleSidebar, activate, state]);
}
