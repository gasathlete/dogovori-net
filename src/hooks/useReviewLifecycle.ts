/**
 * Q2d — ЕДИНЕН жизнен цикъл на AI ревизията.
 *
 * Един източник на истина: показаният резултат носи ключа на снимката, за която
 * е заявен. Промяна на текста, вида, версията, приетия контекст, отметката за
 * лични данни или на потребителския обхват сменя ключа и резултатът спира да се
 * показва като текущ — синхронно, още при рисуването, без ефекти.
 *
 * Закъснял отговор от стара снимка не пипа нищо. Автоматичният старт се случва
 * веднъж за снимка, включително в StrictMode (двойно монтиране).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reviewIdentityKey, type ReviewSnapshotInput } from "@/lib/reviewSnapshot";
import type { DocumentReview, ReviewOutcome } from "@/lib/documentReview";

export interface ReviewLifecycleInput extends ReviewSnapshotInput {
  /** Обхват на потребителя — изход от профила обезсилва показания резултат. */
  userScope?: string | null;
}

export type ReviewRunner = (
  input: ReviewSnapshotInput & { userConfirmed: boolean },
) => Promise<ReviewOutcome>;

export type ReviewPhase = "idle" | "loading" | "done" | "error";

interface InternalState {
  key: string;
  phase: ReviewPhase;
  review: DocumentReview | null;
  requestedDigest: string | null;
  error: string | null;
  confirmationRequired: boolean;
}

export interface ReviewLifecycle {
  /** Ключът на ТЕКУЩИЯ вход. */
  key: string;
  phase: ReviewPhase;
  loading: boolean;
  /** Резултат, който принадлежи на текущия вход (иначе `null`). */
  review: DocumentReview | null;
  /** Последно известен резултат, дори когато е от предишна снимка. */
  lastReview: DocumentReview | null;
  /** Последният резултат е от предишна снимка (историческа, неутрална). */
  stale: boolean;
  requestedDigest: string | null;
  error: string | null;
  /** Изисква се потвърждение за ЧАКАЩАТА снимка (редакция го обезсилва). */
  confirmationRequired: boolean;
  run: (userConfirmed?: boolean) => void;
}

const IDLE = (key: string): InternalState => ({
  key,
  phase: "idle",
  review: null,
  requestedDigest: null,
  error: null,
  confirmationRequired: false,
});

const GENERIC_ERROR = "Ревизията не успя. Опитайте пак.";

export function useReviewLifecycle(options: {
  input: ReviewLifecycleInput;
  runner: ReviewRunner;
  auto?: boolean;
}): ReviewLifecycle {
  const { input, runner, auto = true } = options;
  const key = useMemo(() => reviewIdentityKey(input), [input]);

  const [state, setState] = useState<InternalState>(() => IDLE(key));
  const [lastReview, setLastReview] = useState<DocumentReview | null>(null);

  // Синхронна текуща идентичност: закъснял отговор се сравнява с нея, не с
  // props при разрешаването на обещанието.
  const keyRef = useRef(key);
  keyRef.current = key;
  const inputRef = useRef(input);
  inputRef.current = input;
  const runnerRef = useRef(runner);
  runnerRef.current = runner;

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const run = useCallback((userConfirmed = false) => {
    const forKey = keyRef.current;
    const snapshot = inputRef.current;
    setState({ ...IDLE(forKey), phase: "loading" });
    void (async () => {
      try {
        const out = await runnerRef.current({
          documentText: snapshot.documentText,
          documentTitle: snapshot.documentTitle,
          documentType: snapshot.documentType,
          documentVersion: snapshot.documentVersion,
          context: snapshot.context ?? null,
          ignorePersonalData: snapshot.ignorePersonalData,
          userConfirmed,
        });
        if (!aliveRef.current || keyRef.current !== forKey) return;
        if (out.review) {
          setLastReview(out.review);
          setState({
            key: forKey,
            phase: "done",
            review: out.review,
            requestedDigest: out.requestedDigest,
            error: null,
            confirmationRequired: false,
          });
        } else {
          setState({
            key: forKey,
            phase: "error",
            review: null,
            requestedDigest: out.requestedDigest,
            error: out.error ?? GENERIC_ERROR,
            confirmationRequired: out.confirmationRequired,
          });
        }
      } catch {
        // Провал при отпечатък или при повикването — състоянието се урежда.
        if (!aliveRef.current || keyRef.current !== forKey) return;
        setState({ ...IDLE(forKey), phase: "error", error: GENERIC_ERROR });
      }
    })();
  }, []);

  // Автоматичен старт: точно веднъж за снимка (StrictMode не удвоява заявката).
  const startedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!auto) return;
    if (startedKeyRef.current === key) return;
    startedKeyRef.current = key;
    run();
  }, [auto, key, run]);

  const current = state.key === key ? state : IDLE(key);
  return {
    key,
    phase: current.phase,
    loading: current.phase === "loading",
    review: current.review,
    lastReview,
    stale: !!lastReview && current.review === null,
    requestedDigest: current.requestedDigest,
    error: current.error,
    confirmationRequired: current.confirmationRequired,
    run,
  };
}
