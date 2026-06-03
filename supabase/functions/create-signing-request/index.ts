// Create a multi-party signing envelope.
// Auth: requires Bearer JWT from owner. Pro plan required.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";

function token(n = 32) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface SignerInput {
  name: string;
  email: string;
  role?: string;
}

serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: u } = await admin.auth.getUser(authHeader.slice(7));
    if (!u?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const userId = u.user.id;

    const body = await req.json().catch(() => ({}));
    const {
      saved_document_id, uploaded_contract_id, title,
      document_snapshot, signers, order_mode = "parallel",
      expires_in_days = 14, team_id = null,
    } = body as {
      saved_document_id?: string | null;
      uploaded_contract_id?: string | null;
      title?: string;
      document_snapshot?: unknown;
      signers?: SignerInput[];
      order_mode?: "sequential" | "parallel";
      expires_in_days?: number;
      team_id?: string | null;
    };

    if (!title?.trim() || !document_snapshot || !Array.isArray(signers) || signers.length === 0) {
      return new Response(JSON.stringify({ error: "invalid_input" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (signers.length > 12) {
      return new Response(JSON.stringify({ error: "too_many_signers" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const cleanSigners: SignerInput[] = [];
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const s of signers) {
      const name = (s.name ?? "").toString().trim().slice(0, 120);
      const email = (s.email ?? "").toString().trim().toLowerCase().slice(0, 200);
      const role = (s.role ?? "").toString().trim().slice(0, 80) || null;
      if (!name || !email || !emailRe.test(email)) {
        return new Response(JSON.stringify({ error: "invalid_signer" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      cleanSigners.push({ name, email, role: role ?? undefined });
    }

    // Pro guard (consistent with create-share-link)
    const { data: q } = await admin.from("download_quota")
      .select("plan, pro_until").eq("user_id", userId).maybeSingle();
    const isPro = !!q && (q.plan === "pro" || (!!q.pro_until && new Date(q.pro_until) > new Date()));
    if (!isPro) {
      return new Response(JSON.stringify({ error: "pro_required" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const days = Math.min(Math.max(Number(expires_in_days) || 14, 1), 60);
    const expiresAt = new Date(Date.now() + days * 86400_000).toISOString();

    const { data: env, error: envErr } = await admin.from("signing_requests").insert({
      owner_id: userId,
      team_id: team_id || null,
      saved_document_id: saved_document_id || null,
      uploaded_contract_id: uploaded_contract_id || null,
      title: title.trim().slice(0, 240),
      document_snapshot,
      order_mode,
      expires_at: expiresAt,
      status: "pending",
    }).select().single();
    if (envErr || !env) {
      return new Response(JSON.stringify({ error: envErr?.message ?? "create_failed" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const signerRows = cleanSigners.map((s, i) => ({
      request_id: env.id,
      name: s.name,
      email: s.email,
      role: s.role ?? null,
      order_idx: i,
      sign_token: token(),
    }));
    const { data: createdSigners, error: sErr } = await admin
      .from("signing_request_signers").insert(signerRows).select();
    if (sErr) {
      await admin.from("signing_requests").delete().eq("id", env.id);
      return new Response(JSON.stringify({ error: sErr.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    await admin.from("signing_audit_events").insert({
      request_id: env.id,
      event_type: "envelope_created",
      metadata: { signer_count: createdSigners.length, order_mode },
      ip_hash: await hashIp(clientIp(req)),
      user_agent: req.headers.get("user-agent") ?? null,
    });

    return new Response(JSON.stringify({
      ok: true,
      request: env,
      signers: createdSigners,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
