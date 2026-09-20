// Entrepreneur-tier feature: AI-generated negotiation strategy for a risk
// analysis. Returns positions, BATNA, talking points and proposed counter
// clauses. Persists to risk_analyses.negotiation_strategy for reuse.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCors } from "../_shared/cors.ts";
import { extractJson } from "../_shared/json.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { redactForAI, unredact } from "../_shared/redact.ts";
import {
  buildStrategyEvidence,
  type StrategySourceRef,
  strategySigningKey,
  verifyStrategyEvidence,
} from "../_shared/strategy-evidence.ts";
import { canonicalize, sha256Hex } from "../_shared/canonical-digest.ts";
import {
  asOperationId,
  type LedgerRpc,
  cancelDocumentOperation,
  canonicalDocumentBinding,
  commitDocumentOperation,
  ledgerBlockResponse,
  lookupDocumentOperation,
  markDocumentModelStarted,
  markDocumentReconciliation,
  operationIdRequiredResponse,
  operationReconciliationResponse,
  ProviderCallBudget,
  reserveDocumentOperation,
} from "../_shared/ai-document-ledger.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface ReqBody {
  analysis_id?: string;
  force?: boolean;
  /** Само проверка на запазен резултат: без модел, без такса. */
  cached_only?: boolean;
}

/**
 * Актуални версии на цитираните извадки. Липсващ или преиздаден източник прави
 * запазения плик остарял и резултатът се скрива.
 */
async function currentSourceVersions(
  admin: ReturnType<typeof createClient>,
  chunkIds: string[],
): Promise<Map<string, string> | null> {
  if (chunkIds.length === 0) return new Map();
  const { data, error } = await admin
    .from("legal_chunks")
    .select("id, document_id, legal_documents!inner(version, checksum)")
    .in("id", chunkIds);
  if (error) return null;
  const map = new Map<string, string>();
  for (const row of (data as Array<Record<string, unknown>>) ?? []) {
    const doc = row.legal_documents as { version?: string; checksum?: string } | null;
    if (!doc?.version) continue;
    map.set(String(row.id), `${doc.version}:${doc.checksum ?? ""}`);
  }
  return map;
}

