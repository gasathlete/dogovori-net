// Shared guard against generation/analysis of documents with illegal content.
// Deterministic keyword/phrase matching after aggressive normalization
// (lowercase, diacritics stripped, basic Cyrillic↔Latin transliteration,
// digit-substitution like "у6ийство"). Hits are logged to the neutral
// `restricted_processing_events` table — only minimal metadata, NO raw
// content excerpts, NO matched terms (per legal review).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// Пощата се зарежда ЛЕНИВО: така детекторът остава чист и може да се внася от
// пътища без мрежа (напр. проверката за допустимост преди плащане).
async function sendAppEmailLazy(
  admin: SupabaseClient,
  template: string,
  recipient: string,
  options: {
    idempotencyKey: string;
    templateData: Record<string, string>;
  },
): Promise<unknown> {
  const mod = await import("./transactional-email-templates/send-and-log.ts");
  const send = (mod as Record<string, unknown>).sendAppEmail as (
    ...a: unknown[]
  ) => Promise<unknown>;
  return await send(admin, template, recipient, options);
}

export type IllegalCategory =
  | "violence"
  | "sexual_minors"
  | "human_trafficking"
  | "drugs"
  | "weapons"
  | "fraud"
  | "terrorism";

interface CategoryDef {
  category: IllegalCategory;
  label: string;
  phrases: string[];
}

const CATEGORIES: CategoryDef[] = [
  {
    category: "violence",
    label: "Насилие срещу личността",
    phrases: [
      "убииство", "убии", "убиваи", "убием", "убият", "убиине",
      "поръчково убииство", "поръчителство за убииство",
      "ликвидираи", "ликвидация на лице", "ликвидация на човек",
      "екзекуция на", "екзекутираи",
      "отвличане", "отвлеки", "държане в плен", "държане като заложник",
      "побои", "побииване", "телесна повреда срещу",
      "заплаха за убииство", "заплаха със смърт", "заплаха с убииство",
      "хитман", "наемен убиец", "наемен убииец",
      "поръчка за убииство", "поръчам убииство",
      "kill contract", "murder contract", "hit man", "hitman contract",
    ],
  },
  {
    category: "sexual_minors",
    label: "Сексуална експлоатация / непълнолетни",
    phrases: [
      "детска порнография", "детско порно", "csam",
      "сексуални услуги с непълнолетен", "секс с непълнолетен",
      "сексуална експлоатация на дете", "експлоатация на непълнолетно",
      "проституция на непълнолетна", "проституция на непълнолетен",
      "child porn", "child pornography", "underage sex",
    ],
  },
  {
    category: "human_trafficking",
    label: "Трафик на хора / органи",
    phrases: [
      "трафик на хора", "трафик на жени", "трафик на деца",
      "продажба на човек", "купуване на човек", "купя човек",
      "продажба на дете", "купя дете", "продам дете",
      "трафик на органи", "продажба на органи", "купуване на органи",
      "купя бъбрек", "продам бъбрек", "продам черен дроб",
      "human trafficking", "organ trafficking",
    ],
  },
  {
    category: "drugs",
    label: "Наркотици и забранени вещества",
    phrases: [
      "разпространение на наркотици", "пласиране на наркотици",
      "продажба на кокаин", "продажба на хероин", "продажба на метамфетамин",
      "продажба на амфетамин", "продажба на марихуана", "продажба на канабис",
      "доставка на кокаин", "доставка на хероин",
      "наркотрафик", "трафик на наркотици",
      "drug dealing", "drug trafficking", "cocaine sale", "heroin sale",
    ],
  },
  {
    category: "weapons",
    label: "Незаконни оръжия и експлозиви",
    phrases: [
      "незаконна продажба на оръжие", "продажба на нелегално оръжие",
      "доставка на оръжие без разрешително", "контрабанда на оръжие",
      "незаконна търговия с оръжие",
      "изработка на бомба", "направа на бомба", "сглобяване на бомба",
      "изработка на експлозив", "направа на експлозив",
      "ied", "self-made explosive",
    ],
  },
  {
    category: "fraud",
    label: "Измама / пране на пари / подкуп",
    phrases: [
      "пране на пари", "изпиране на пари",
      "укриване на данъци чрез", "схема за укриване на данъци",
      "фалшива фактура за", "издаване на фалшиви фактури",
      "поръчков подкуп", "договор за подкуп",
      "корупционна схема", "схема за измама",
      "пирамидална схема", "понци схема",
      "money laundering", "bribery contract",
    ],
  },
  {
    category: "terrorism",
    label: "Тероризъм",
    phrases: [
      "терористичен акт", "тероризъм", "финансиране на тероризъм",
      "вербуване на терористи", "обучение на терористи",
      "atентат срещу", "атентат срещу",
      "terrorist attack", "terror financing",
    ],
  },
];

// --- Normalization ------------------------------------------------------

const LATIN_TO_CYR: Record<string, string> = {
  a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", z: "з", i: "и",
  k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", r: "р", s: "с",
  t: "т", u: "у", f: "ф", h: "х", c: "ц", y: "и", j: "й",
};

const LATIN_BIGRAMS: Array<[RegExp, string]> = [
  [/zh/g, "ж"], [/ch/g, "ч"], [/sh/g, "ш"], [/sht/g, "щ"],
  [/yu/g, "ю"], [/ya/g, "я"], [/ts/g, "ц"], [/kh/g, "х"],
];

const DIGIT_SUBS: Record<string, string> = {
  "0": "о", "1": "и", "3": "е", "4": "ч", "5": "с", "6": "б", "7": "т", "8": "в", "9": "д",
  "@": "а", "$": "с",
};

