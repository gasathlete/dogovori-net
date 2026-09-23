/**
 * Q2b2 — контролер на екрана „качен договор".
 *
 * Тук живее цялата асинхронна дисциплина, която трябва да е тествана с реални
 * отложени обещания:
 *   - обхват (документ + потребител) с генерации, които се вдигат и при размонтиране;
 *   - зареждане, което решава дали да пази черновите В МОМЕНТА НА ПРИЛАГАНЕ,
 *     а не по стойност, заснета при стартиране на заявката;
 *   - оптимистичен запис (CAS по `updated_at`), при който 0 върнати реда е
 *     конфликт: черновата остава, нищо свързано не се презаписва;
 *   - отдалечена промяна под мръсна чернова се пази ОТДЕЛНО и изисква изричен
 *     избор — не се приема като нова база тихо;
 *   - закъсняло презареждане не може да върне по-стара база след успешен запис.
 *
 * Достъпът до базата е инжектируем, за да може поведението да се тества без мрежа.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Issue = {
  severity: "low" | "medium" | "high";
  title: string;
  clause?: string;
  explanation: string;
  suggestion?: string;
};
export type Missing = { name: string; why: string };
export type Analysis = {
  id: string;
  score: number;
  contract_type: string;
  summary: string;
  issues: Issue[];
  missing_clauses: Missing[];
  created_at: string;
  model: string;
  verification?: unknown;
};
export type Contract = {
  id: string;
  title: string;
  source: string;
  storage_path: string | null;
  original_filename: string | null;
  text_hash: string;
  extracted_text: string;
  contact_id: string | null;
  created_at: string;
  updated_at: string | null;
};
export type Contact = { id: string; name: string };

export type DbResult<T> = { data: T | null; error: { message?: string } | null };

export interface UploadedDocApi {
  loadContract(docId: string): Promise<DbResult<Contract>>;
  loadLatestAnalysis(docId: string): Promise<DbResult<Analysis>>;
  loadContacts(): Promise<DbResult<Contact[]>>;
  loadSavedCopyId(userId: string, docId: string): Promise<DbResult<{ id: string }>>;
  updateContract(
    docId: string,
    patch: Partial<Pick<Contract, "extracted_text" | "text_hash" | "title">>,
    capturedVersion: string | null,
  ): Promise<DbResult<Contract>>;
  updateContactLink(docId: string, contactId: string | null): Promise<DbResult<Contract>>;
  updateSavedCopy(copyId: string, patch: { title?: string; payload?: unknown }): Promise<DbResult<unknown>>;
  createSavedCopy(input: {
    userId: string;
    contract: Contract;
    text: string;
  }): Promise<DbResult<{ id: string }>>;
  hashText(text: string): Promise<string>;
}

export const textToPayload = (title: string, text: string) => ({
  title,
  clauses: [{ number: "", title: "", body: text }],
});

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const supabaseUploadedDocApi: UploadedDocApi = {
  loadContract: (docId) =>
    supabase.from("uploaded_contracts").select("*").eq("id", docId).maybeSingle() as unknown as Promise<
      DbResult<Contract>
    >,
  loadLatestAnalysis: (docId) =>
    supabase
      .from("risk_analyses")
      .select("*")
      .eq("uploaded_contract_id", docId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<DbResult<Analysis>>,
  loadContacts: () =>
    supabase
      .from("contacts")
      .select("id,name")
      .is("deleted_at", null)
      .order("name", { ascending: true }) as unknown as Promise<DbResult<Contact[]>>,
  loadSavedCopyId: (userId, docId) =>
    supabase
      .from("saved_documents")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "contract")
      .eq("source_id", `uploaded:${docId}`)
      .maybeSingle() as unknown as Promise<DbResult<{ id: string }>>,
  updateContract: (docId, patch, capturedVersion) => {
    let q = supabase.from("uploaded_contracts").update(patch).eq("id", docId);
    q = capturedVersion ? q.eq("updated_at", capturedVersion) : q.is("updated_at", null);
    return q.select("*").maybeSingle() as unknown as Promise<DbResult<Contract>>;
  },
  updateContactLink: (docId, contactId) =>
    supabase
      .from("uploaded_contracts")
      .update({ contact_id: contactId })
      .eq("id", docId)
      .select("*")
      .maybeSingle() as unknown as Promise<DbResult<Contract>>,
  updateSavedCopy: (copyId, patch) =>
    supabase.from("saved_documents").update(patch as Record<string, never>).eq("id", copyId) as unknown as Promise<
      DbResult<unknown>
    >,
  createSavedCopy: ({ userId, contract, text }) =>
    supabase
      .from("saved_documents")
      .insert({
        user_id: userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        kind: "contract" as any,
        title: contract.title,
        source_id: `uploaded:${contract.id}`,
        contact_id: contract.contact_id,
        payload: textToPayload(contract.title, text),
      })
      .select("id")
      .single() as unknown as Promise<DbResult<{ id: string }>>,
  hashText: sha256Hex,
};

export type SaveOutcome = "saved" | "conflict" | "error" | "ignored" | "invalid" | "blocked";

export function snapshotKeyOf(text: string, title: string): string {
  return `${text}\u0000${title}`;
}

export const CONFLICT_BLOCK_MESSAGE =
  "Документът е променен и на друго място. Изберете коя версия остава, преди да записвате пак.";

export const LOAD_ERROR_MESSAGE =
  "Документът не можа да бъде зареден. Вашият текст в редактора е запазен — опитайте пак.";


/** Кои полета РЕАЛНО са записани в базата при този запис. */
export interface SavedFields {
  text?: boolean;
  title?: boolean;
}

