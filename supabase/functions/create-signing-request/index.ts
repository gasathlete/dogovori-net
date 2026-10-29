// Create a multi-party signing envelope.
// Auth: requires Bearer JWT from owner. Pro plan required.
import { DTRUST_EVIDENCE_VERSION, documentDigest } from "../_shared/signing-evidence.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";
import { sendAppEmail } from "../_shared/transactional-email-templates/send-and-log.ts";

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

    // Pro guard — free users get exactly ONE free online-signing export.
    const { data: q } = await admin.from("download_quota")
      .select("plan, pro_until, free_signing_used").eq("user_id", userId).maybeSingle();
    const isPro = !!q && (q.plan === "pro" || (!!q.pro_until && new Date(q.pro_until) > new Date()));
    const freeAvailable = !!q && q.free_signing_used === false;
    let consumedFreeSigning = false;
    if (!isPro) {
      if (!freeAvailable) {
        return new Response(JSON.stringify({ error: "pro_required" }), {
          status: 403, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      consumedFreeSigning = true;
    }

    // Свързаните документи трябва да са на заявителя (без чужди id).
    if (saved_document_id) {
      const { data: sd } = await admin.from("saved_documents").select("user_id").eq("id", saved_document_id).maybeSingle();
      if (!sd || sd.user_id !== userId) {
        return new Response(JSON.stringify({ error: "document_not_found" }), {
          status: 404, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }
    if (uploaded_contract_id) {
      const { data: uc } = await admin.from("uploaded_contracts").select("user_id").eq("id", uploaded_contract_id).maybeSingle();
      if (!uc || uc.user_id !== userId) {
        return new Response(JSON.stringify({ error: "document_not_found" }), {
          status: 404, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }
    if (order_mode !== "parallel" && order_mode !== "sequential") {
      return new Response(JSON.stringify({ error: "invalid_input" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const cleanTitle = title.trim().slice(0, 240);
    // Заключване на точната версия ПРЕДИ първия подпис.
    const documentSha256 = await documentDigest(cleanTitle, document_snapshot);

    const days = Math.min(Math.max(Number(expires_in_days) || 14, 1), 60);
    const expiresAt = new Date(Date.now() + days * 86400_000).toISOString();

    // Daily invitation cap per owner: limits unsolicited email abuse.
    const DAILY_SIGNER_LIMIT = 50;
    const since = new Date(Date.now() - 86400_000).toISOString();
    const { data: recentReqs } = await admin.from("signing_requests")
      .select("id").eq("owner_id", userId).gte("created_at", since);
    const recentIds = (recentReqs ?? []).map((r: { id: string }) => r.id);
    let recentSigners = 0;
    if (recentIds.length > 0) {
      const { count } = await admin.from("signing_request_signers")
        .select("id", { count: "exact", head: true }).in("request_id", recentIds);
      recentSigners = count ?? 0;
    }
    if (recentSigners + signers.length > DAILY_SIGNER_LIMIT) {
      return new Response(JSON.stringify({ error: "daily_invite_limit", message: "Достигнахте дневния лимит за покани за подпис. Опитайте отново утре." }), {
        status: 429, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: env, error: envErr } = await admin.from("signing_requests").insert({
      owner_id: userId,
      team_id: team_id || null,
      saved_document_id: saved_document_id || null,
      uploaded_contract_id: uploaded_contract_id || null,
      title: cleanTitle,
      document_snapshot,
      metadata: { evidence_version: DTRUST_EVIDENCE_VERSION, document_sha256: documentSha256 },
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
      metadata: { signer_count: createdSigners.length, order_mode, document_sha256: documentSha256 },
      ip_hash: await hashIp(clientIp(req)),
      user_agent: req.headers.get("user-agent") ?? null,
    });

    // Mark the free online-signing export as used (only after the envelope
    // and signers were created successfully).
    if (consumedFreeSigning) {
      await admin.from("download_quota")
        .update({ free_signing_used: true })
        .eq("user_id", userId);
    }

    // Owner display name for invitation
    const { data: ownerProfile } = await admin.from("profiles")
      .select("display_name").eq("id", userId).maybeSingle();
    const ownerName = (ownerProfile as any)?.display_name || u.user.email || "";

    const appBase = (Deno.env.get("APP_BASE_URL") || "https://dogovori.net").replace(/\/+$/, "");
    // Send invitations: all signers if parallel, else only first in sequential mode.
    const toNotify = order_mode === "sequential"
      ? createdSigners.slice().sort((a: any, b: any) => a.order_idx - b.order_idx).slice(0, 1)
      : createdSigners;

    await Promise.allSettled(toNotify.map((s: any) =>
      sendAppEmail(admin, "signing-invitation", s.email, {
        idempotencyKey: `signing-invite-${s.id}`,
        templateData: {
          signerName: s.name,
          documentTitle: env.title,
          signUrl: `${appBase}/sign/${s.sign_token}`,
          ownerName,
          expiresAt: env.expires_at,
          role: s.role,
        },
      })
    ));

    return new Response(JSON.stringify({
      ok: true,
      request: env,
      signers: createdSigners,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("edge function error", e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
