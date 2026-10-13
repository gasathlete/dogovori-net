// Public endpoint for signer actions: send_otp, verify_otp, sign, decline.
// Identified by sign_token only.
import { checkDocumentLock, nextEnvelopeStatus, safeEqualHex } from "../_shared/signing-evidence.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";
import { sendAppEmail } from "../_shared/transactional-email-templates/send-and-log.ts";

import {
  BodyTooLargeError, consumeAttemptAndVerify, hashOtpV2, OTP_DAILY_FAILURE_CAP, OTP_MAX_SENDS_PER_HOUR,
  OTP_RESEND_COOLDOWN_MS, OtpConfigError, otpSecret, readBoundedJson, SIGNER_BODY_MAX_BYTES,
  type AttemptStore,
} from "../_shared/signing-otp.ts";

function otp6(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    // Таван ПРЕДИ JSON/base64 декодиране (публичен, неавтентикиран вход).
    let body: unknown;
    try {
      body = await readBoundedJson(req, SIGNER_BODY_MAX_BYTES);
    } catch (e) {
      if (e instanceof BodyTooLargeError) {
        return new Response(JSON.stringify({ error: "payload_too_large" }), {
          status: 413, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      throw e;
    }
    const { token, action } = (body ?? {}) as { token?: string; action?: string };
    if (typeof token !== "string" || token.length < 16 || token.length > 200 || typeof action !== "string") {
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
    if (env.status === "cancelled" || env.status === "completed" || env.status === "expired" || env.status === "declined") {
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

    // DTrust Basic: точната версия е заключена с SHA-256 при създаване. Промяна
    // на съдържанието след това прави ВСИЧКИ покани невалидни (fail-closed).
    const lock = await checkDocumentLock(env);
    if (!lock.ok) {
      return new Response(JSON.stringify({ error: lock.code }), {
        status: 409, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const documentSha256 = lock.digest;

    const ipHash = await hashIp(clientIp(req));
    const ua = req.headers.get("user-agent") ?? null;
    const now = new Date().toISOString();

    const attemptStore: AttemptStore = {
      read: async () => {
        const { data } = await admin.from("signing_request_signers")
          .select("otp_attempts, otp_code_hash, otp_expires_at").eq("id", signer.id).maybeSingle();
        return data ?? { otp_attempts: null, otp_code_hash: null, otp_expires_at: null };
      },
      casAttempts: async (expected, expectedHash) => {
        let q = admin.from("signing_request_signers").update({ otp_attempts: expected + 1 })
          .eq("id", signer.id).eq("otp_code_hash", expectedHash);
        q = expected === 0 ? q.or("otp_attempts.is.null,otp_attempts.eq.0") : q.eq("otp_attempts", expected);
        const { data } = await q.select("id");
        return !!data && data.length === 1;
      },
    };
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    const recentEvents = async (type: string, since: string) => {
      const { count } = await admin.from("signing_audit_events").select("id", { count: "exact", head: true })
        .eq("signer_id", signer.id).eq("event_type", type).gte("created_at", since);
      return count ?? 0;
    };
    const otpFailure = async (result: string) => {
      await admin.from("signing_audit_events").insert({
        request_id: env.id, signer_id: signer.id, event_type: "otp_failed",
        ip_hash: ipHash, user_agent: ua, metadata: { result },
      });
    };
    let secret: string | null = null;
    try { secret = otpSecret(); } catch { secret = null; }

    if (action === "send_otp") {
      if (!secret) {
        return new Response(JSON.stringify({ error: "otp_unavailable" }), {
          status: 503, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const lastWindow = new Date(Date.now() - OTP_RESEND_COOLDOWN_MS).toISOString();
      if (await recentEvents("otp_failed", dayAgo) >= OTP_DAILY_FAILURE_CAP) {
        return new Response(JSON.stringify({ error: "otp_locked" }), {
          status: 429, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (await recentEvents("otp_sent", lastWindow) > 0) {
        return new Response(JSON.stringify({ error: "otp_resend_too_soon" }), {
          status: 429, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (await recentEvents("otp_sent", hourAgo) >= OTP_MAX_SENDS_PER_HOUR) {
        return new Response(JSON.stringify({ error: "otp_resend_limit" }), {
          status: 429, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const code = otp6();
      const hash = await hashOtpV2(code, signer.id, secret);
      const exp = new Date(Date.now() + 10 * 60_000).toISOString();
      // Атомарно: само една паралелна заявка може да смени текущия код.
      let upd = admin.from("signing_request_signers").update({
        otp_code_hash: hash, otp_expires_at: exp, otp_attempts: 0,
        status: signer.status === "pending" || signer.status === "viewed" ? "otp_sent" : signer.status,
      }).eq("id", signer.id);
      upd = signer.otp_expires_at ? upd.eq("otp_expires_at", signer.otp_expires_at) : upd.is("otp_expires_at", null);
      const { data: won } = await upd.select("id");
      if (!won || won.length !== 1) {
        return new Response(JSON.stringify({ error: "otp_resend_too_soon" }), {
          status: 429, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      await admin.from("signing_audit_events").insert({
        request_id: env.id, signer_id: signer.id, event_type: "otp_sent",
        ip_hash: ipHash, user_agent: ua, metadata: { email: signer.email },
      });
      sendAppEmail(admin, "signing-otp", signer.email, {
        idempotencyKey: `signing-otp-${signer.id}-${exp}`,
        templateData: { code, documentTitle: env.title },
      }).catch(() => {});
      // Кодът НИКОГА не се връща в отговора (няма debug режим).
      return new Response(JSON.stringify({ ok: true, expires_at: exp }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (action === "verify_otp") {
      const { code } = body as { code?: unknown };
      if (await recentEvents("otp_failed", dayAgo) >= OTP_DAILY_FAILURE_CAP) {
        return new Response(JSON.stringify({ error: "otp_locked" }), {
          status: 429, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const r = await consumeAttemptAndVerify(attemptStore, signer.id, code, secret);
      if (r !== "ok") {
        if (r === "otp_invalid") await otpFailure(r);
        return new Response(JSON.stringify({ error: r }), {
          status: r === "otp_locked" ? 429 : r === "otp_required" ? 400 : 401,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      // Успешната проверка не изразходва кода; подписът го изисква отново.
      await admin.from("signing_request_signers").update({ otp_attempts: 0 })
        .eq("id", signer.id);
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

      // Подписващият потвърждава ТОЧНО версията, която е видял.
      const seen = (body as { document_sha256?: unknown }).document_sha256;
      if (typeof seen !== "string" || !safeEqualHex(seen.toLowerCase(), documentSha256)) {
        return new Response(JSON.stringify({ error: "document_changed" }), {
          status: 409, headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // OTP се проверява ПРЕДИ всяка работа с хранилището и с общия лимит от
      // 5 опита (иначе стъпката „sign“ позволява неограничено налучкване).
      if (await recentEvents("otp_failed", dayAgo) >= OTP_DAILY_FAILURE_CAP) {
        return new Response(JSON.stringify({ error: "otp_locked" }), {
          status: 429, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const hashAtCheck = (await attemptStore.read()).otp_code_hash;
      const otpResult = await consumeAttemptAndVerify(attemptStore, signer.id, otp_code, secret);
      if (otpResult !== "ok" || !hashAtCheck) {
        if (otpResult === "otp_invalid") await otpFailure(otpResult);
        const err = otpResult === "ok" ? "otp_required" : otpResult;
        return new Response(JSON.stringify({ error: err }), {
          status: err === "otp_locked" ? 429 : err === "otp_required" ? 400 : 401,
          headers: { ...cors, "Content-Type": "application/json" },
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
        // Таван върху base64 дължината ПРЕДИ декодиране (15 MB файл ≈ 20 MB base64).
        if (typeof qes_file_base64 !== "string" || qes_file_base64.length > Math.ceil(15 * 1024 * 1024 / 3) * 4) {
          return new Response(JSON.stringify({ error: "qes_file_too_large" }), {
            status: 413, headers: { ...cors, "Content-Type": "application/json" },
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
      const { data: signedRows } = await admin.from("signing_request_signers").update({
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
      })
        .eq("id", signer.id)
        // Атомарно: същият OTP не може да подпише два пъти при паралелни заявки.
        .eq("otp_code_hash", hashAtCheck)
        .neq("status", "signed")
        .select("id");
      if (!signedRows || signedRows.length === 0) {
        if (qesPath) await admin.storage.from("qes-signatures").remove([qesPath]);
        return new Response(JSON.stringify({ error: "already_signed" }), {
          status: 409, headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      await admin.from("signing_audit_events").insert({
        request_id: env.id, signer_id: signer.id, event_type: "signed",
        ip_hash: ipHash, user_agent: ua,
        metadata: { signer_name: cleanName, signature_method: method, qes_file_name: qesCleanName, document_sha256: documentSha256 },
      });


      // Update envelope status
      const { data: allSigners } = await admin.from("signing_request_signers")
        .select("id, name, email, role, order_idx, status, sign_token")
        .eq("request_id", env.id).order("order_idx");
      const newStatus = nextEnvelopeStatus(allSigners ?? []);
      const updates: Record<string, unknown> = { status: newStatus };
      if (newStatus === "completed") updates.completed_at = now;
      // Преход само от незавършено състояние: отменена/изтекла заявка не се
      // „съживява“, а повторните заявки не дублират завършването.
      const { data: moved } = await admin.from("signing_requests").update(updates)
        .eq("id", env.id).in("status", ["pending", "in_progress"]).select("id");
      const transitioned = !!moved && moved.length === 1;

      const appBase = (Deno.env.get("APP_BASE_URL") || "https://dogovori.net").replace(/\/+$/, "");

      if (newStatus === "completed" && transitioned) {
        await admin.from("signing_audit_events").insert({
          request_id: env.id, event_type: "envelope_completed",
          metadata: { document_sha256: documentSha256 },
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
      } else if (transitioned && env.order_mode === "sequential") {
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
      // Отказът е изявление на подписващия: изисква същото потвърждение с код
      // като подписа. Иначе собственикът (който вижда линка) би могъл да откаже
      // от името на друг участник.
      const { reason, otp_code } = body as { reason?: string; otp_code?: string };
      const cleanReason = (reason ?? "").toString().trim().slice(0, 500);
      if (await recentEvents("otp_failed", dayAgo) >= OTP_DAILY_FAILURE_CAP) {
        return new Response(JSON.stringify({ error: "otp_locked" }), {
          status: 429, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const hashAtCheck = (await attemptStore.read()).otp_code_hash;
      const otpResult = await consumeAttemptAndVerify(attemptStore, signer.id, otp_code, secret);
      if (otpResult !== "ok" || !hashAtCheck) {
        if (otpResult === "otp_invalid") await otpFailure(otpResult);
        const err = otpResult === "ok" ? "otp_required" : otpResult;
        return new Response(JSON.stringify({ error: err }), {
          status: err === "otp_locked" ? 429 : err === "otp_required" ? 400 : 401,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const { data: declinedRows } = await admin.from("signing_request_signers").update({
        status: "declined", declined_at: now, decline_reason: cleanReason || null,
        signer_ip_hash: ipHash, signer_user_agent: ua,
        otp_code_hash: null, otp_expires_at: null,
      })
        .eq("id", signer.id)
        .eq("otp_code_hash", hashAtCheck)
        .not("status", "in", "(signed,declined)")
        .select("id");
      if (!declinedRows || declinedRows.length === 0) {
        return new Response(JSON.stringify({ error: "already_declined" }), {
          status: 409, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      await admin.from("signing_requests").update({ status: "declined" })
        .eq("id", env.id).in("status", ["pending", "in_progress"]);
      await admin.from("signing_audit_events").insert({
        request_id: env.id, signer_id: signer.id, event_type: "declined",
        ip_hash: ipHash, user_agent: ua,
        metadata: { reason: cleanReason, document_sha256: documentSha256 },
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
