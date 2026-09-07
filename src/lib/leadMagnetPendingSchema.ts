/**
 * Типов мост за ЧАКАЩАТА (неприложена) миграция
 * `supabase/migrations/20260907123000_lead_magnet_consent_hardening.sql`.
 *
 * `src/integrations/supabase/types.ts` се генерира от реалната база, затова още
 * не съдържа `subscribe_lead_magnet`, `consent_at` и `consent_version`. Този
 * файл е ЕДИНСТВЕНОТО място с каст и се изтрива при прилагане на миграцията,
 * след което типовете идват директно от генерирания клиент.
 */
import { supabase } from "@/integrations/supabase/client";

/** Точните аргументи на RPC-то, както са дефинирани в миграцията. */
export interface SubscribeLeadMagnetArgs {
  _email: string;
  _magnet_slug: string;
  _source_group: string;
  _marketing_consent: boolean;
}

/** Колоните, добавени от чакащата миграция. */
export interface LeadMagnetConsentColumns {
  consent_at: string | null;
  consent_version: string | null;
}

interface PendingLeadMagnetClient {
  rpc(
    fn: "subscribe_lead_magnet",
    args: SubscribeLeadMagnetArgs,
  ): PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
}

/** Каноничният клиент, стеснен само до чакащото RPC. */
export const pendingLeadMagnetClient = supabase as unknown as PendingLeadMagnetClient;
