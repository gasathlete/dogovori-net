// Session-scoped AI disclaimer gate.
// Any code that initiates a download of an AI-generated document should call
// `ensureAIDisclaimerAccepted()` and await it before proceeding. The user
// confirms the disclaimer ONCE per browser session; subsequent downloads in
// the same session resolve immediately.
//
// The global <AIDisclaimerModal /> mounted in App.tsx listens for the
// "ai-disclaimer:request" event, shows the modal, and dispatches
// "ai-disclaimer:resolved" with the user's choice when they click
// accept or close.

const SESSION_KEY = "ai-disclaimer-session-accepted";

export function hasAIDisclaimerSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAIDisclaimerSession() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Resolves when the user has accepted the disclaimer for this session.
 * Rejects with {cancelled:true} if the user dismisses the modal without
 * accepting — callers should treat that as a soft cancel (no toast/error).
 */
export function ensureAIDisclaimerAccepted(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (hasAIDisclaimerSession()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const onResolved = (e: Event) => {
      window.removeEventListener("ai-disclaimer:resolved", onResolved);
      const accepted = (e as CustomEvent<{ accepted: boolean }>).detail?.accepted;
      if (accepted) {
        setAIDisclaimerSession();
        resolve();
      } else {
        reject({ cancelled: true });
      }
    };
    window.addEventListener("ai-disclaimer:resolved", onResolved);
    // Buffered dispatch — the AIDisclaimerModal drains the buffer on mount,
    // so a click that fires before the modal chunk has loaded still opens
    // the dialog instead of being lost.
    import("@/lib/bufferedEvents").then(({ dispatchBuffered }) =>
      dispatchBuffered("ai-disclaimer:request"),
    );
  });
}
