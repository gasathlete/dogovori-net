// Edge function: справка на фирма по ЕИК през публичния OpenData портал на ТР
// Връща базови данни за фирмата (наименование, адрес, МОЛ) ако се намерят.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface CompanyInfo {
  eik: string;
  name?: string;
  vat_number?: string;
  address?: string;
  mol?: string;
  status?: string;
  source?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { eik } = await req.json().catch(() => ({}));
    if (!eik || typeof eik !== "string" || !/^\d{9}(\d{4})?$/.test(eik)) {
      return new Response(JSON.stringify({ error: "Невалиден ЕИК (трябва да е 9 или 13 цифри)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Опит през papagal.bg публичен HTML (best-effort scrape)
    const result: CompanyInfo = { eik, source: "papagal" };
    try {
      const resp = await fetch(`https://papagal.bg/firma/${eik}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; DogovoriBot/1.0)" },
      });
      if (resp.ok) {
        const html = await resp.text();
        const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        if (nameMatch) result.name = nameMatch[1].trim();
        const addrMatch = html.match(/Седалище[^:]*:\s*<\/[^>]+>\s*<[^>]+>([^<]+)/i)
          || html.match(/Адрес[^:]*:\s*<\/[^>]+>\s*<[^>]+>([^<]+)/i);
        if (addrMatch) result.address = addrMatch[1].trim();
        const molMatch = html.match(/Управител[^:]*:\s*<\/[^>]+>\s*<[^>]+>([^<]+)/i);
        if (molMatch) result.mol = molMatch[1].trim();
        if (eik.length === 9) result.vat_number = `BG${eik}`;
      }
    } catch (_) { /* best-effort */ }

    if (!result.name) {
      return new Response(JSON.stringify({
        ok: false,
        eik,
        error: "Не успяхме да намерим автоматично данни. Моля, попълнете ръчно.",
        suggested: { eik, vat_number: eik.length === 9 ? `BG${eik}` : undefined },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
