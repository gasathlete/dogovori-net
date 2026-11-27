/**
 * Контекст на подготовката за комплект — САМО в паметта на модула.
 *
 * Оцелява при вътрешна навигация в SPA (подготовка → документ → обратно),
 * изчезва при презареждане/затваряне. Нищо не се записва в URL, history
 * state, localStorage, sessionStorage или analytics.
 */
import { useSyncExternalStore } from "react";
import type { Ctx } from "@/lib/expressionEvaluator";

export interface PreparationState {
  kitId: string;
  answers: Ctx;
  /** Расте при всяка промяна на отговор. */
  revision: number;
}

/** Какво е било предварително попълнено в даден документ и при коя ревизия. */
export interface AppliedPrefill {
  revision: number;
  values: Record<string, string>;
}

let state: PreparationState | null = null;
let applied: Record<string, AppliedPrefill> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getPreparation(): PreparationState | null {
  return state;
}

export function setPreparationAnswers(kitId: string, answers: Ctx): void {
  const same = state && state.kitId === kitId && JSON.stringify(state.answers) === JSON.stringify(answers);
  if (same) return;
  state = { kitId, answers: { ...answers }, revision: (state?.kitId === kitId ? state.revision : 0) + 1 };
  emit();
}

export function clearPreparation(): void {
  state = null;
  applied = {};
  emit();
}

export function getAppliedPrefill(slug: string): AppliedPrefill | undefined {
  return applied[slug];
}

export function recordAppliedPrefill(slug: string, a: AppliedPrefill): void {
  applied = { ...applied, [slug]: a };
}

export function subscribePreparation(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePreparation(): PreparationState | null {
  return useSyncExternalStore(subscribePreparation, getPreparation, getPreparation);
}
