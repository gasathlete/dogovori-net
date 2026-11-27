import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildSnapshotIdentityKey,
  buildTitleContext,
  computeSourceBinding,
  resolveSnapshotFreshness,
  type AnalysisSourceBinding,
  type ResolvedSnapshotDigest,
  type SnapshotFreshness,
} from "@/lib/analysisSourceBinding";

/**
 * Q2b2 — актуалност на анализа спрямо ТОЧНО текущия запазен текст/заглавие.
 *
 * Изчислението е асинхронно (Web Crypto), затова резултатът се приема само ако
 * ключът на идентичността (потребител + документ + точен вход) е още същият.
 * Закъснял дайджест не може да удостовери нов текст дори за един рендер.
 */
export function useSourceFreshness(input: {
  userId: string | null | undefined;
  docId: string | null | undefined;
  savedText: string | null | undefined;
  savedTitle: string | null | undefined;
  verification: unknown;
  hasUnsavedChanges: boolean;
}): { freshness: SnapshotFreshness; currentBinding: AnalysisSourceBinding | null; hashUnavailable: boolean } {
  const identityKey = useMemo(
    () =>
      buildSnapshotIdentityKey({
        userId: input.userId,
        docId: input.docId,
        savedText: input.savedText,
        savedTitle: input.savedTitle,
      }),
    [input.userId, input.docId, input.savedText, input.savedTitle],
  );

  const [digest, setDigest] = useState<ResolvedSnapshotDigest | null>(null);
  /** Ключът, за който изчислението се е провалило — тогава не твърдим нищо. */
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const latestKey = useRef(identityKey);
  latestKey.current = identityKey;

  const hasSource = !!input.userId && !!input.docId && typeof input.savedText === "string";

  useEffect(() => {
    if (!hasSource) {
      setDigest(null);
      setFailedKey(null);
      return;
    }
    let active = true;
    const keyAtStart = identityKey;
    void (async () => {
      try {
        const binding = await computeSourceBinding({
          sourceText: (input.savedText ?? "").trim(),
          titleContext: buildTitleContext(input.savedTitle ?? ""),
        });
        if (!active || latestKey.current !== keyAtStart) return;
        setFailedKey(null);
        setDigest({ identityKey: keyAtStart, binding });
      } catch {
        // Хеширането не е налично/пропадна: падаме затворено — „не знаем",
        // а не безкрайно „проверяваме". Никакво необработено отхвърляне.
        if (!active || latestKey.current !== keyAtStart) return;
        setDigest(null);
        setFailedKey(keyAtStart);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, hasSource]);

  const hashUnavailable = failedKey === identityKey;

  let freshness: SnapshotFreshness;
  if (!hasSource) {
    freshness = "checking";
  } else if (hashUnavailable) {
    freshness = input.hasUnsavedChanges ? "unsaved" : "unknown";
  } else {
    freshness = resolveSnapshotFreshness({
      hasUnsavedChanges: input.hasUnsavedChanges,
      identityKey,
      digest,
      storedVerification: input.verification,
    });
  }

  return {
    freshness,
    currentBinding: digest && digest.identityKey === identityKey ? digest.binding : null,
    /** Истина само когато отпечатъкът за ТОЗИ вход не може да бъде изчислен. */
    hashUnavailable,
  };
}

