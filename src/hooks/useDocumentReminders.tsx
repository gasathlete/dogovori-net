import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type DocumentReminder = {
  id: string;
  user_id: string;
  saved_document_id: string | null;
  uploaded_contract_id: string | null;
  remind_at: string;
  kind: "expiration" | "renewal" | "custom";
  note: string | null;
  done_at: string | null;
  created_at: string;
};

export function useDocumentReminders() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<DocumentReminder[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setReminders([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("document_reminders")
      .select("*")
      .eq("user_id", user.id)
      .order("remind_at", { ascending: true });
    setLoading(false);
    if (!error) setReminders((data ?? []) as DocumentReminder[]);
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { reminders, loading, reload };
}

export function reminderStatus(r: DocumentReminder): {
  label: string;
  cls: string;
  daysLeft: number;
} {
  const now = Date.now();
  const ts = new Date(r.remind_at).getTime();
  const daysLeft = Math.ceil((ts - now) / 86400000);
  if (r.done_at) {
    return { label: "Изпълнено", cls: "border-border/40 text-muted-foreground", daysLeft };
  }
  if (daysLeft < 0) {
    return {
      label: `Просрочено с ${Math.abs(daysLeft)} д.`,
      cls: "border-red-400/40 bg-red-400/10 text-red-300",
      daysLeft,
    };
  }
  if (daysLeft === 0) {
    return { label: "Днес", cls: "border-amber-300/50 bg-amber-300/10 text-amber-200", daysLeft };
  }
  if (daysLeft <= 7) {
    return {
      label: `След ${daysLeft} д.`,
      cls: "border-amber-300/40 bg-amber-300/10 text-amber-200",
      daysLeft,
    };
  }
  return {
    label: `След ${daysLeft} д.`,
    cls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
    daysLeft,
  };
}

export const REMINDER_KIND_LABEL: Record<DocumentReminder["kind"], string> = {
  expiration: "Изтичане на срока",
  renewal: "Подновяване",
  custom: "Друго",
};