export function useUploadedContractDoc(input: {
  docId: string | null | undefined;
  userId: string | null | undefined;
  api?: UploadedDocApi;
  onNotice?: (kind: "success" | "error", message: string) => void;
}) {
  const api = input.api ?? supabaseUploadedDocApi;
  const notify = input.onNotice;
  const scopeKey = `${input.userId ?? ""}|${input.docId ?? ""}`;

  const [contract, setContract] = useState<Contract | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Провалено четене — документът НЕ е обявен за липсващ. */
  const [loadError, setLoadError] = useState<string | null>(null);


  const [editText, setEditTextState] = useState("");
  const [titleDraft, setTitleDraftState] = useState("");
  const [contactId, setContactId] = useState<string>("none");

  const [savingText, setSavingText] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [creatingShare, setCreatingShare] = useState(false);
  const [remoteConflict, setRemoteConflict] = useState<Contract | null>(null);
  const [conflictUnresolved, setConflictUnresolvedState] = useState(false);
  const [savedRevision, setSavedRevision] = useState(0);

  // ---- обхват и генерации ---------------------------------------------------
  const genRef = useRef(0);
  const scopeRef = useRef(scopeKey);
  const isLive = useCallback(
    (gen: number, scope: string) => gen === genRef.current && scope === scopeRef.current,
    [],
  );

  // ---- огледала за решения „в момента на прилагане" ------------------------
  const draftTextRef = useRef("");
  const draftTitleRef = useRef("");
  const baselineTextRef = useRef("");
  const baselineTitleRef = useRef("");
  const saveSeqRef = useRef(0);
  /** Ред на четенията: приложим САМО резултата на последно стартираното. */
  const loadSeqRef = useRef(0);
  /** Всяко създаване на свързано копие обезсилва по-стари четения на копието. */
  const copyWriteSeqRef = useRef(0);
  const conflictRef = useRef(false);

  const setConflictUnresolved = useCallback((v: boolean) => {
    conflictRef.current = v;
    setConflictUnresolvedState(v);
  }, []);

  const setEditText = useCallback((v: string) => {
    draftTextRef.current = v;
    setEditTextState(v);
  }, []);
  const setTitleDraft = useCallback((v: string) => {
    draftTitleRef.current = v;
    setTitleDraftState(v);
  }, []);

  const commitBaseline = useCallback(
    (row: Contract, opts?: { keepDrafts?: boolean }) => {
      setContract(row);
      baselineTextRef.current = row.extracted_text ?? "";
      baselineTitleRef.current = row.title ?? "";
      if (!opts?.keepDrafts) {
        setEditText(row.extracted_text ?? "");
        setTitleDraft(row.title ?? "");
        setContactId(row.contact_id ?? "none");
      }
    },
    [setEditText, setTitleDraft],
  );

  const clearConflict = useCallback(() => {
    setRemoteConflict(null);
    setConflictUnresolved(false);
  }, [setConflictUnresolved]);

  /** Конфликтът е ВИДИМ дори когато отдалеченият ред не е успял да се зареди. */
  const noteConflict = useCallback(
    (remote: Contract | null) => {
      setConflictUnresolved(true);
      if (remote) setRemoteConflict(remote);
    },
    [setConflictUnresolved],
  );

  const resetAll = useCallback(() => {
    setContract(null);
    setAnalysis(null);
    setContacts([]);
    setSavedDocId(null);
    setLoadedScope(null);
    setRemoteConflict(null);
    setConflictUnresolved(false);
    setSavingText(false);
    setSavingTitle(false);
    setSavingContact(false);
    setCreatingShare(false);
    setSavedRevision(0);
    setEditText("");
    setTitleDraft("");
    setContactId("none");
    baselineTextRef.current = "";
    baselineTitleRef.current = "";
    saveSeqRef.current = 0;
    loadSeqRef.current = 0;
    copyWriteSeqRef.current = 0;
  }, [setConflictUnresolved, setEditText, setTitleDraft]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const scope = `${input.userId ?? ""}|${input.docId ?? ""}`;
      const gen = genRef.current;
      const saveSeqAtStart = saveSeqRef.current;
      const seq = ++loadSeqRef.current;
      const copyWriteAtStart = copyWriteSeqRef.current;
      if (!input.docId || !input.userId) {
        setLoading(false);
        return;
      }
      if (!opts?.silent) setLoading(true);
      const isCurrentLoad = () => isLive(gen, scope) && seq === loadSeqRef.current;
      /**
       * Провалено четене НЕ трие видим конфликт и НЕ трие вече заредена
       * чернова — само обявява грешка и разрешава повторен опит.
       */
      const failLoad = () => {
        if (!isCurrentLoad()) return;
        setLoadError(LOAD_ERROR_MESSAGE);
        setLoadedScope(scope);
        setLoading(false);
      };

      let cRes: DbResult<Contract>;
      let aRes: DbResult<Analysis>;
      let kRes: DbResult<Contact[]>;
      try {
        [cRes, aRes, kRes] = await Promise.all([
          api.loadContract(input.docId),
          api.loadLatestAnalysis(input.docId),
          api.loadContacts(),
        ]);
      } catch {
        failLoad();
        return;
      }
      if (!isCurrentLoad()) return;

      // Грешка от базата НЕ е „няма такъв документ".
      if (cRes.error) {
        failLoad();
        return;
      }

      // Закъсняло четене не може да върне по-стара база след успешен запис —
      // това важи за ЦЕЛИЯ резултат (договор, анализ, контакти, копие).
      const staleAfterSave = saveSeqAtStart !== saveSeqRef.current;
      if (staleAfterSave) {
        setLoading(false);
        return;
      }

      setLoadError(null);
      setAnalysis(aRes.data ?? null);
      setContacts(kRes.data ?? []);

      const remote = cRes.data ?? null;
      if (!remote) {
        setContract(null);
        setLoadedScope(scope);
        setLoading(false);
        return;
      }

      {
        // Решението за черновите се взема СЕГА, по актуалните стойности.
        const dirtyTextNow = draftTextRef.current !== baselineTextRef.current;
        const dirtyTitleNow = draftTitleRef.current !== baselineTitleRef.current;
        const dirty = dirtyTextNow || dirtyTitleNow;
        const remoteChanged =
          (remote.extracted_text ?? "") !== baselineTextRef.current ||
          (remote.title ?? "") !== baselineTitleRef.current;

        if (conflictRef.current) {
          // Неразрешен конфликт: само показваме отдалечената снимка.
          setRemoteConflict(remote);
        } else if (!dirty) {
          commitBaseline(remote);
        } else if (remoteChanged) {
          // Базата за CAS НЕ се мести — отдалеченият ред чака изричен избор.
          noteConflict(remote);
        } else {
          setContract(remote);
        }
      }

      let sd: DbResult<{ id: string }>;
      try {
        sd = await api.loadSavedCopyId(input.userId, input.docId);
      } catch {
        if (isCurrentLoad()) {
          setLoadedScope(scope);
          setLoading(false);
        }
        return;
      }
      if (!isCurrentLoad()) return;
      // Ново копие или пореден запис междувременно не се затрива с по-старо четене.
      if (copyWriteAtStart === copyWriteSeqRef.current && saveSeqAtStart === saveSeqRef.current) {
        setSavedDocId(sd.data?.id ?? null);
      }
      setLoadedScope(scope);
      setLoading(false);
    },
    [api, input.docId, input.userId, isLive, commitBaseline, noteConflict],
  );

  /** Изричен повторен опит след провалено четене. */
  const retryLoad = useCallback(() => {
    setLoadError(null);
    void load();
  }, [load]);


  // Смяна на документ/потребител: всичко се изчиства и никоя стара заявка не се приема.
  useEffect(() => {
    genRef.current++;
    scopeRef.current = scopeKey;
    conflictRef.current = false;
    resetAll();
    setLoading(true);
    void load();
    return () => {
      // Размонтиране също анулира заявките.
      genRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const refreshAnalysisOnly = useCallback(async () => {
    const scope = `${input.userId ?? ""}|${input.docId ?? ""}`;
    const gen = genRef.current;
    if (!input.docId || !input.userId) return;
    try {
      const { data } = await api.loadLatestAnalysis(input.docId);
      if (!isLive(gen, scope)) return;
      setAnalysis(data ?? null);
    } catch {
      /* тихо: анализът остава какъвто е */
    }
  }, [api, input.docId, input.userId, isLive]);

  // ---- запис ---------------------------------------------------------------

  /**
   * Прилага РЕАЛНО записания ред. Нормализира редактора само за полетата, които
   * са били записани, и само ако тяхната чернова не е променяна междувременно —
   * иначе мръсна чернова на ДРУГО поле щеше да се загуби.
   */
  const applySavedRow = useCallback(
    (row: Contract, captured: { text: string; title: string }, fields: SavedFields) => {
      saveSeqRef.current++;
      setContract(row);
      baselineTextRef.current = row.extracted_text ?? "";
      baselineTitleRef.current = row.title ?? "";
      clearConflict();
      setSavedRevision((n) => n + 1);
      if (fields.text && draftTextRef.current === captured.text) setEditText(row.extracted_text ?? "");
      if (fields.title && draftTitleRef.current === captured.title) setTitleDraft(row.title ?? "");
    },
    [clearConflict, setEditText, setTitleDraft],
  );

  const blockedByConflict = useCallback((): boolean => {
    if (!conflictRef.current) return false;
    notify?.("error", CONFLICT_BLOCK_MESSAGE);
    return true;
  }, [notify]);

  const saveText = useCallback(async (): Promise<SaveOutcome> => {
    const current = contract;
    if (!current || !input.docId || !input.userId) return "ignored";
    if (blockedByConflict()) return "blocked";
    const scope = `${input.userId}|${input.docId}`;
    const gen = genRef.current;
    const capturedText = draftTextRef.current;
    const capturedTitle = draftTitleRef.current;
    const trimmed = capturedText.trim();
    if (trimmed.length < 80) {
      notify?.("error", "Текстът е твърде кратък (мин. 80 знака)");
      return "invalid";
    }
    // Преграда за ограничени идентификатори: ПРЕДИ хеширането и ПРЕДИ записа.
    // В съобщението и в журнала влиза само видът, никога самата стойност.
    const restrictedText = findRestrictedIdentifiers(trimmed);
    if (restrictedText.length > 0) {
      notify?.("error", restrictedIdentifierMessage(restrictedText));
      return "blocked";
    }
    const capturedVersion = current.updated_at;
    const copyId = savedDocId;
    setSavingText(true);
    let text_hash: string;
    try {
      text_hash = await api.hashText(trimmed);
    } catch {
      if (isLive(gen, scope)) {
        setSavingText(false);
        notify?.("error", "Проверката на текста не е налична в този браузър. Опитайте пак.");
      }
      return "error";
    }
    // Обхватът се проверява СЛЕД хеширането и ПРЕДИ записа.
    if (!isLive(gen, scope)) return "ignored";
    let res: DbResult<Contract>;
    try {
      res = await api.updateContract(input.docId, { extracted_text: trimmed, text_hash }, capturedVersion);
    } catch (e) {
      if (isLive(gen, scope)) {
        setSavingText(false);
        notify?.("error", (e as Error)?.message || "Грешка при запис");
      }
      return "error";
    }
    if (!isLive(gen, scope)) return "ignored";
    setSavingText(false);
    if (res.error) {
      notify?.("error", res.error.message || "Грешка при запис");
      return "error";
    }
    if (!res.data) {
      // Конфликт: нищо не е презаписано, черновата остава, свързаното копие НЕ се пипа.
      noteConflict(null);
      void load({ silent: true });
      return "conflict";
    }
    applySavedRow(res.data, { text: capturedText, title: capturedTitle }, { text: true });
    notify?.("success", "Текстът е запазен");
    if (copyId) {
      const savedRow = res.data;
      if (isLive(gen, scope)) {
        try {
          await api.updateSavedCopy(copyId, {
            payload: textToPayload(savedRow.title, savedRow.extracted_text ?? trimmed),
          });
        } catch {
          /* свързаното копие не блокира основния запис */
        }
      }
    }
    return "saved";
  }, [
    api,
    applySavedRow,
    blockedByConflict,
    contract,
    input.docId,
    input.userId,
    isLive,
    load,
    noteConflict,
    notify,
    savedDocId,
  ]);

  const saveTitle = useCallback(async (): Promise<SaveOutcome> => {
    const current = contract;
    if (!current || !input.docId || !input.userId) return "ignored";
    if (blockedByConflict()) return "blocked";
    const scope = `${input.userId}|${input.docId}`;
    const gen = genRef.current;
    const capturedText = draftTextRef.current;
    const capturedTitle = draftTitleRef.current;
    const trimmed = capturedTitle.trim();
    if (!trimmed || trimmed === current.title) {
      setTitleDraft(current.title);
      return "ignored";
    }
    if (trimmed.length > 200) {
      notify?.("error", "Името е твърде дълго");
      return "invalid";
    }
    const restrictedTitle = findRestrictedIdentifiers(trimmed);
    if (restrictedTitle.length > 0) {
      notify?.("error", restrictedIdentifierMessage(restrictedTitle));
      return "blocked";
    }
    const capturedVersion = current.updated_at;
    const copyId = savedDocId;
    setSavingTitle(true);
    let res: DbResult<Contract>;
    try {
      res = await api.updateContract(input.docId, { title: trimmed }, capturedVersion);
    } catch (e) {
      if (isLive(gen, scope)) {
        setSavingTitle(false);
        notify?.("error", (e as Error)?.message || "Грешка при запис");
      }
      return "error";
    }
    if (!isLive(gen, scope)) return "ignored";
    setSavingTitle(false);
    if (res.error) {
      notify?.("error", res.error.message || "Грешка при запис");
      return "error";
    }
    if (!res.data) {
      noteConflict(null);
      void load({ silent: true });
      return "conflict";
    }
    applySavedRow(res.data, { text: capturedText, title: capturedTitle }, { title: true });
    notify?.("success", "Името е обновено");
    if (copyId && isLive(gen, scope)) {
      try {
        await api.updateSavedCopy(copyId, { title: res.data.title });
      } catch {
        /* без ефект върху основния запис */
      }
    }
    return "saved";
  }, [
    api,
    applySavedRow,
    blockedByConflict,
    contract,
    input.docId,
    input.userId,
    isLive,
    load,
    noteConflict,
    notify,
    savedDocId,
    setTitleDraft,
  ]);

  const saveContact = useCallback(
    async (next: string): Promise<SaveOutcome> => {
      const current = contract;
      if (!current || !input.docId || !input.userId) return "ignored";
      if (blockedByConflict()) return "blocked";
      const scope = `${input.userId}|${input.docId}`;
      const gen = genRef.current;
      const previous = current.contact_id ?? "none";
      setContactId(next);
      setSavingContact(true);
      let res: DbResult<Contract>;
      try {
        res = await api.updateContactLink(input.docId, next === "none" ? null : next);
      } catch (e) {
        if (isLive(gen, scope)) {
          setSavingContact(false);
          setContactId(previous);
          notify?.("error", (e as Error)?.message || "Грешка при запис");
        }
        return "error";
      }
      if (!isLive(gen, scope)) return "ignored";
      setSavingContact(false);
      if (res.error || !res.data) {
        setContactId(previous);
        notify?.("error", res.error?.message || "Грешка при запис");
        return "error";
      }
      const row = res.data;
      const sameText = (row.extracted_text ?? "") === baselineTextRef.current;
      const sameTitle = (row.title ?? "") === baselineTitleRef.current;
      setContactId(row.contact_id ?? "none");
      notify?.("success", "Контрагентът е обновен");
      if (sameText && sameTitle) {
        // Само връзката е сменена — новата версия е безопасна за CAS.
        saveSeqRef.current++;
        setContract(row);
        baselineTextRef.current = row.extracted_text ?? "";
        baselineTitleRef.current = row.title ?? "";
        return "saved";
      }
      // Текстът/името са различни от нашата база: НЕ приемаме новия CAS токен.
      noteConflict(row);
      return "conflict";
    },
    [api, blockedByConflict, contract, input.docId, input.userId, isLive, noteConflict, notify],
  );

  const prepareForSigning = useCallback(async (): Promise<SaveOutcome> => {
    if (!contract || !input.userId || !input.docId) return "ignored";
    if (savedDocId) return "ignored";
    const scope = `${input.userId}|${input.docId}`;
    const gen = genRef.current;
    const text = draftTextRef.current.trim();
    if (text.length < 80) {
      notify?.("error", "Запазете текста преди подписване");
      return "invalid";
    }
    copyWriteSeqRef.current++;
    setCreatingShare(true);
    let res: DbResult<{ id: string }>;
    try {
      res = await api.createSavedCopy({ userId: input.userId, contract, text });
    } catch (e) {
      if (isLive(gen, scope)) {
        setCreatingShare(false);
        notify?.("error", (e as Error)?.message || "Грешка");
      }
      return "error";
    }
    if (!isLive(gen, scope)) return "ignored";
    setCreatingShare(false);
    if (res.error || !res.data) {
      notify?.("error", res.error?.message || "Грешка");
      return "error";
    }
    copyWriteSeqRef.current++;
    setSavedDocId(res.data.id);
    notify?.("success", "Готово за подписване");
    return "saved";
  }, [api, contract, input.docId, input.userId, isLive, notify, savedDocId]);

  /** Изричен избор: приемаме отдалечената версия като нова база. */
  const useRemoteVersion = useCallback(() => {
    const remote = remoteConflict;
    if (!remote) return false;
    saveSeqRef.current++;
    commitBaseline(remote);
    clearConflict();
    return true;
  }, [clearConflict, commitBaseline, remoteConflict]);

  /**
   * Изричен избор: моят текст остава, но очакваната версия за CAS се пренася
   * върху ПОКАЗАНАТА отдалечена снимка. Нищо не се записва сега — следващият
   * изричен запис ще успее, а нова отдалечена промяна пак ще даде конфликт.
   */
  const keepLocalVersion = useCallback(() => {
    const remote = remoteConflict;
    if (!remote) return false;
    saveSeqRef.current++;
    commitBaseline(remote, { keepDrafts: true });
    clearConflict();
    return true;
  }, [clearConflict, commitBaseline, remoteConflict]);

  const dirtyText = !!contract && editText !== (contract.extracted_text ?? "");
  const dirtyTitle = !!contract && titleDraft.trim() !== (contract.title ?? "").trim();
  const hasUnsavedChanges = dirtyText || dirtyTitle;

  const scopeReady = loadedScope === scopeKey;
  const savedSnapshotKey = useMemo(
    () => snapshotKeyOf(contract?.extracted_text ?? "", contract?.title ?? ""),
    [contract?.extracted_text, contract?.title],
  );

  return {
    // Данни се дават НАВЪН само когато принадлежат на текущия обхват.
    contract: scopeReady ? contract : null,
    analysis: scopeReady ? analysis : null,
    contacts: scopeReady ? contacts : [],
    savedDocId: scopeReady ? savedDocId : null,
    loading: (loading || !scopeReady) && !loadError,
    loadError: scopeReady ? loadError : null,
    retryLoad,

    editText,
    titleDraft,
    contactId,
    setEditText,
    setTitleDraft,
    dirtyText,
    dirtyTitle,
    hasUnsavedChanges,
    savedRevision,
    savedSnapshotKey,
    remoteConflict: scopeReady ? remoteConflict : null,
    conflictUnresolved: scopeReady ? conflictUnresolved : false,
    savingText,
    savingTitle,
    savingContact,
    creatingShare,
    load,
    refreshAnalysisOnly,
    saveText,
    saveTitle,
    saveContact,
    prepareForSigning,
    useRemoteVersion,
    keepLocalVersion,
  };
}
