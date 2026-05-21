// Admin redaction endpoint — accepts a JSON payload (contract/blank/article)
// and returns the same shape with PII masked. Staff-only.
//
// Used by Admin moderation UIs to fulfill т.6 (само метаданни и анонимизирано
// съдържание се показват на модератор).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_RE = /\b[\w.+\-]+@[\w-]+\.[\w.-]+\b/gi;
const PHONE_RE = /(?:\+?359|0)\s*[\d\s\-()]{7,15}/g;
const EGN_RE = /\b\d{10}\b/g;
const EIK_RE = /\b\d{9}(?:\d{4})?\b/g;
const IBAN_RE = /\bBG\d{2}[A-Z]{4}\d{14,20}\b/gi;
const FULLNAME_RE =
  /\b([А-ЯA-Z][а-яa-z]{1,20})\s+([А-ЯA-Z][а-яa-z]{1,20})(?:\s+([А-ЯA-Z][а-яa-z]{1,20}))?\b/g;
const STOPWORDS = new Set([
  "Република","България","София","Пловдив","Варна","Бургас","Русе","Стара","Загора",
  "Чл","Член","Алинея","Точка","Глава","Раздел",
  "Договор","Страна","Страните","Възложител","Изпълнител","Купувач","Продавач",
  "Наемател","Наемодател","Закон","Кодекс","Регламент","Директива",
  "Настоящият","Настоящата","Настоящото",
]);

function anonymize(text: string): string {
  if (!text) return text;
  let out = text
    .replace(EMAIL_RE, "[EMAIL]")
    .replace(IBAN_RE, "[IBAN]")
    .replace(PHONE_RE, "[ТЕЛ]")
    .replace(EGN_RE, "[ЕГН]")
    .replace(EIK_RE, "[ЕИК]");
  out = out.replace(FULLNAME_RE, (m, a: string, b: string, c?: string) => {
    if (STOPWORDS.has(a) || STOPWORDS.has(b) || (c && STOPWORDS.has(c))) return m;
    return "[ИМЕ]";
  });
  return out;
}

function walk<T>(v: T): T {
  if (v == null) return v;
  if (typeof v === "string") return anonymize(v) as unknown as T;
  if (Array.isArray(v)) return v.map(walk) as unknown as T;
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = walk(val);
    }
    return out as T;
  }
  return v;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = u?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: staff } = await admin.rpc("is_staff", { _user_id: userId });
    if (!staff) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { payload } = await req.json();
    if (!payload) {
      return new Response(JSON.stringify({ error: "missing payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const redacted = walk(payload);

    return new Response(JSON.stringify({ redacted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("admin-redact-payload error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
