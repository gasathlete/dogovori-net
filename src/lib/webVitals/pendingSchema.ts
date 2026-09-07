/**
 * Типове за ПОДГОТВЕНАТА (още неприложена) схема на полевите Web Vitals.
 *
 * `src/integrations/supabase/types.ts` се генерира от реалната база и се
 * презаписва автоматично — ръчни допълнения там не се задържат, докато
 * миграцията `supabase/migrations/20260907110000_web_vitals_daily_aggregate.sql`
 * не бъде приложена. Затова тук държим единственото описание на новата таблица
 * и RPC-то и разширяваме генерирания `Database` тип, за да са напълно
 * типизирани `.from("web_vitals_daily")` и `.rpc("record_web_vital_aggregate")`
 * (без `any`, без нетипизирани кастове на резултата).
 *
 * След прилагане на миграцията генерираните типове поемат ролята на този файл
 * и той може да бъде премахнат заедно с `webVitalsClient`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/** Точното огледало на `public.web_vitals_daily` от миграцията. */
export type WebVitalsDailyRow = {
  created_at: string;
  day: string;
  device_class: string;
  metric: string;
  navigation_type: string;
  rating: string;
  route_group: string;
  sample_count: number;
  updated_at: string;
  value_max: number;
  value_min: number;
  value_sum: number;
};

/** Колоните с DEFAULT са опционални при вмъкване. */
export type WebVitalsDailyInsert = Pick<
  WebVitalsDailyRow,
  "device_class" | "metric" | "navigation_type" | "rating" | "route_group"
> &
  Partial<
    Pick<
      WebVitalsDailyRow,
      "created_at" | "day" | "sample_count" | "updated_at" | "value_max" | "value_min" | "value_sum"
    >
  >;

export type WebVitalsDailyUpdate = Partial<WebVitalsDailyRow>;

/** Аргументите на `public.record_web_vital_aggregate` — само груби измерения. */
export type RecordWebVitalAggregateArgs = {
  _device_class: string;
  _metric: string;
  _navigation_type: string;
  _rating: string;
  _route_group: string;
  _value: number;
};

/** Генерираният `Database` тип плюс подготвената таблица и RPC. */
export type PendingDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      web_vitals_daily: {
        Row: WebVitalsDailyRow;
        Insert: WebVitalsDailyInsert;
        Update: WebVitalsDailyUpdate;
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      record_web_vital_aggregate: {
        Args: RecordWebVitalAggregateArgs;
        Returns: undefined;
      };
    };
  };
};

/**
 * Същият клиент (една инстанция, един auth стейт), но типизиран със схемата,
 * която включва подготвената таблица и RPC.
 */
export const webVitalsClient = supabase as unknown as SupabaseClient<PendingDatabase>;
