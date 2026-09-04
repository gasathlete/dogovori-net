/**
 * useActivationDraft — непрекъснатост на активацията за уизарда и билдъра.
 *
 * Отговорности:
 *  1. еднократна миграция на старите локални чернови (с лични данни) към
 *     каноничния модел: указател в localStorage + съдържание в sessionStorage;
 *  2. запис на съдържанието (sessionStorage веднага, сървър с debounce);
 *  3. присвояване (claim) на анонимната чернова веднага след вход/регистрация,
 *     така че потребителят продължава от същата стъпка / същия резултат.
 *
 * Екранът остава единствен собственик на своето състояние — hook-ът само пази и
 * връща съдържание, не решава как се рендира.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trackDraftEvent } from "@/lib/docFunnel";
import {
  claimDraft,
  clearDraft,
  isActivationContinuityEnabled,
  isForeignTab,
  readPayload,
  readPointer,
  syncDraft,
  takeLegacyDrafts,
  writePayload,
  writePointer,
  type DraftFlow,
  type DraftPayload,
  type DraftPointer,
} from "@/lib/activationDraft";

const SYNC_DEBOUNCE_MS = 1500;

export interface UseActivationDraftOptions {
  flow: DraftFlow;
  /** Ключ на документа (slug / sector:doc) — за разрез в аналитиката. */
  docKey?: string;
  /** Маршрут за връщане след вход (относителен път + query). */
  route: string;
  /** Извиква се, когато има съдържание за възстановяване. */
  onRestore?: (payload: DraftPayload, meta: { source: "session" | "legacy" | "claim" }) => void;
  /** Изключва работата (напр. екранът още не е готов). */
  enabled?: boolean;
}

export interface UseActivationDraftResult {
  /** true при включен feature flag — екранът може да спре стария localStorage запис. */
  active: boolean;
  pointer: DraftPointer | null;
  /** Черновата е отворена и в друг таб. */
  foreignTab: boolean;
  /** Запазва текущото състояние (session + debounce към сървъра). */
  persist: (payload: DraftPayload, meta?: { stepIdx?: number; hasResult?: boolean }) => void;
  /** Изтрива черновата (след успешно сваляне/приключване). */
  discard: () => void;
  claiming: boolean;
}

export function useActivationDraft(opts: UseActivationDraftOptions): UseActivationDraftResult {
  const { flow, docKey, route, onRestore, enabled = true } = opts;
  const active = useMemo(() => isActivationContinuityEnabled(), []);
  const { user } = useAuth();

  const [pointer, setPointer] = useState<DraftPointer | null>(() => (active ? readPointer() : null));
  const [claiming, setClaiming] = useState(false);
  const pointerRef = useRef<DraftPointer | null>(pointer);
  pointerRef.current = pointer;

  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  const latestRef = useRef<{ payload: DraftPayload; stepIdx: number; hasResult: boolean } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredRef = useRef(false);
  const claimedRef = useRef(false);

  /* --------------------------- 1. Възстановяване --------------------------- */
  useEffect(() => {
    if (!active || !enabled || restoredRef.current) return;
    restoredRef.current = true;

    // Миграция от старите ключове (изтриват се от localStorage веднага).
    const legacy = takeLegacyDrafts().filter((d) => d.flow === flow);
    const current = readPointer();

    if (current && current.flow === flow) {
      const payload = readPayload(current.draftId);
      if (payload) {
        restoreRef.current?.(payload, { source: "session" });
        trackDraftEvent("draft_restored", { draft_id: current.draftId, doc_key: current.docKey, source: flow });
      } else {
        trackDraftEvent("draft_restore_offered", {
          draft_id: current.draftId,
          doc_key: current.docKey,
          source: flow,
        });
      }
      setPointer(current);
      return;
    }

    if (legacy.length > 0) {
      const best = legacy[legacy.length - 1];
      writePayloadForLegacy(best.payload);
      restoreRef.current?.(best.payload, { source: "legacy" });
    }
  }, [active, enabled, flow]);

  /** Съдържанието от стара чернова изчаква първия сървърен sync за draftId. */
  const legacyPayloadRef = useRef<DraftPayload | null>(null);
  function writePayloadForLegacy(payload: DraftPayload) {
    legacyPayloadRef.current = payload;
  }

  /* ------------------------------ 2. Запазване ---------------------------- */
  const flush = useCallback(async () => {
    const latest = latestRef.current;
    if (!latest) return;
    const next = await syncDraft({
      pointer: pointerRef.current,
      flow,
      docKey,
      route,
      stepIdx: latest.stepIdx,
      payload: latest.payload,
      hasResult: latest.hasResult,
    });
    if (!next) return;
    const isNew = !pointerRef.current || pointerRef.current.draftId !== next.draftId;
    setPointer(next);
    trackDraftEvent(isNew ? "draft_created" : "draft_autosaved", {
      draft_id: next.draftId,
      doc_key: docKey,
      source: flow,
      has_result: latest.hasResult,
    });
  }, [flow, docKey, route]);

  const persist = useCallback(
    (payload: DraftPayload, meta?: { stepIdx?: number; hasResult?: boolean }) => {
      if (!active || !enabled) return;
      const merged: DraftPayload = legacyPayloadRef.current
        ? { ...legacyPayloadRef.current, ...payload }
        : payload;
      legacyPayloadRef.current = null;
      latestRef.current = {
        payload: merged,
        stepIdx: meta?.stepIdx ?? pointerRef.current?.stepIdx ?? 0,
        hasResult: meta?.hasResult ?? !!merged.result,
      };
      // Съдържанието с лични данни остава в текущия таб (sessionStorage).
      const id = pointerRef.current?.draftId;
      if (id) {
        writePayload(id, merged);
        writePointer({
          ...pointerRef.current!,
          stepIdx: latestRef.current.stepIdx,
          hasResult: latestRef.current.hasResult,
          route,
          ts: Date.now(),
        });
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { void flush(); }, SYNC_DEBOUNCE_MS);
    },
    [active, enabled, flush, route],
  );

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  /* ---------------------------- 3. Claim след вход ------------------------- */
  useEffect(() => {
    if (!active || !user || claimedRef.current) return;
    const current = pointerRef.current ?? readPointer();
    if (!current) return;
    claimedRef.current = true;
    setClaiming(true);
    trackDraftEvent("draft_claim_started", { draft_id: current.draftId, doc_key: current.docKey, source: flow });
    void (async () => {
      const res = await claimDraft(current);
      setClaiming(false);
      if (!res.ok) {
        trackDraftEvent(res.reason === "expired" ? "draft_expired" : "draft_claim_blocked", {
          draft_id: current.draftId,
          doc_key: current.docKey,
          source: flow,
          reason: res.reason,
        });
        if (res.reason === "expired") clearDraft(current.draftId);
        return;
      }
      trackDraftEvent("draft_claim_succeeded", {
        draft_id: current.draftId,
        doc_key: current.docKey,
        source: flow,
        has_result: !!res.payload?.result,
      });
      if (res.payload) {
        writePayload(current.draftId, res.payload);
        // Възстановяваме само ако текущият таб няма съдържание в паметта.
        if (!latestRef.current) restoreRef.current?.(res.payload, { source: "claim" });
      }
    })();
  }, [active, user, flow]);

  const discard = useCallback(() => {
    const id = pointerRef.current?.draftId;
    clearDraft(id);
    setPointer(null);
    latestRef.current = null;
  }, []);

  return {
    active,
    pointer,
    foreignTab: isForeignTab(pointer),
    persist,
    discard,
    claiming,
  };
}