function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(input: string): string {
  let s = (input ?? "").toLowerCase();
  s = stripDiacritics(s);
  s = s.replace(/[0134567890@$]/g, (c) => DIGIT_SUBS[c] ?? c);
  for (const [re, rep] of LATIN_BIGRAMS) s = s.replace(re, rep);
  s = s.replace(/[a-z]/g, (c) => LATIN_TO_CYR[c] ?? c);
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export interface DetectionResult {
  blocked: boolean;
  category?: IllegalCategory;
  categoryLabel?: string;
  // Internal only — never persisted, never returned to client.
  _internalMatchedTerm?: string;
}

export function detectIllegalContent(text: string): DetectionResult {
  if (!text || text.length < 3) return { blocked: false };
  const norm = " " + normalize(text) + " ";
  for (const cat of CATEGORIES) {
    for (const phrase of cat.phrases) {
      if (norm.includes(" " + phrase + " ")) {
        return {
          blocked: true,
          category: cat.category,
          categoryLabel: cat.label,
          _internalMatchedTerm: phrase,
        };
      }
    }
  }
  return { blocked: false };
}

export const BLOCKED_USER_MESSAGE =
  "Това искане е блокирано. Платформата не генерира и не анализира документи с незаконно съдържание " +
  "(насилие, експлоатация на хора, наркотици, незаконни оръжия, измама, тероризъм). " +
  "Опитът е регистриран. " +
  "При повторни опити акаунтът може да бъде ограничен. " +
  "Ако смятате, че това е грешка — свържете се с екипа.";

interface GuardArgs {
  admin: SupabaseClient;
  text: string;
  functionName: string;
  userId: string | null;
  userEmail?: string | null;
  ipHash?: string | null;
  // user-agent is intentionally accepted but NOT persisted
  userAgent?: string | null;
  corsHeaders: Record<string, string>;
}

/**
 * Returns a ready-to-send 403 Response when the content is blocked,
 * or null when it is safe to proceed. Logs ONLY minimal metadata —
 * no raw text excerpt, no matched term (per legal review).
 */
export async function guardIllegalContent(args: GuardArgs): Promise<Response | null> {
  const { admin, text, functionName, userId, userEmail, ipHash, corsHeaders } = args;
  const result = detectIllegalContent(text);
  if (!result.blocked) return null;

  let eventId: string | null = null;
  try {
    const { data } = await admin
      .from("restricted_processing_events")
      .insert({
        user_id: userId,
        user_email: userEmail ?? null,
        ip_hash: ipHash ?? null,
        function_name: functionName,
        category: result.category!,
        event_type: "illegal_content_blocked",
        action: "blocked_before_model_call",
      })
      .select("id")
      .single();
    eventId = data?.id ?? null;
  } catch (e) {
    // Never log payload content in errors.
    console.error("[restricted-processing] insert failed:", (e as Error).message);
  }

  // Fire-and-forget admin alert email(s). Excerpt is NEVER sent.
  const sendAlerts = async () => {
    try {
      const { data: admins } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = (admins ?? []).map((r: { user_id: string }) => r.user_id);
      if (adminIds.length === 0) return;

      const recipients: string[] = [];
      for (const id of adminIds) {
        try {
          const { data: u } = await admin.auth.admin.getUserById(id);
          const email = u?.user?.email;
          if (email) recipients.push(email);
        } catch (e) {
          console.error("[restricted-processing] admin lookup failed:", (e as Error).message);
        }
      }

      for (const recipient of recipients) {
        try {
          await sendAppEmailLazy(admin, "illegal-content-alert", recipient, {
            idempotencyKey: `restricted-${eventId ?? crypto.randomUUID()}-${recipient}`,
            templateData: {
              category: result.categoryLabel,
              functionName,
              userEmail: userEmail ?? "(анонимен)",
              userId: userId ?? "—",
              createdAt: new Date().toISOString(),
            },
          });
        } catch (e) {
          console.error("[restricted-processing] email send failed:", (e as Error).message);
        }
      }
    } catch (e) {
      console.error("[restricted-processing] alert pipeline failed:", (e as Error).message);
    }
  };

  // @ts-ignore — EdgeRuntime is a Deno Deploy global, optional.
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(sendAlerts());
  } else {
    sendAlerts().catch((e) => console.error("[restricted-processing]", e.message));
  }

  return new Response(
    JSON.stringify({
      error: BLOCKED_USER_MESSAGE,
      code: "blocked_illegal_content",
      category: result.category,
      categoryLabel: result.categoryLabel,
    }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Log a special-category detection event (e.g., health/biometric data
 * detected in upload). These are NOT illegal — only restricted from
 * automated AI processing. No raw content is persisted.
 */
export async function logSpecialCategoryEvent(args: {
  admin: SupabaseClient;
  userId: string | null;
  userEmail?: string | null;
  functionName: string;
  categoryCode: "health_data" | "biometric" | "criminal" | "minors" | "political_religious" | "other";
  action?: string;
}): Promise<void> {
  const { admin, userId, userEmail, functionName, categoryCode, action } = args;
  try {
    await admin.from("restricted_processing_events").insert({
      user_id: userId,
      user_email: userEmail ?? null,
      function_name: functionName,
      category: categoryCode,
      event_type: "special_category_detected",
      action: action ?? "blocked_before_model_call",
    });
  } catch (e) {
    console.error("[restricted-processing] special-category insert failed:", (e as Error).message);
  }
}
