/**
 * useEngagement — лек engagement loop, базиран на localStorage.
 *
 * Маркира всеки успешен op (download/template/upload/AI message) и пресмята:
 *  - current_streak (последователни дни с поне 1 op)
 *  - longest_streak
 *  - daily_progress (брой ops днес) / daily_goal
 *
 * Без DB зависимости — синхронизира се между tab-ове чрез `storage` event.
 * При login може да се мигрира към server-side таблица.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";

const KEY = "dogovari_engagement_v1";
const DEFAULT_GOAL = 1;

export interface EngagementState {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null; // YYYY-MM-DD
  daily_progress: number;
  daily_goal: number;
  total_ops: number;
}

const DEFAULT_STATE: EngagementState = {
  current_streak: 0,
  longest_streak: 0,
  last_active_date: null,
  daily_progress: 0,
  daily_goal: DEFAULT_GOAL,
  total_ops: 0,
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86400000);
}

function readRaw(): EngagementState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<EngagementState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeRaw(state: EngagementState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("dogovari:engagement-changed"));
}

function getNormalized(): EngagementState {
  const s = readRaw();
  // Reset daily_progress if last_active_date != today
  if (s.last_active_date && s.last_active_date !== todayStr()) {
    const gap = daysBetween(s.last_active_date, todayStr());
    if (gap >= 2) {
      // Streak broken
      return { ...s, current_streak: 0, daily_progress: 0 };
    }
    // gap === 1 → keep streak, just reset today's progress
    return { ...s, daily_progress: 0 };
  }
  return s;
}

function subscribe(cb: () => void) {
  const onChange = () => cb();
  window.addEventListener("storage", onChange);
  window.addEventListener("dogovari:engagement-changed", onChange as EventListener);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("dogovari:engagement-changed", onChange as EventListener);
  };
}

/** Bump engagement state — извикай при всеки успешен op. */
export function bumpEngagement(): {
  state: EngagementState;
  reachedGoal: boolean;
  streakIncreased: boolean;
} {
  const prev = getNormalized();
  const today = todayStr();
  const next: EngagementState = { ...prev, total_ops: prev.total_ops + 1 };

  let streakIncreased = false;
  if (prev.last_active_date === today) {
    next.daily_progress = prev.daily_progress + 1;
  } else if (prev.last_active_date && daysBetween(prev.last_active_date, today) === 1) {
    next.current_streak = prev.current_streak + 1;
    next.daily_progress = 1;
    streakIncreased = true;
  } else {
    next.current_streak = 1;
    next.daily_progress = 1;
    streakIncreased = true;
  }
  next.last_active_date = today;
  next.longest_streak = Math.max(prev.longest_streak, next.current_streak);

  const reachedGoal =
    prev.daily_progress < next.daily_goal && next.daily_progress >= next.daily_goal;

  writeRaw(next);
  return { state: next, reachedGoal, streakIncreased };
}

export function useEngagement(): EngagementState {
  const state = useSyncExternalStore(subscribe, getNormalized, () => DEFAULT_STATE);
  // On mount, normalize once so stale daily_progress flushes.
  useEffect(() => {
    const normalized = getNormalized();
    const raw = readRaw();
    if (
      normalized.daily_progress !== raw.daily_progress ||
      normalized.current_streak !== raw.current_streak
    ) {
      writeRaw(normalized);
    }
  }, []);
  return state;
}

/** Hook за компоненти, които искат да emit-ват op-и. */
export function useBumpEngagement() {
  return useCallback(() => bumpEngagement(), []);
}
