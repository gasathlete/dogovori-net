/**
 * useAudience — чете/записва избрания сегмент ("Фирма" / "Фрийлансър").
 *
 * Персистира в localStorage и синхронизира всички компоненти на страницата
 * чрез custom event + `storage` event между табовете.
 */
import { useCallback, useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import {
  AUDIENCE_COPY,
  AUDIENCE_EVENT,
  AUDIENCE_STORAGE_KEY,
  DEFAULT_AUDIENCE,
  hasChosenAudience,
  readAudience,
  writeAudience,
  type Audience,
  type AudienceCopy,
} from "@/lib/audience";

export interface UseAudienceResult {
  audience: Audience;
  copy: AudienceCopy;
  chosen: boolean;
  setAudience: (value: Audience) => void;
}

export function useAudience(): UseAudienceResult {
  const [audience, setAudienceState] = useState<Audience>(DEFAULT_AUDIENCE);
  const [chosen, setChosen] = useState(false);

  useEffect(() => {
    const sync = () => {
      setAudienceState(readAudience());
      setChosen(hasChosenAudience());
    };
    sync();
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === AUDIENCE_STORAGE_KEY) sync();
    };
    window.addEventListener(AUDIENCE_EVENT, sync as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AUDIENCE_EVENT, sync as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setAudience = useCallback((value: Audience) => {
    writeAudience(value);
    setAudienceState(value);
    setChosen(true);
    trackEvent("audience_selected", { audience: value });
  }, []);

  return { audience, copy: AUDIENCE_COPY[audience], chosen, setAudience };
}
