/**
 * useActivationDraft — непрекъснатост на активацията за уизарда и билдъра.
 *
 * Отговорности:
 *  1. пренасяне без загуба на старите локални чернови (с лични данни) към
 *     каноничния модел: указател в localStorage + съдържание в sessionStorage;
 *  2. запис на съдържанието (sessionStorage веднага, сървър с debounce);
 *  3. присвояване (claim) на анонимната чернова веднага след вход/регистрация,
 *     така че потребителят продължава от същата стъпка / същия резултат;
 *  4. типизирана реакция на отказ от сървъра: преходни грешки се повтарят,
 *     невалиден/чужд указател се изчиства и се започва нова чернова.
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
  clearStagedLegacyDrafts,
  hasRestorableContent,
  hasUserContent,
  isActivationContinuityEnabled,
  isDetachDraftReason,
  isForeignTab,
  isTransientDraftReason,
  loadSavedDraftPayload,
  LOCAL_DRAFT_ID,
  readPayload,
  readPointer,
  syncDraft,
  takeLegacyDrafts,
  writePayload,
  writePointer,
  type DraftErrorReason,
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

type Latest = { payload: DraftPayload; stepIdx: number; hasResult: boolean };

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

  const latestRef = useRef<Latest | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredRef = useRef(false);
  /** draftId, за който присвояването е започнато/приключило (не се повтаря). */
  const claimAttemptRef = useRef<string | null>(null);
  /** true докато заявката за присвояване е в движение — записите изчакват. */
  const claimInFlightRef = useRef(false);
  /** Един опит за нова чернова след окончателно невалиден указател. */
  const recreateRef = useRef(false);

  /** Има ли в паметта на този таб нещо, въведено от потребителя? */
  const tabHasContent = useCallback(
    () => hasUserContent(latestRef.current?.payload ?? null, latestRef.current?.stepIdx ?? 0),
    [],
  );

  const updatePointer = useCallback((next: DraftPointer | null) => {
    pointerRef.current = next;
    setPointer(next);
  }, []);

  /**
   * Указателят е невалиден за този браузър/потребител: пазим съдържанието на
   * таба в резервния слот и започваме на чисто (нова чернова при следващ запис).
   */
  const detach = useCallback((old: DraftPointer) => {
    const inMemory = latestRef.current?.payload ?? readPayload(old.draftId);
    if (inMemory && hasRestorableContent(inMemory)) writePayload(LOCAL_DRAFT_ID, inMemory);
    clearDraft(old.draftId);
    updatePointer(null);
  }, [updatePointer]);

  /* --------------------------- 1. Възстановяване --------------------------- */
  useEffect(() => {
    if (!active || !enabled || restoredRef.current) return;
    restoredRef.current = true;

    // Старите ключове се стажират в таба (без загуба) и се махат от localStorage.
    const legacy = takeLegacyDrafts().filter((d) => d.flow === flow);
    const current = readPointer();

    if (current && current.flow === flow) {
      const payload = readPayload(current.draftId) ?? readPayload(LOCAL_DRAFT_ID);
      if (hasRestorableContent(payload)) {
        restoreRef.current?.(payload, { source: "session" });
        trackDraftEvent("draft_restored", { draft_id: current.draftId, doc_key: current.docKey, source: flow });
      } else {
        trackDraftEvent("draft_restore_offered", {
          draft_id: current.draftId,
          doc_key: current.docKey,
          source: flow,
        });
      }
      updatePointer(current);
      return;
    }

    // Няма указател, но има съдържание от този таб (неуспешна синхронизация
    // преди refresh) — то е по-ново от всяка стара чернова.
    const local = readPayload(LOCAL_DRAFT_ID);
    if (hasRestorableContent(local)) {
      restoreRef.current?.(local, { source: "session" });
      return;
    }

    if (legacy.length > 0) {
      // Най-новата стара чернова се подава на екрана; стажираното копие в таба
      // се изчиства чак след първия потвърден сървърен запис.
      const best = legacy[legacy.length - 1];
      restoreRef.current?.(best.payload, { source: "legacy" });
    }
  }, [active, enabled, flow, updatePointer]);

  /* ------------------------------ 2. Запазване ---------------------------- */
  const onSyncBlocked = useCallback(
    (reason: DraftErrorReason, old: DraftPointer | null) => {
      trackDraftEvent("draft_sync_blocked", {
        draft_id: old?.draftId,
        doc_key: docKey,
        source: flow,
        reason,
      });
      if (isTransientDraftReason(reason) || reason === "payload_too_large" || reason === "invalid_request") {
        // Съдържанието остава в таба; следващият запис ще опита пак.
        return false;
      }
      if (old && isDetachDraftReason(reason)) {
        if (reason === "expired") {
          trackDraftEvent("draft_expired", { draft_id: old.draftId, doc_key: docKey, source: flow });
        }
        detach(old);
        return true;
      }
      return false;
    },
    [detach, docKey, flow],
  );

  const flush = useCallback(async () => {
    const latest = latestRef.current;
    if (!latest) return;
    // Докато тече присвояване, не пращаме запис: иначе заявка с вече ротирания
    // токен може да се върне след claim-а и да „размаркира" присвоената
    // чернова (или да създаде дубликат). Опитваме отново след малко.
    if (claimInFlightRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { void flush(); }, SYNC_DEBOUNCE_MS);
      return;
    }
    const current = pointerRef.current;
    // Прехвърлена чернова: източникът на истина е „Моите документи"; сървърът
    // и без това не приема съдържание обратно — пестим заявката.
    if (current?.claimed && current.savedDocId) return;

    const res = await syncDraft({
      pointer: current,
      flow,
      docKey,
      route,
      stepIdx: latest.stepIdx,
      payload: latest.payload,
      hasResult: latest.hasResult,
    });

    if (res.ok === false) {
      const detached = onSyncBlocked(res.reason, current);
      // Един опит за нова чернова през изричния create път (без draft_id).
      if (detached && !recreateRef.current && latestRef.current) {
        recreateRef.current = true;
        const again = await syncDraft({
          pointer: null,
          flow,
          docKey,
          route,
          stepIdx: latestRef.current.stepIdx,
          payload: latestRef.current.payload,
          hasResult: latestRef.current.hasResult,
        });
        if (again.ok === true) {
          updatePointer(again.pointer);
          clearStagedLegacyDrafts(flow);
          trackDraftEvent("draft_created", {
            draft_id: again.pointer.draftId,
            doc_key: docKey,
            source: flow,
            has_result: latestRef.current.hasResult,
          });
        } else {
          onSyncBlocked(again.reason, null);
        }
      }
      return;
    }

    recreateRef.current = false;
    updatePointer(res.pointer);
    // Сървърният запис е потвърден — стажираните стари чернови вече не са
    // единственото копие.
    clearStagedLegacyDrafts(flow);
    trackDraftEvent(res.created ? "draft_created" : "draft_autosaved", {
      draft_id: res.pointer.draftId,
      doc_key: docKey,
      source: flow,
      has_result: latest.hasResult,
    });
  }, [flow, docKey, route, onSyncBlocked, updatePointer]);

  const persist = useCallback(
    (payload: DraftPayload, meta?: { stepIdx?: number; hasResult?: boolean }) => {
      if (!active || !enabled) return;
      const stepIdx = meta?.stepIdx ?? pointerRef.current?.stepIdx ?? 0;
      // Снапшотът при отваряне на екрана (само служебни полета) не създава
      // чернова и не презаписва вече запазено съдържание — иначе всяко
      // посещение би оставяло празен ред, а възстановяването след вход би
      // виждало „вече има съдържание“ и би се отказало.
      if (!latestRef.current && !hasUserContent(payload, stepIdx)) return;
      latestRef.current = {
        payload,
        stepIdx,
        hasResult: meta?.hasResult ?? !!payload.result,
      };
      // Съдържанието с лични данни остава в текущия таб (sessionStorage).
      const id = pointerRef.current?.draftId ?? LOCAL_DRAFT_ID;
      writePayload(id, payload);
      if (pointerRef.current) {
        writePointer({
          ...pointerRef.current,
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
    if (!active || !enabled || !user) return;
    const current = pointerRef.current ?? readPointer();
    if (!current || current.flow !== flow) return;
    if (claimAttemptRef.current === current.draftId) return;

    const hasLocal = hasRestorableContent(readPayload(current.draftId) ?? readPayload(LOCAL_DRAFT_ID));

    // Вече присвоена (напр. втори таб след вход): нищо за присвояване; ако в
    // таба няма съдържание, го теглим от източника на истина.
    if (current.claimed) {
      claimAttemptRef.current = current.draftId;
      if (hasLocal || tabHasContent()) return;
      void (async () => {
        let payload: DraftPayload | null = null;
        if (current.savedDocId) payload = await loadSavedDraftPayload(current.savedDocId);
        if (!payload) {
          const res = await claimDraft(current);
          if (res.ok) {
            payload = res.payload ?? null;
            if (!payload && res.savedDocId) payload = await loadSavedDraftPayload(res.savedDocId);
            if (res.savedDocId && res.savedDocId !== current.savedDocId) {
              const next = { ...current, savedDocId: res.savedDocId, hasResult: true };
              writePointer(next);
              updatePointer(next);
            }
          } else if (isDetachDraftReason(res.reason)) {
            detach(current);
            return;
          }
        }
        if (payload && !tabHasContent()) {
          writePayload(current.draftId, payload);
          restoreRef.current?.(payload, { source: "claim" });
          trackDraftEvent("draft_restored", { draft_id: current.draftId, doc_key: current.docKey, source: flow });
        }
      })();
      return;
    }

    claimAttemptRef.current = current.draftId;
    claimInFlightRef.current = true;
    setClaiming(true);
    trackDraftEvent("draft_claim_started", { draft_id: current.draftId, doc_key: current.docKey, source: flow });
    void (async () => {
      let res: Awaited<ReturnType<typeof claimDraft>>;
      try {
        res = await claimDraft(current);
      } finally {
        claimInFlightRef.current = false;
        setClaiming(false);
      }
      if (!res.ok) {
        trackDraftEvent(res.reason === "expired" ? "draft_expired" : "draft_claim_blocked", {
          draft_id: current.draftId,
          doc_key: current.docKey,
          source: flow,
          reason: res.reason,
        });
        if (isTransientDraftReason(res.reason)) {
          // Позволяваме повторен опит при следваща промяна на сесията.
          claimAttemptRef.current = null;
          return;
        }
        // expired / invalid_token / already_claimed / unauthorized: указателят е
        // безполезен за този потребител — съдържанието на таба остава, а
        // следващият запис създава негова собствена чернова.
        detach(current);
        return;
      }

      trackDraftEvent("draft_claim_succeeded", {
        draft_id: current.draftId,
        doc_key: current.docKey,
        source: flow,
        has_result: !!res.hasResult,
      });

      // Токенът е ротиран на сървъра — махаме го и от браузъра.
      const next: DraftPointer = {
        ...current,
        claimToken: "",
        claimed: true,
        savedDocId: res.savedDocId ?? current.savedDocId,
        hasResult: res.hasResult ?? current.hasResult,
        expiresAt: res.expiresAt ?? current.expiresAt,
        ts: Date.now(),
      };
      writePointer(next);
      updatePointer(next);

      let payload = res.payload ?? null;
      if (!payload && res.purged && res.savedDocId && !hasLocal && !tabHasContent()) {
        payload = await loadSavedDraftPayload(res.savedDocId);
      }
      if (payload) {
        writePayload(current.draftId, payload);
        // Възстановяваме само ако в този таб потребителят не е въвел нищо
        // (нов таб от имейл линка / OAuth връщане към чист екран).
        if (!tabHasContent()) restoreRef.current?.(payload, { source: "claim" });
      }
    })();
  }, [active, enabled, user, flow, detach, updatePointer, tabHasContent]);

  const discard = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    clearDraft(pointerRef.current?.draftId);
    clearDraft(LOCAL_DRAFT_ID);
    updatePointer(null);
    latestRef.current = null;
  }, [updatePointer]);

  return {
    active,
    pointer,
    foreignTab: isForeignTab(pointer),
    persist,
    discard,
    claiming,
  };
}
