// Lightweight Sentry init — activates only if VITE_SENTRY_DSN is set.
// Loaded async so the bundle stays small when Sentry is disabled.

let started = false;

export async function initSentry() {
  if (started || typeof window === "undefined") return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0.1,
      environment: import.meta.env.MODE,
      // Strip personal data from breadcrumbs
      beforeSend(event) {
        if (event.user) {
          // Anonymize: keep only id, drop email/IP
          event.user = { id: event.user.id };
        }
        return event;
      },
    });
    started = true;
  } catch (e) {
    // Sentry not installed — silently ignore
    console.warn("[sentry] not initialized:", (e as Error).message);
  }
}
