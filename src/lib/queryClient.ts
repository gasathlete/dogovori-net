import { QueryClient } from "@tanstack/react-query";

/**
 * Singleton QueryClient. Historically instantiated inside App.tsx — extracted
 * so hooks that need imperative cache access (fetchQuery / invalidateQueries
 * outside a component tree) can share the exact same client.
 *
 * Defaults tuned for a mostly-read SaaS app under concurrent load:
 * - `staleTime: 60_000` — dedupe repeated calls (same user hitting the same
 *   `download_quota` row from 5+ mount points) within a 1-minute window.
 * - `refetchOnWindowFocus: false` — tab switching shouldn't trigger a wave
 *   of refetches for 50+ VUs.
 * - `retry: 1` — fail fast rather than amplifying an outage.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
