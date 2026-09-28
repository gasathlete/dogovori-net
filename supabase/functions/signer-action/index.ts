// Public endpoint for signer actions: send_otp, verify_otp, sign, decline.
// Identified by sign_token only.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";
import { sendAppEmail } from "../_shared/transactional-email-templates/send-and-log.ts";

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function otp6(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const { token, action } = body as { token?: string; action?: string };
    if (!token || !action) {
      return new Response(JSON.stringify({ error: "invalid_input" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: signer } = await admin.from("signing_request_signers")
      .select("*").eq("sign_token", token).maybeSingle();
    if (!signer) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { data: env } = await admin.from("signing_requests")
      .select("*").eq("id", signer.request_id).maybeSingle();
    if (!env) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (env.status === "cancelled" || env.status === "completed" || env.status === "expired") {
      return new Response(JSON.stringify({ error: "envelope_" + env.status }), {
        status: 409, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (new Date(env.expires_at) < new Date()) {
      await admin.from("signing_requests").update({ status: "expired" }).eq("id", env.id);
      return new Response(JSON.stringify({ error: "expired" }), {
        status: 410, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (signer.status === "signed" || signer.status === "declined") {
      return new Response(JSON.stringify({ error: "already_" + signer.status }), {
        status: 409, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Sequential gate
    if (env.order_mode === "sequential") {
      const { data: peers } = await admin.from("signing_request_signers")
        .select("order_idx, status").eq("request_id", env.id).order("order_idx");
      const prior = (peers ?? []).filter((p) => p.order_idx < signer.order_idx);
      if (!prior.every((p) => p.status === "signed")) {
        return new Response(JSON.stringify({ error: "not_your_turn" }), {
          status: 409, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    const ipHash = await hashIp(clientIp(req));
    const ua = req.headers.get("user-agent") ?? null;
    const now = new Date().toISOString();

    if (action === "send_otp") {
      const code = otp6();
      const hash = await sha256(code + "|" + signer.id);
      const exp = new Date(Date.now() + 10 * 60_000).toISOString();
      await admin.from("signing_request_signers").update({
        otp_code_hash: hash, otp_expires_at: exp, otp_attempts: 0,
        status: signer.status === "pending" || signer.status === "viewed" ? "otp_sent" : signer.status,
      }).eq("id", signer.id);
      await admin.from("signing_audit_events").insert({
        request_id: env.id, signer_id: signer.id, event_type: "otp_sent",
        ip_hash: ipHash, user_agent: ua, metadata: { email: signer.email },
      });
      // Send OTP email (best-effort)
      sendAppEmail(admin, "signing-otp", signer.email, {
        idempotencyKey: `signing-otp-${signer.id}-${Date.now()}`,
        templateData: { code, documentTitle: env.title },
      }).catch(() => {});
      const debugCode = Deno.env.get("SIGNING_DEBUG_OTP") === "1" ? code : undefined;
      return new Response(JSON.stringify({ ok: true, expires_at: exp, debug_code: debugCode }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (action === "verify_otp") {
      const { code } = body as { code?: string };
      if (!code || !signer.otp_code_hash || !signer.otp_expires_at) {
        return new Response(JSON.stringify({ error: "no_otp" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (new Date(signer.otp_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "otp_expired" }), {
          status: 410, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if ((signer.otp_attempts ?? 0) >= 5) {
        return new Response(JSON.stringify({ error: "too_many_attempts" }), {
          status: 429, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const hash = await sha256(String(code) + "|" + signer.id);
      if (hash !== signer.otp_code_hash) {
        await admin.from("signing_request_signers")
          .update({ otp_attempts: (signer.otp_attempts ?? 0) + 1 }).eq("id", signer.id);
        return new Response(JSON.stringify({ error: "otp_mismatch" }), {
          status: 401, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      await admin.from("signing_audit_events").insert({
        request_id: env.id, signer_id: signer.id, event_type: "otp_verified",
        ip_hash: ipHash, user_agent: ua,
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (action === "sign") {
      const {
        signature_data_url, signer_name, otp_code,
        ses_equivalence_accepted,
        signs_as_legal_entity,
        eik,
        signer_capacity,
        representative_declaration_accepted,
        signature_method,
        qes_file_base64,
        qes_file_name,
        qes_file_mime,
      } = body as {
        signature_data_url?: string; signer_name?: string; otp_code?: string;
        ses_equivalence_accepted?: boolean;
        signs_as_legal_entity?: boolean;
        eik?: string | null;
        signer_capacity?: string | null;
        representative_declaration_accepted?: boolean;
        signature_method?: "drawn" | "uploaded" | "qes";
        qes_file_base64?: string;
        qes_file_name?: string;
        qes_file_mime?: string;
      };
      const method: "drawn" | "uploaded" | "qes" =
        signature_method === "uploaded" || signature_method === "qes" ? signature_method : "drawn";

      const SIG_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
      if (!signer_name?.trim()) {
        return new Response(JSON.stringify({ error: "invalid_signature" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (!signature_data_url || !SIG_RE.test(signature_data_url)) {
        return new Response(JSON.stringify({ error: "invalid_signature" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (signature_data_url.length > 1_500_000) {
        return new Response(JSON.stringify({ error: "signature_too_large" }), {
          status: 413, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (!ses_equivalence_accepted) {
        return new Response(JSON.stringify({ error: "ses_consent_required" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const cleanEik = signs_as_legal_entity ? String(eik ?? "").trim() : "";
      if (signs_as_legal_entity) {
        if (!/^\d{9}(\d{4})?$/.test(cleanEik)) {
          return new Response(JSON.stringify({ error: "invalid_eik" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        if (!signer_capacity || !representative_declaration_accepted) {
          return new Response(JSON.stringify({ error: "entity_fields_required" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
      }

      // OTP се проверява ПРЕДИ всяка работа с хранилището и с общия лимит от
      // 5 опита (иначе стъпката „sign“ позволява неограничено налучкване).
      if (!signer.otp_code_hash || !signer.otp_expires_at) {
        return new Response(JSON.stringify({ error: "otp_required" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if ((signer.otp_attempts ?? 0) >= 5) {
        return new Response(JSON.stringify({ error: "otp_locked" }), {
          status: 429, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (new Date(signer.otp_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "otp_invalid" }), {
          status: 401, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const otpHash = await sha256(String(otp_code ?? "") + "|" + signer.id);
      if (otpHash !== signer.otp_code_hash) {
        await admin.from("signing_request_signers")
          .update({ otp_attempts: (signer.otp_attempts ?? 0) + 1 }).eq("id", signer.id);
        return new Response(JSON.stringify({ error: "otp_invalid" }), {
          status: 401, headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // QES upload — validate & store the qualified signature file (server-side)
      let qesPath: string | null = null;
      let qesSize: number | null = null;
      let qesCleanName: string | null = null;
      let qesCleanMime: string | null = null;
      if (method === "qes") {
        if (!qes_file_base64 || !qes_file_name) {
          return new Response(JSON.stringify({ error: "qes_file_required" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        const ALLOWED_EXT = /\.(pdf|p7s|p7m|asice|asics|sce|scs|xml)$/i;
        if (!ALLOWED_EXT.test(qes_file_name)) {
          return new Response(JSON.stringify({ error: "qes_file_type" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        let bytes: Uint8Array;
        try {
          const bin = atob(qes_file_base64);
          bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        } catch {
          return new Response(JSON.stringify({ error: "qes_file_invalid" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        if (bytes.byteLength > 15 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: "qes_file_too_large" }), {
            status: 413, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        qesCleanName = qes_file_name.replace(/[^\w.\-]+/g, "_").slice(0, 160);
        qesCleanMime = (qes_file_mime ?? "application/octet-stream").slice(0, 100);
        qesSize = bytes.byteLength;
        const objectPath = `${env.id}/${signer.id}/${Date.now()}_${qesCleanName}`;
        const up = await admin.storage.from("qes-signatures").upload(objectPath, bytes, {
          contentType: qesCleanMime, upsert: false,
        });
        if (up.error) {
          return new Response(JSON.stringify({ error: "qes_upload_failed" }), {
            status: 500, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        qesPath = objectPath;
      }

      const cleanName = signer_name.trim().slice(0, 120);
      await admin.from("signing_request_signers").update({
        status: "signed",
        signed_at: now,
        signature_data_url,
        signature_name: cleanName,
        signature_method: method,
        qes_file_path: qesPath,
        qes_file_name: qesCleanName,
        qes_file_size: qesSize,
        qes_file_mime: qesCleanMime,
        signer_ip_hash: ipHash,
        signer_user_agent: ua,
        ses_equivalence_accepted: true,
        ses_equivalence_text_version: "2026-06-10",
        signer_eik: signs_as_legal_entity ? cleanEik : null,
        signer_capacity: signs_as_legal_entity ? String(signer_capacity).slice(0, 60) : null,
        representative_declaration: signs_as_legal_entity
          ? !!representative_declaration_accepted : false,
        otp_code_hash: null, otp_expires_at: null,
      }).eq("id", signer.id);

      await admin.from("signing_audit_events").insert({
        request_id: env.id, signer_id: signer.id, event_type: "signed",
        ip_hash: ipHash, user_agent: ua,
        metadata: { signer_name: cleanName, signature_method: method, qes_file_name: qesCleanName },
      });


      // Update envelope status
      const { data: allSigners } = await admin.from("signing_request_signers")
        .select("id, name, email, role, order_idx, status, sign_token")
        .eq("request_id", env.id).order("order_idx");
      const remaining = (allSigners ?? []).filter((s) => s.status !== "signed");
      const declined = (allSigners ?? []).some((s) => s.status === "declined");
      let newStatus: string = env.status;
      if (declined) newStatus = "declined";
      else if (remaining.length === 0) newStatus = "completed";
      else newStatus = "in_progress";
      const updates: Record<string, unknown> = { status: newStatus };
      if (newStatus === "completed") updates.completed_at = now;
      await admin.from("signing_requests").update(updates).eq("id", env.id);

      const appBase = (Deno.env.get("APP_BASE_URL") || "https://dogovori.net").replace(/\/+$/, "");

      if (newStatus === "completed") {
        await admin.from("signing_audit_events").insert({
          request_id: env.id, event_type: "envelope_completed",
        });
        // Notify owner
        const { data: ownerAuth } = await admin.auth.admin.getUserById(env.owner_id);
        const ownerEmail = ownerAuth?.user?.email;
        const { data: ownerProfile } = await admin.from("profiles")
          .select("display_name").eq("id", env.owner_id).maybeSingle();
        const ownerName = (ownerProfile as any)?.display_name || "";
        if (ownerEmail) {
          sendAppEmail(admin, "signing-completed", ownerEmail, {
            idempotencyKey: `signing-complete-owner-${env.id}`,
            templateData: {
              documentTitle: env.title,
              envelopeUrl: `${appBase}/signing/${env.id}`,
              signerCount: (allSigners ?? []).length,
              recipientRole: "owner",
              recipientName: ownerName,
            },
          }).catch(() => {});
        }
        // Notify each signer
        for (const s of (allSigners ?? [])) {
          sendAppEmail(admin, "signing-completed", s.email, {
            idempotencyKey: `signing-complete-signer-${s.id}`,
            templateData: {
              documentTitle: env.title,
              envelopeUrl: `${appBase}/sign/${s.sign_token}`,
              signerCount: (allSigners ?? []).length,
              recipientRole: "signer",
              recipientName: s.name,
            },
          }).catch(() => {});
        }
      } else if (env.order_mode === "sequential") {
        // Notify next signer
        const next = (allSigners ?? []).find((s) => s.status !== "signed" && s.status !== "declined");
        if (next) {
          sendAppEmail(admin, "signing-invitation", next.email, {
            idempotencyKey: `signing-invite-${next.id}`,
            templateData: {
              signerName: next.name,
              documentTitle: env.title,
              signUrl: `${appBase}/sign/${next.sign_token}`,
              expiresAt: env.expires_at,
              role: next.role,
            },
          }).catch(() => {});

        }
      }

      return new Response(JSON.stringify({ ok: true, envelope_status: newStatus }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (action === "decline") {
      const { reason } = body as { reason?: string };
      const cleanReason = (reason ?? "").toString().trim().slice(0, 500);
      await admin.from("signing_request_signers").update({
        status: "declined", declined_at: now, decline_reason: cleanReason || null,
        signer_ip_hash: ipHash, signer_user_agent: ua,
      }).eq("id", signer.id);
      await admin.from("signing_requests").update({ status: "declined" }).eq("id", env.id);
      await admin.from("signing_audit_events").insert({
        request_id: env.id, signer_id: signer.id, event_type: "declined",
        ip_hash: ipHash, user_agent: ua, metadata: { reason: cleanReason },
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("edge function error", e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
