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
 * Съгласуваност при паралелни заявки:
 *  - най-много ЕДНА заявка към draft-sync в движение за екрана;
 *  - всяко записване вдига локална ревизия; ако дойде запис по време на заявка,
 *    той се натрупва и се изпраща веднъж накрая (обединяване, не опашка);
 *  - закъснял отговор никога не презаписва по-ново състояние: указателят се
 *    сглобява в момента на commit-а с най-новите стъпка/резултат/съдържание, а
 *    ако указателят вече сочи ДРУГА чернова, отговорът се изхвърля;
 *  - присвояването се повтаря при преходна грешка с ограничен backoff, само за
 *    същия потребител и същата чернова, без дублирани заявки.
 *
 * Екранът остава единствен собственик на своето състояние — hook-ът само пази и
 * връща съдържание, не решава как се рендира.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trackDraftEvent } from "@/lib/docFunnel";
import {
  claimDraft,
  claimRetryDelay,
  clearAllDraftStorage,
  clearDraft,
  clearDraftIfCurrent,
  clearStagedLegacyDrafts,
  hasRestorableContent,
  hasUserContent,
  isActivationContinuityEnabled,
  isDetachDraftReason,
  isForeignTab,
  isTransientDraftReason,
  loadSavedDraftPayload,
  LOCAL_DRAFT_ID,
  MAX_CLAIM_ATTEMPTS,
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
/** Изчакване преди повторен опит за натрупано състояние след преходна грешка. */
const SYNC_RETRY_MS = 2000;

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

type Latest = { payload: DraftPayload; stepIdx: number; hasResult: boolean; rev: number };

/**
 * Смислена ли е разликата между два указателя за екрана? Отметката за време не
 * е — иначе всяко натискане на клавиш би пререндирало екрана.
 */
function pointerMetaChanged(a: DraftPointer | null, b: DraftPointer | null): boolean {
  if (!a || !b) return a !== b;
  return (
    a.draftId !== b.draftId ||
    a.route !== b.route ||
    a.stepIdx !== b.stepIdx ||
    a.hasResult !== b.hasResult ||
    a.claimed !== b.claimed ||
    (a.savedDocId ?? "") !== (b.savedDocId ?? "")
  );
}

interface ClaimRetryState {
  draftId: string;
  userId: string;
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export function useActivationDraft(opts: UseActivationDraftOptions): UseActivationDraftResult {
  const { flow, docKey, route, onRestore, enabled = true } = opts;
  const active = useMemo(() => isActivationContinuityEnabled(), []);
  const { user } = useAuth();

  // Указател от ДРУГ поток не е „текущият" за този екран: не бива да обновяваме
  // чужда сървърна чернова (нито да я триете) — първият реален запис минава по
  // изричния create път.
  const [pointer, setPointer] = useState<DraftPointer | null>(() => {
    if (!active) return null;
    const stored = readPointer();
    return stored && stored.flow === flow ? stored : null;
  });

  const [claiming, setClaiming] = useState(false);
  // ВНИМАНИЕ: препратката НЕ се пренасочва към състоянието при всяко рендиране —
  // родителско рендиране иначе би върнало остаряла снимка върху вече обновените
  // метаданни (стъпка, маршрут, флаг за резултат). Синхронизира се само там,
  // където указателят се променя (`updatePointer`, `persist`).
  const pointerRef = useRef<DraftPointer | null>(pointer);

  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;
  const routeRef = useRef(route);
  routeRef.current = route;
  const userIdRef = useRef<string | null>(user?.id ?? null);
  userIdRef.current = user?.id ?? null;

  const latestRef = useRef<Latest | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredRef = useRef(false);
  const mountedRef = useRef(true);
  /** Локална ревизия — вдига се при всеки запис от екрана. */
  const revRef = useRef(0);
  /** true докато заявката към draft-sync е в движение (единствена заявка). */
  const inFlightRef = useRef(false);
  /** Има ли натрупан запис, който да се изпрати след текущата заявка. */
  const pendingRef = useRef(false);
  /** draftId, за който присвояването е започнато/приключило (не се повтаря). */
  const claimAttemptRef = useRef<string | null>(null);
  /** true докато заявката за присвояване е в движение — записите изчакват. */
  const claimInFlightRef = useRef(false);
  /**
   * Поколение на операцията за присвояване. Всяка стартирана заявка притежава
   * едно поколение; само притежателят на ТЕКУЩОТО поколение има право да пипа
   * състояние (включително да освободи ключа и да изгаси индикатора). При смяна
   * на самоличност, отказване или замяна на черновата поколението се вдига:
   * старата HTTP заявка може да приключи по-късно, но вече без правомощия — и
   * новият валиден контекст не чака увиснала заявка.
   */
  const claimGenRef = useRef(0);
  /** Един опит за нова чернова след окончателно невалиден указател. */
  const recreateRef = useRef(false);
  /** Вдига се при изрично отказване — закъснели резултати стават без значение. */
  const discardRevRef = useRef(0);
  const claimRetryRef = useRef<ClaimRetryState | null>(null);
  const runClaimRef = useRef<((p: DraftPointer, userId: string) => void) | null>(null);

  /** Има ли в паметта на този таб нещо, въведено от потребителя? */
  const tabHasContent = useCallback(
    () => hasUserContent(latestRef.current?.payload ?? null, latestRef.current?.stepIdx ?? 0),
    [],
  );

  const cancelClaimRetry = useCallback(() => {
    const st = claimRetryRef.current;
    if (st?.timer) clearTimeout(st.timer);
    claimRetryRef.current = null;
  }, []);

  /**
   * Обезсилява текущото присвояване: логически освобождава ключа веднага, гаси
   * индикатора и изчиства чакащия повторен опит. Увисналата стара заявка не
   * блокира новия контекст.
   */
  const invalidateClaim = useCallback(() => {
    claimGenRef.current += 1;
    claimInFlightRef.current = false;
    cancelClaimRetry();
    if (mountedRef.current) setClaiming(false);
  }, [cancelClaimRetry]);

  const updatePointer = useCallback(
    (next: DraftPointer | null) => {
      // Указателят се смени с друга чернова → всяко чакащо присвояване за
      // старата вече е без значение. Същата чернова (напр. успешно присвояване
      // или запис) НЕ обезсилва сама себе си.
      const prevId = pointerRef.current?.draftId ?? null;
      const nextId = next?.draftId ?? null;
      if (claimInFlightRef.current && prevId !== nextId) invalidateClaim();
      else {
        const retry = claimRetryRef.current;
        if (retry && retry.draftId !== nextId) cancelClaimRetry();
      }
      pointerRef.current = next;
      if (mountedRef.current) setPointer(next);
    },
    [cancelClaimRetry, invalidateClaim],
  );

  /**
   * Указателят е невалиден за този браузър/потребител: пазим съдържанието на
   * таба в резервния слот и започваме на чисто (нова чернова при следващ запис).
   *
   * Условно: ако междувременно указателят сочи ДРУГА чернова (или същата, но
   * вече присвоена), не пипаме нищо — закъснял отказ за стара чернова не бива
   * да изтрива по-новото състояние.
   */
  const detach = useCallback(
    (old: DraftPointer): boolean => {
      const cleared = clearDraftIfCurrent(old.draftId, {
        keepPayload: latestRef.current?.payload ?? null,
        requireUnclaimed: !old.claimed,
      });
      if (!cleared) return false;
      updatePointer(null);
      return true;
    },
    [updatePointer],
  );

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
        return detach(old);
      }
      return false;
    },
    [detach, docKey, flow],
  );

  /** Стабилна препратка към flush — предпазва от остарели closures в таймерите. */
  const flushRef = useRef<(() => Promise<void>) | null>(null);

  const scheduleFlush = useCallback((delay: number) => {
    if (!mountedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushRef.current?.();
    }, delay);
  }, []);


  /** Ако е останало неизпратено състояние, изпраща го веднъж (обединено). */
  const flushIfPending = useCallback(
    (sentRev: number, delay = 0) => {
      if (!mountedRef.current) return;
      const latest = latestRef.current;
      if (!latest) return;
      if (pendingRef.current || latest.rev > sentRev) scheduleFlush(delay);
    },
    [scheduleFlush],
  );

  const maybeRunDueClaimRetry = useCallback(() => {
    const st = claimRetryRef.current;
    if (!st || st.timer || claimInFlightRef.current) return;
    if (st.attempts <= 0 || st.attempts >= MAX_CLAIM_ATTEMPTS) return;
    const current = pointerRef.current;
    if (!current || current.draftId !== st.draftId) return;
    if (userIdRef.current !== st.userId) return;
    runClaimRef.current?.(current, st.userId);
  }, []);

  const flush = useCallback(async () => {
    if (!mountedRef.current) return;
    const latest = latestRef.current;
    if (!latest) return;
    // Докато тече присвояване, не пращаме запис: иначе заявка с вече ротирания
    // токен може да се върне след claim-а и да „размаркира" присвоената
    // чернова (или да създаде дубликат). Опитваме отново след малко.
    if (claimInFlightRef.current) {
      pendingRef.current = true;
      scheduleFlush(SYNC_DEBOUNCE_MS);
      return;
    }
    // Най-много една заявка в движение: натрупваме и изпращаме накрая.
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    const current = pointerRef.current;
    // Прехвърлена чернова: източникът на истина е „Моите документи"; сървърът
    // и без това не приема съдържание обратно — пестим заявката.
    if (current?.claimed && current.savedDocId) return;

    const sentRev = latest.rev;
    const sentDraftId = current?.draftId ?? null;
    const sentDiscardRev = discardRevRef.current;
    // Ключът се държи през ЦЯЛАТА операция — включително през резервното
    // създаване след окончателна грешка — иначе запис/таймер по време на
    // резервния await би започнал втори create и би дублирал черновата.
    inFlightRef.current = true;
    pendingRef.current = false;
    /** Изчакване преди изпращането на натрупаното състояние. */
    let followUpDelay = 0;
    /**
     * Има ли още смисъл натрупаното състояние да се изпрати след тази заявка?
     * При обезсилен контекст (сменен/зает указател, изрично отказване, отказан
     * commit) натрупаното е за СТАРАТА чернова и не бива да се изпраща срещу
     * заместващия указател.
     */
    let followUpApplicable = true;

    try {
      const res = await syncDraft(
        {
          pointer: current,
          flow,
          docKey,
          route: routeRef.current,
          stepIdx: latest.stepIdx,
          payload: latest.payload,
          hasResult: latest.hasResult,
        },
        { commit: false },
      );

      // Екранът е напуснат — нищо не пишем в състояние или хранилище.
      if (!mountedRef.current) {
        followUpApplicable = false;
        return;
      }

      // Указателят е сменен с ДРУГА чернова, докато заявката е пътувала:
      // отговорът е за старата и се изхвърля (нито commit, нито изчистване).
      // …или документът е отказан изрично: и двете правят отговора без значение.
      if ((pointerRef.current?.draftId ?? null) !== sentDraftId || discardRevRef.current !== sentDiscardRev) {
        followUpApplicable = false;
        return;
      }

      if (res.ok === false) {
        const detached = onSyncBlocked(res.reason, current);
        if (isTransientDraftReason(res.reason)) {
          // Ако междувременно има по-нова ревизия, тя не бива да чака трета
          // редакция: изпращаме я веднъж, след кратко изчакване (без стегнат
          // цикъл). Без по-нова ревизия остава „нов опит при следващ запис".
          followUpDelay = SYNC_RETRY_MS;
          return;
        }
        // Един опит за нова чернова през изричния create път (без draft_id).
        const newest = latestRef.current;
        followUpApplicable = false;
        if (!detached || recreateRef.current || !newest) return;
        recreateRef.current = true;
        const again = await syncDraft(
          {
            pointer: null,
            flow,
            docKey,
            route: routeRef.current,
            stepIdx: newest.stepIdx,
            payload: newest.payload,
            hasResult: newest.hasResult,
          },
          { commit: false },
        );
        if (!mountedRef.current || discardRevRef.current !== sentDiscardRev) return;
        if (again.ok !== true) {
          onSyncBlocked(again.reason, null);
          return;
        }
        // Междувременно указателят може вече да е зает от друга чернова или
        // документът да е отказан — тогава новият запис не се присвоява тук.
        if (pointerRef.current) return;
        const fresh = latestRef.current;
        const committed = again.commit(
          {
            payload: fresh?.payload,
            stepIdx: fresh?.stepIdx,
            hasResult: fresh?.hasResult,
            route: routeRef.current,
          },
          { requireCurrent: true },
        );
        if (!committed) return;
        // Успешното пресъздаване е нов чист старт: следващо изтичане отново има
        // право на резервен опит.
        recreateRef.current = false;
        followUpApplicable = true;
        updatePointer(committed);
        clearStagedLegacyDrafts(flow);
        trackDraftEvent("draft_created", {
          draft_id: committed.draftId,
          doc_key: docKey,
          source: flow,
          has_result: committed.hasResult,
        });
        return;
      }

      recreateRef.current = false;
      // Commit-ът се прави с НАЙ-НОВОТО състояние: закъснял отговор не връща
      // стъпка, флаг за резултат или съдържание назад. `requireCurrent` пази и
      // от указател, сменен от друг таб, докато заявката е пътувала.
      const newest = latestRef.current ?? latest;
      const committed = res.commit(
        {
          payload: newest.payload,
          stepIdx: newest.stepIdx,
          hasResult: newest.hasResult,
          route: routeRef.current,
        },
        { requireCurrent: true },
      );
      if (!committed) {
        followUpApplicable = false;
        return;
      }
      updatePointer(committed);
      // Сървърният запис е потвърден — стажираните стари чернови вече не са
      // единственото копие.
      clearStagedLegacyDrafts(flow);
      trackDraftEvent(res.created ? "draft_created" : "draft_autosaved", {
        draft_id: committed.draftId,
        doc_key: docKey,
        source: flow,
        has_result: committed.hasResult,
      });
    } finally {
      // Всеки изход минава оттук: ключът се освобождава и натрупаното (ако е
      // още АКТУАЛНО) се изпраща точно веднъж.
      inFlightRef.current = false;
      if (mountedRef.current) {
        maybeRunDueClaimRetry();
        if (followUpApplicable) flushIfPending(sentRev, followUpDelay);
        else pendingRef.current = false;
      }
    }
  }, [flow, docKey, onSyncBlocked, updatePointer, scheduleFlush, flushIfPending, maybeRunDueClaimRetry]);


  flushRef.current = flush;

  const persist = useCallback(
    (payload: DraftPayload, meta?: { stepIdx?: number; hasResult?: boolean; userInitiated?: boolean }) => {
      if (!active || !enabled || !mountedRef.current) return;
      const stepIdx = meta?.stepIdx ?? pointerRef.current?.stepIdx ?? 0;
      // Първа чернова се създава САМО след истинско действие на потребителя.
      // Служебните начални стойности (smart defaults) при отваряне на екрана
      // изглеждат като съдържание, но не са — не пишем нищо преди реален вход.
      if (!latestRef.current && meta?.userInitiated === false) return;
      // Снапшотът при отваряне на екрана (само служебни полета) не създава
      // чернова и не презаписва вече запазено съдържание — иначе всяко
      // посещение би оставяло празен ред, а възстановяването след вход би
      // виждало „вече има съдържание“ и би се отказало.
      if (!latestRef.current && !hasUserContent(payload, stepIdx)) return;
      revRef.current += 1;
      latestRef.current = {
        payload,
        stepIdx,
        hasResult: meta?.hasResult ?? !!payload.result,
        rev: revRef.current,
      };
      // Съдържанието с лични данни остава в текущия таб (sessionStorage) —
      // веднага, включително докато тече сървърна заявка.
      const id = pointerRef.current?.draftId ?? LOCAL_DRAFT_ID;
      writePayload(id, payload);
      const prev = pointerRef.current;
      if (prev) {
        // Метаданните се вдигат ВЕДНАГА и в паметта на екрана, не само в
        // хранилището: закъснял отговор от присвояване/запис не бива да върне
        // стъпката, маршрута или флага за резултат назад.
        const next: DraftPointer = {
          ...prev,
          stepIdx: latestRef.current.stepIdx,
          hasResult: latestRef.current.hasResult,
          route,
          ts: Date.now(),
        };
        writePointer(next);
        pointerRef.current = next;
        // Състоянието на React се пипа само при СМИСЛЕНА промяна — иначе всяко
        // натискане на клавиш би рендирало екрана заради нова отметка за време.
        if (mountedRef.current && pointerMetaChanged(prev, next)) setPointer(next);
      }

      if (inFlightRef.current) {
        // Обединяване: изпраща се само последният снапшот, след като текущата
        // заявка приключи.
        pendingRef.current = true;
        return;
      }
      scheduleFlush(SYNC_DEBOUNCE_MS);
    },
    [active, enabled, route, scheduleFlush],
  );

  /* ---------------------------- 3. Claim след вход ------------------------- */
  /**
   * Още ли има смисъл резултат от заявка за чернова `draftId` на потребител
   * `userId`? Проверява се СЛЕД всеки await — изричното отказване, замяната на
   * указателя (друг таб, нова чернова) и изходът са необратими: нищо не се
   * записва, не се възстановява и не се повтаря след тях.
   */
  const stillCurrent = useCallback((draftId: string, userId: string): DraftPointer | null => {
    if (!mountedRef.current) return null;
    if (userIdRef.current !== userId) return null;
    const stored = readPointer();
    if (!stored || stored.draftId !== draftId || stored.flow !== flow) return null;
    const live = pointerRef.current ?? stored;
    if (live.draftId !== draftId) return null;
    return live;
  }, [flow]);

  const scheduleClaimRetry = useCallback(
    (draftId: string, userId: string) => {
      const prev = claimRetryRef.current;
      const st: ClaimRetryState =
        prev && prev.draftId === draftId && prev.userId === userId
          ? prev
          : { draftId, userId, attempts: 0, timer: null };
      if (st.timer) clearTimeout(st.timer);
      st.timer = null;
      st.attempts += 1;
      claimRetryRef.current = st;
      if (st.attempts >= MAX_CLAIM_ATTEMPTS) return;
      const delay = claimRetryDelay(st.attempts);
      st.timer = setTimeout(() => {
        st.timer = null;
        const live = stillCurrent(st.draftId, st.userId);
        if (!live) return;
        runClaimRef.current?.(live, st.userId);
      }, delay);
    },
    [stillCurrent],
  );

  const runClaim = useCallback(
    (current: DraftPointer, userId: string): boolean => {
      if (!mountedRef.current || claimInFlightRef.current) return false;
      const hasLocal = hasRestorableContent(readPayload(current.draftId) ?? readPayload(LOCAL_DRAFT_ID));
      // Операцията придобива собствеността ЕДВА тук — маркерът за „опитано" се
      // вдига само след като заявката наистина е стартирала.
      const gen = ++claimGenRef.current;
      claimInFlightRef.current = true;
      claimAttemptRef.current = current.draftId;
      setClaiming(true);
      trackDraftEvent("draft_claim_started", { draft_id: current.draftId, doc_key: current.docKey, source: flow });
      void (async () => {
        let res: Awaited<ReturnType<typeof claimDraft>>;
        try {
          res = await claimDraft(current);
        } finally {
          // Само притежателят на текущото поколение освобождава ключа и гаси
          // индикатора: обезсилена стара заявка не пипа новата операция.
          if (claimGenRef.current === gen) {
            claimInFlightRef.current = false;
            if (mountedRef.current) setClaiming(false);
          }
        }
        // Обезсилено поколение (нова самоличност/чернова, отказване) → без
        // никакви правомощия върху състоянието.
        if (claimGenRef.current !== gen) return;
        // Указателят е сменен/изтрит или потребителят е излязъл, докато
        // заявката е пътувала → резултатът е без значение.
        const live = stillCurrent(current.draftId, userId);
        if (!live) return;

        if (!res.ok) {
          trackDraftEvent(res.reason === "expired" ? "draft_expired" : "draft_claim_blocked", {
            draft_id: current.draftId,
            doc_key: current.docKey,
            source: flow,
            reason: res.reason,
          });
          if (isTransientDraftReason(res.reason)) {
            // Ограничен експоненциален backoff, само за същия потребител и
            // същата чернова; без дублирани заявки.
            scheduleClaimRetry(current.draftId, userId);
            return;
          }
          // expired / invalid_token / already_claimed / unauthorized: указателят е
          // безполезен за този потребител — съдържанието на таба остава, а
          // следващият запис създава негова собствена чернова.
          cancelClaimRetry();
          detach(live);
          return;
        }

        cancelClaimRetry();
        trackDraftEvent("draft_claim_succeeded", {
          draft_id: current.draftId,
          doc_key: current.docKey,
          source: flow,
          has_result: !!res.hasResult,
        });

        // Сливаме от ЖИВИЯ указател на същата чернова и от най-новото локално
        // състояние — не от снимката при започване на заявката. Токенът е
        // ротиран на сървъра и се маха и от браузъра.
        const latest = latestRef.current;
        const next: DraftPointer = {
          ...live,
          claimToken: "",
          claimed: true,
          savedDocId: res.savedDocId ?? live.savedDocId,
          hasResult: !!latest?.hasResult || !!res.hasResult || live.hasResult,
          stepIdx: Math.max(latest?.stepIdx ?? 0, live.stepIdx),
          route: routeRef.current || live.route,
          expiresAt: res.expiresAt ?? live.expiresAt,
          ts: Date.now(),
        };
        writePointer(next);
        updatePointer(next);

        // Съдържанието от сървъра е снимка от МОМЕНТА на заявката. Ако докато
        // тя е пътувала потребителят е въвел нещо (в паметта на екрана или в
        // таба), локалното е по-новото и остава — сървърното не се записва.
        const localAfter = readPayload(current.draftId) ?? readPayload(LOCAL_DRAFT_ID);
        const cleanTab = !tabHasContent() && !hasRestorableContent(localAfter);
        if (!cleanTab) return;

        let payload = res.payload ?? null;
        if (!payload && res.purged && res.savedDocId && !hasLocal) {
          payload = await loadSavedDraftPayload(res.savedDocId);
          // Закъсняло съдържание за вече заменена/отказана чернова се изхвърля.
          if (claimGenRef.current !== gen) return;
          if (!stillCurrent(current.draftId, userId)) return;
          // …както и за таб, в който междувременно е въведено съдържание.
          const local2 = readPayload(current.draftId) ?? readPayload(LOCAL_DRAFT_ID);
          if (tabHasContent() || hasRestorableContent(local2)) return;
        }
        if (payload) {
          writePayload(current.draftId, payload);
          // Възстановяваме само ако в този таб потребителят не е въвел нищо
          // (нов таб от имейл линка / OAuth връщане към чист екран).
          restoreRef.current?.(payload, { source: "claim" });
        }
      })();
      return true;
    },
    [cancelClaimRetry, detach, flow, scheduleClaimRetry, stillCurrent, tabHasContent, updatePointer],
  );

  runClaimRef.current = runClaim;

  /**
   * Граница на самоличността: истински потребител → изход или ДРУГ потребител.
   * Всичко от предишната самоличност се забравя — таймери, чакащо присвояване,
   * указател и състояние в паметта — за да не се опита присвояване на чужда
   * чернова в същия жив прозорец. Първата поява на потребител (от анонимен)
   * НЕ изчиства нищо: точно там анонимната чернова трябва да се присвои.
   */
  const prevUserIdRef = useRef<string | null>(user?.id ?? null);
  useEffect(() => {
    const nextId = user?.id ?? null;
    const prevId = prevUserIdRef.current;
    // Нов обект User със същото id (подновен токен) не е граница.
    if (prevId === nextId) return;
    prevUserIdRef.current = nextId;
    if (prevId === null) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    // Обезсилява всички заявки в движение: закъснял отговор от предишната
    // самоличност няма да пише нищо, а ключът за присвояване се освобождава
    // веднага — новата самоличност не чака увиснала стара заявка.
    invalidateClaim();
    discardRevRef.current += 1;
    claimAttemptRef.current = null;
    recreateRef.current = false;
    pendingRef.current = false;
    latestRef.current = null;
    restoredRef.current = true;
    pointerRef.current = null;
    if (mountedRef.current) {
      setPointer(null);
      setClaiming(false);
    }
    // Идемпотентно: AuthProvider вече чисти при изход, но при смяна на
    // потребител в същия прозорец гаранцията трябва да важи и тук.
    try {
      clearAllDraftStorage();
    } catch {
      /* ignore */
    }
  }, [user, invalidateClaim]);

  useEffect(() => {
    if (!active || !enabled) return;
    if (!user) {
      // Изход: чакащото присвояване вече е без притежател — обезсилява се, за да
      // не държи ключа при увиснала заявка.
      invalidateClaim();
      claimAttemptRef.current = null;
      return;
    }
    const current = pointerRef.current ?? readPointer();
    if (!current || current.flow !== flow) return;
    if (claimAttemptRef.current === current.draftId) return;
    const userId = user.id;

    const hasLocal = hasRestorableContent(readPayload(current.draftId) ?? readPayload(LOCAL_DRAFT_ID));

    // Вече присвоена (напр. втори таб след вход): нищо за присвояване; ако в
    // таба няма съдържание, го теглим от източника на истина.
    if (current.claimed) {
      claimAttemptRef.current = current.draftId;
      if (hasLocal || tabHasContent()) return;
      void (async () => {
        let payload: DraftPayload | null = null;
        if (current.savedDocId) {
          payload = await loadSavedDraftPayload(current.savedDocId);
          if (!stillCurrent(current.draftId, userId)) return;
        }
        if (!payload) {
          const res = await claimDraft(current);
          const live = stillCurrent(current.draftId, userId);
          if (!live) return;
          if (res.ok) {
            payload = res.payload ?? null;
            if (!payload && res.savedDocId) {
              payload = await loadSavedDraftPayload(res.savedDocId);
              if (!stillCurrent(current.draftId, userId)) return;
            }
            if (res.savedDocId && res.savedDocId !== live.savedDocId) {
              const fresh = stillCurrent(current.draftId, userId);
              if (!fresh) return;
              const next: DraftPointer = { ...fresh, savedDocId: res.savedDocId, hasResult: true };
              writePointer(next);
              updatePointer(next);
            }
          } else if (isDetachDraftReason(res.reason)) {
            detach(live);
            return;
          }
        }
        if (!stillCurrent(current.draftId, userId)) return;
        if (payload && !tabHasContent()) {
          writePayload(current.draftId, payload);
          restoreRef.current?.(payload, { source: "claim" });
          trackDraftEvent("draft_restored", { draft_id: current.draftId, doc_key: current.docKey, source: flow });
        }
      })();
      return;
    }

    // Маркерът за „опитано" се вдига ВЪТРЕ в runClaim — само ако заявката
    // наистина е стартирала. Иначе нова чернова би останала маркирана като
    // опитана, без никога да бъде присвоена.
    runClaim(current, userId);
    // Указателят е част от зависимостите ПО САМОЛИЧНОСТ И СЪСТОЯНИЕ: чернова,
    // създадена след като потребителят вече е влязъл, се присвоява веднага, а
    // не чак при презареждане. Стъпката/маршрутът не влизат тук — иначе всяко
    // писане би пускало ефекта (claimAttemptRef пази от дублиране).
  }, [
    active,
    enabled,
    user,
    flow,
    pointer?.draftId,
    pointer?.claimed,
    pointer?.savedDocId,
    detach,
    updatePointer,
    tabHasContent,
    runClaim,
    invalidateClaim,
    stillCurrent,
  ]);


  const discard = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    // Отказването обезсилва и присвояването в движение: ключът се освобождава
    // веднага, а закъснелият отговор няма правомощия.
    invalidateClaim();
    // Изричното отказване е безусловно: потребителят е приключил с документа.
    discardRevRef.current += 1;
    clearDraft(pointerRef.current?.draftId);
    clearDraft(LOCAL_DRAFT_ID);
    updatePointer(null);
    latestRef.current = null;
    pendingRef.current = false;
  }, [invalidateClaim, updatePointer]);


  /* ------------------------------ Почистване ------------------------------ */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      const st = claimRetryRef.current;
      if (st?.timer) clearTimeout(st.timer);
      claimRetryRef.current = null;
    };
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