Deno.serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Ключът на доставчика се чете СЛЕД само-четящото търсене на завършена
    // операция — повторението не зависи от достъпа до доставчика.


    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(supaUrl, anon, {
      global: { headers: { Authorization: auth } },
    });
    const admin = createClient(supaUrl, service, { auth: { persistSession: false } });
    // Леджърът е СТРОГО service_role RPC — отделен, тесен контракт за тестваемост.
    const ledger = admin as unknown as LedgerRpc;

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "auth_required" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const analysisId = body.analysis_id;
    if (!analysisId) {
      return new Response(JSON.stringify({ error: "analysis_id_required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Gate: Entrepreneur plan required (price_id entrepreneur_monthly|yearly)
    const { data: sub } = await admin
      .from("subscriptions")
      .select("price_id, status")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const priceId = (sub as { price_id?: string } | null)?.price_id ?? "";
    const isEntrepreneur =
      priceId === "entrepreneur_monthly" || priceId === "entrepreneur_yearly";
    if (!isEntrepreneur) {
      return new Response(
        JSON.stringify({ error: "entrepreneur_required" }),
        { status: 402, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Load analysis + contract text
    const { data: a, error: aErr } = await admin
      .from("risk_analyses")
      .select("id, user_id, contract_type, summary, issues, missing_clauses, uploaded_contract_id, negotiation_strategy")
      .eq("id", analysisId)
      .maybeSingle();
    if (aErr || !a) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if ((a as any).user_id !== user.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    // ЗАПАЗЕН РЕЗУЛТАТ СЕ ПОДНАСЯ САМО СЛЕД СЪРВЪРНА ПРОВЕРКА: подписан плик,
    // обвързан със съдържанието, анализа, потребителя и актуалните версии на
    // цитираните източници. Стар/подправен/остарял запис остава скрит.
    const signingKey = strategySigningKey(Deno.env);
    const stored = (a as any).negotiation_strategy;
    if (!body.force && stored && typeof stored === "object") {
      const storedSources = Array.isArray((stored as any)?.__evidence?.sources)
        ? ((stored as any).__evidence.sources as StrategySourceRef[])
        : [];
      const currentSources = await currentSourceVersions(
        admin as unknown as Parameters<typeof currentSourceVersions>[0],
        storedSources.map((s) => String(s?.chunk_id ?? "")).filter(Boolean),
      );
      const verdict = await verifyStrategyEvidence({
        envelope: stored,
        analysisId,
        userId: user.id,
        signingKey,
        currentSources,
        now: new Date(),
      });
      if (verdict.ok) {
        return new Response(
          JSON.stringify({ ok: true, cached: true, strategy: stored }),
          { headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      if (body.cached_only) {
        return new Response(
          JSON.stringify({ ok: true, cached: false, strategy: null, reason: verdict.reason }),
          { headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
    }
    if (body.cached_only) {
      return new Response(
        JSON.stringify({ ok: true, cached: false, strategy: null, reason: "missing_envelope" }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    if (!signingKey) {
      return new Response(
        JSON.stringify({ error: "evidence_unavailable", charged: false }),
        { status: 503, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }


    let contractText = "";
    if ((a as any).uploaded_contract_id) {
      const { data: u } = await admin
        .from("uploaded_contracts")
        .select("text_content")
        .eq("id", (a as any).uploaded_contract_id)
        .maybeSingle();
      contractText = ((u as any)?.text_content ?? "").slice(0, 12000);
    }

    // ---------------------------------------------------------------------
    // GATE 2 — ТОЧНО ЕДНО ИЗПЪЛНЕНИЕ за генерирана стратегия.
    // Само-четенето на запазен плик (cached_only) остава БЕЗ модел и БЕЗ
    // операция. Оттук надолу заявката може да стигне до модел.
    // ---------------------------------------------------------------------
    const operationId = asOperationId((body as { operation_id?: unknown }).operation_id);
    if (!operationId) return operationIdRequiredResponse(cors);

    // Версията се извлича ИЗЦЯЛО на сървъра от собствения анализ — клиентът
    // никога не носи истината за версията.
    const sourceVersion = await sha256Hex(canonicalize([
      "negotiation_source_v1",
      String((a as any).contract_type ?? ""),
      await sha256Hex(String((a as any).summary ?? "")),
      await sha256Hex(JSON.stringify((a as any).issues ?? [])),
      await sha256Hex(JSON.stringify((a as any).missing_clauses ?? [])),
      await sha256Hex(contractText),
    ]));
    const binding = await canonicalDocumentBinding({
      purpose: "negotiation_strategy",
      userId: user.id,
      resourceId: analysisId,
      resourceVersion: sourceVersion,
      options: { force: body.force === true },
    });

    const existing = await lookupDocumentOperation(ledger, {
      operationId,
      userId: user.id,
      purpose: "negotiation_strategy",
      binding,
    });
    if (existing.kind === "committed") {
      return new Response(JSON.stringify({ ...existing.result, replay: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const existingBlock = ledgerBlockResponse(existing, cors);
    if (existingBlock) return existingBlock;

    const reserved = await reserveDocumentOperation(ledger, {
      operationId,
      userId: user.id,
      purpose: "negotiation_strategy",
      binding,
      inputDigest: sourceVersion,
      resourceId: analysisId,
      resourceVersion: sourceVersion,
      leaseSeconds: 600,
    });
    if (reserved.kind === "committed") {
      return new Response(JSON.stringify({ ...reserved.result, replay: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const reserveBlock = ledgerBlockResponse(reserved, cors);
    if (reserveBlock) return reserveBlock;


    const sys = `Ти си опитен правен стратег за преговори по български договори. Връщаш САМО валиден JSON със следната структура:
{
 "summary": string,                       // 1-2 изречения с цялостната стратегия
 "leverage_points": [{"title": string, "rationale": string}],  // 3-5 силни позиции на клиента
 "concessions": [{"title": string, "rationale": string}],      // 2-4 неща, които може да отстъпи
 "batna": string,                         // най-добра алтернатива при неуспех
 "talking_points": [string],              // 5-8 готови фрази за писмо/среща
 "counter_clauses": [{"clause": string, "proposal": string, "why": string}], // 3-6 контрапредложения
 "next_steps": [string]                   // 3-5 действия с приоритет
}
Пиши на български, конкретно и приложимо. Без markdown, без обяснения извън JSON.`;

    const issuesStr = JSON.stringify((a as any).issues ?? []).slice(0, 4000);
    const missingStr = JSON.stringify((a as any).missing_clauses ?? []).slice(0, 2000);
    const rawCorpus = `Тип договор: ${(a as any).contract_type || "—"}
Резюме на анализа: ${(a as any).summary || "—"}
Открити проблеми: ${issuesStr}
Липсващи клаузи: ${missingStr}
${contractText ? `\n--- ТЕКСТ НА ДОГОВОРА (откъс) ---\n${contractText}` : ""}`;

    // КЛАСИФИКАЦИЯ + РЕДАКЦИЯ на ЦЯЛОТО изходящо съдържание преди всяка
    // външна заявка (включително извличането на правния контекст).
    const classification = classifyDocumentBeforeAI(rawCorpus);
    if (classification.risk_level === "blocked") {
      // Детерминистичен провал ПРЕДИ модела: отмяна, без такса.
      await cancelDocumentOperation(ledger, {
        operationId,
        userId: user.id,
        reason: "content_blocked",
      });
      return new Response(
        JSON.stringify({ error: "content_blocked", code: "content_blocked", charged: false }),
        { status: 422, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    const redaction = redactForAI(rawCorpus);
    const userMsg = redaction.redacted;

    // СТРОГО ЗАЗЕМЯВАНЕ за точно тази (редактирана) заявка — преди модела.
    const { retrieveLegalContext } = await import("../_shared/legal-rag.ts");
    const legal = await retrieveLegalContext(admin as unknown as Parameters<typeof retrieveLegalContext>[0], apiKey, userMsg.slice(0, 4000), {
      matchCount: 6,
    });
    if (!legal.hasMatches) {
      // Правното заземяване се проваля ЗАТВОРЕНО и без такса, преди модела.
      await cancelDocumentOperation(ledger, {
        operationId,
        userId: user.id,
        reason: "legal_unavailable",
      });
      const { legalVerificationUnavailableResponse } = await import("../_shared/legal-gate.ts");
      return legalVerificationUnavailableResponse({ headers: cors });
    }


    // Заземен системен промпт — използва се и в основното, и в резервното
    // повикване. Няма вариант без проверените извадки.
    const sysGrounded = `${sys}\n\n${legal.promptBlock}`;

    // Трайно записано начало на модела ПРЕДИ първото повикване.
    const started = await markDocumentModelStarted(ledger, {
      operationId,
      userId: user.id,
      purpose: "negotiation_strategy",
      binding,
    });
    if (!started.ok) {
      return ledgerBlockResponse(started.outcome, cors) ??
        operationReconciliationResponse(cors, "model_start_unproven");
    }

    // Твърд бюджет: 1 основен + най-много 1 резервен модел.
    const budget = new ProviderCallBudget("negotiation_strategy");
    const callModel = async (model: string) => {
      budget.take();
      const r = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: sysGrounded },
            { role: "user", content: userMsg },
          ],
          max_tokens: 4000,
          response_format: { type: "json_object" },
        }),
      });
      return r;
    };

    let resp = await callModel("openai/gpt-5");
    let usedModel = "openai/gpt-5";
    if (!resp.ok && (resp.status === 429 || resp.status >= 500)) {
      resp = await callModel("google/gemini-2.5-pro");
      usedModel = "google/gemini-2.5-pro";
    }
    // СЛЕД началото на модела няма автоматично връщане и няма трето повикване:
    // всяка несигурност отива в изравняване.
    const reconcileAndRespond = async (reason: string): Promise<Response> => {
      await markDocumentReconciliation(ledger, {
        operationId,
        userId: user.id,
        reason,
      });
      return operationReconciliationResponse(cors, reason);
    };

    if (!resp.ok) {
      // Нормализирана грешка: без тяло и подробности от доставчика.
      return await reconcileAndRespond(resp.status === 429 ? "provider_busy" : "provider_failed");
    }
    const data = await resp.json().catch(() => null);
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const parsedStrategy = extractJson(raw, { fn: "negotiation-strategy" });
    if (!parsedStrategy || typeof parsedStrategy !== "object") {
      return await reconcileAndRespond("malformed_response");
    }
    // Връщане на редактираните стойности само в текстовите полета.
    const strategy = JSON.parse(
      unredact(JSON.stringify(parsedStrategy), redaction.mapping),
    );

    // ПОДПИСАН ДОКАЗАТЕЛСТВЕН ПЛИК: обвързан със съдържанието, анализа,
    // потребителя и точните версии на цитираните източници.
    const citedIds = legal.citations.map((c) => c.chunk_id);
    const versions = await currentSourceVersions(admin as unknown as Parameters<typeof currentSourceVersions>[0], citedIds);
    if (!versions) {
      return await reconcileAndRespond("evidence_unavailable");
    }
    const sources: StrategySourceRef[] = legal.citations
      .filter((c) => versions.get(c.chunk_id))
      .map((c) => ({
        chunk_id: c.chunk_id,
        short_code: c.short_code,
        version: versions.get(c.chunk_id)!,
        snapshot_digest: null,
      }));
    const evidence = sources.length > 0
      ? await buildStrategyEvidence({
        analysisId,
        userId: user.id,
        strategy,
        sources,
        signingKey,
      })
      : null;
    if (!evidence) {
      return await reconcileAndRespond("evidence_unsigned");
    }
    const envelope = { ...strategy, __evidence: evidence };

    // АТОМАРНО: подписаният плик върху собствения анализ, резултатът за точно
    // повторение и счетоводството — заедно, най-много една бизнес промяна.
    const payload = {
      ok: true,
      cached: false,
      model: usedModel,
      strategy: envelope,
      citations: legal.citations,
    };
    const committed = await commitDocumentOperation(ledger, {
      operationId,
      userId: user.id,
      purpose: "negotiation_strategy",
      binding,
      result: payload,
      resultTtlSeconds: 86400,
      usageFunction: "negotiation-strategy",
      business: {
        kind: "negotiation_strategy",
        analysis_id: analysisId,
        source_version: sourceVersion,
        envelope,
        generated_at: evidence.generated_at,
      },
    });
    if (committed.kind !== "committed") {
      return await reconcileAndRespond("commit_uncertain");
    }

    return new Response(
      JSON.stringify(payload),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("negotiation-strategy error:", e);
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
