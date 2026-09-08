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
}): { freshness: SnapshotFreshness; currentBinding: AnalysisSourceBinding | null } {
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
  const latestKey = useRef(identityKey);
  latestKey.current = identityKey;

  const hasSource = !!input.userId && !!input.docId && typeof input.savedText === "string";

  useEffect(() => {
    if (!hasSource) {
      setDigest(null);
      return;
    }
    let active = true;
    const keyAtStart = identityKey;
    void (async () => {
      const binding = await computeSourceBinding({
        sourceText: (input.savedText ?? "").trim(),
        titleContext: buildTitleContext(input.savedTitle ?? ""),
      });
      if (!active || latestKey.current !== keyAtStart) return;
      setDigest({ identityKey: keyAtStart, binding });
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, hasSource]);

  const freshness = hasSource
    ? resolveSnapshotFreshness({
        hasUnsavedChanges: input.hasUnsavedChanges,
        identityKey,
        digest,
        storedVerification: input.verification,
      })
    : "checking";

  return {
    freshness,
    currentBinding: digest && digest.identityKey === identityKey ? digest.binding : null,
  };
}
