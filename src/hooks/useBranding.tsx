import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsPro } from "@/hooks/useIsPro";
import { sanitizeBranding } from "@/lib/branding/sanitize";
import { cloneDefaultBranding } from "@/lib/branding/defaults";
import type { BrandingSettings } from "@/lib/branding/types";

export interface BrandingState {
  /** Достъпът е отключен (Предприемач/Екип или еднократна покупка). */
  unlocked: boolean;
  /** Отключен заради плана, а не заради еднократно плащане. */
  includedInPlan: boolean;
  settings: BrandingSettings;
  profileId: string | null;
  loading: boolean;
  saving: boolean;
  save: (next: BrandingSettings) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useBranding(): BrandingState {
  const { user } = useAuth();
  const { isEntrepreneur, isTeam, loading: planLoading } = useIsPro();
  const [settings, setSettings] = useState<BrandingSettings>(() => cloneDefaultBranding());
  const [profileId, setProfileId] = useState<string | null>(null);
  const [purchased, setPurchased] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const includedInPlan = isEntrepreneur || isTeam;

  const refresh = useCallback(async () => {
    if (!user) {
      setSettings(cloneDefaultBranding());
      setProfileId(null);
      setPurchased(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: profile }, { data: unlock }] = await Promise.all([
      supabase
        .from("branding_profiles")
        .select("id, settings")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase.from("branding_unlocks").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);
    setProfileId(profile?.id ?? null);
    setSettings(sanitizeBranding(profile?.settings));
    setPurchased(Boolean(unlock));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (next: BrandingSettings) => {
      if (!user) return;
      setSaving(true);
      try {
        const clean = sanitizeBranding(next);
        if (profileId) {
          const { error } = await supabase
            .from("branding_profiles")
            .update({ settings: clean as unknown as never })
            .eq("id", profileId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from("branding_profiles")
            .insert({
              user_id: user.id,
              settings: clean as unknown as never,
              is_active: true,
            })
            .select("id")
            .single();
          if (error) throw error;
          setProfileId(data.id);
        }
        setSettings(clean);
      } finally {
        setSaving(false);
      }
    },
    [user, profileId],
  );

  return {
    unlocked: includedInPlan || purchased,
    includedInPlan,
    settings,
    profileId,
    loading: loading || planLoading,
    saving,
    save,
    refresh,
  };
}
