/**
 * useFreeOpSuccess — helper that signals a free-tier operation has just
 * completed successfully. Currently listened to by `EntrepreneurAdPopup`
 * to schedule a post-op "what dogovori.net can do for you" ad.
 *
 * We already emit `dogovari:op-completed` for the celebration toast, so this
 * hook simply re-uses that event with an extra `{ free: true }` detail. That
 * keeps a single source of truth for downstream listeners.
 */
import { useCallback } from "react";

export interface FreeOpDetail {
  /** Short identifier of the op, e.g. "download", "assistant", "analyze", "wizard" */
  opKey?: string;
}

export const FREE_OP_SUCCESS_EVENT = "dogovori:free-op-success";

export function emitFreeOpSuccess(opKey?: string) {
  if (typeof window === "undefined") return;
  const detail: FreeOpDetail = { opKey };
  window.dispatchEvent(new CustomEvent(FREE_OP_SUCCESS_EVENT, { detail }));
}

export function useFreeOpSuccess() {
  return useCallback((opKey?: string) => emitFreeOpSuccess(opKey), []);
}
