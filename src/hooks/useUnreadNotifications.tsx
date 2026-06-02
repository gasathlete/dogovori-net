import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns the count of unread notifications for the current user
 * (personal + broadcast). Updates live via realtime + on a window
 * focus/visibility change.
 */
export function useUnreadNotifications() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!user) {
      setCount(0);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("unread_notifications_count");
    setLoading(false);
    if (!error) setCount(Number(data ?? 0));
  };

  useEffect(() => {
    refresh();
    if (!user) return;

    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("notifications:refresh", onFocus as EventListener);

    const channel = supabase
      .channel(`notifications-unread-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notification_reads" },
        () => refresh(),
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("notifications:refresh", onFocus as EventListener);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { count, loading, refresh };
}
