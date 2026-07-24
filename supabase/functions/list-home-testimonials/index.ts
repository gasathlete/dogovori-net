// Public edge function: returns approved homepage testimonials with signed
// URLs for the review photos so anonymous visitors can render them from the
// private `home-testimonials` bucket.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "home-testimonials";
// Signed URLs are short-lived enough to rotate often, long enough for HTTP
// caches to be useful.
const SIGNED_URL_TTL_SEC = 60 * 60 * 24; // 24 hours

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: rows, error } = await admin
      .from("home_testimonials")
      .select("id,name,role,quote,rating,photo_url,position,created_at")
      .eq("is_approved", true)
      .order("position", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(24);

    if (error) throw error;

    const items = await Promise.all(
      (rows ?? []).map(async (r) => {
        let url = r.photo_url;
        // photo_url stores the storage key (e.g. `<uid>/<uuid>.jpg`).
        // If it's already a full URL (admin-added external image), pass it through.
        if (!/^https?:\/\//i.test(url)) {
          const { data } = await admin.storage
            .from(BUCKET)
            .createSignedUrl(url, SIGNED_URL_TTL_SEC);
          url = data?.signedUrl ?? "";
        }
        return { ...r, photo_url: url };
      }),
    );

    return new Response(JSON.stringify({ items }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        // Allow the CDN / browser to cache the list briefly; signed URLs are
        // valid for 24h so a few minutes of caching is safe.
        "Cache-Control": "public, max-age=120, s-maxage=300",
      },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
