// Q2e — разрешаване на документния контекст през RLS-обхванат клиент.
// Достъпът се доказва от политиките на базата (включително екипните правила),
// а не от service-role заявка.
import {
  boundedContextTitle,
  computeContextVersion,
  type AssistantContextKind,
  type RequestedDocumentContext,
} from "./document-context.ts";

export interface ResolvedDocumentContext {
  kind: AssistantContextKind;
  entityId: string;
  /** Канонична SHA-256 версия на пълния текущ сървърен ред. */
  version: string;
  /** Заглавие, извлечено от сървъра (клиентското заглавие се игнорира). */
  title: string;
  /** Текст за системния контекст — само данни, вече ограничен по-нататък. */
  body: string;
}

export type ContextResolution =
  | { ok: true; value: ResolvedDocumentContext }
  | { ok: false; code: "document_not_found" };

interface MinimalClient {
  from: (table: string) => any;
}

export async function resolveDocumentContext(
  client: MinimalClient,
  requested: RequestedDocumentContext,
): Promise<ContextResolution> {
  const { kind, entityId } = requested;

  if (kind === "saved_document") {
    const { data, error } = await client
      .from("saved_documents")
      .select("id, title, payload")
      .eq("id", entityId)
      .maybeSingle();
    if (error || !data) return { ok: false, code: "document_not_found" };
    const fields = { title: data.title ?? null, payload: data.payload ?? null };
    return {
      ok: true,
      value: {
        kind,
        entityId,
        version: await computeContextVersion({ kind, entityId, fields }),
        title: boundedContextTitle([data.title], kind),
        body: renderPayload(data.payload),
      },
    };
  }

  if (kind === "uploaded_contract") {
    const { data, error } = await client
      .from("uploaded_contracts")
      .select("id, title, original_filename, extracted_text")
      .eq("id", entityId)
      .maybeSingle();
    if (error || !data) return { ok: false, code: "document_not_found" };
    const fields = {
      title: data.title ?? null,
      extracted_text: data.extracted_text ?? null,
    };
    return {
      ok: true,
      value: {
        kind,
        entityId,
        version: await computeContextVersion({ kind, entityId, fields }),
        title: boundedContextTitle([data.title, data.original_filename], kind),
        body: String(data.extracted_text ?? ""),
      },
    };
  }

  // analysis: анализът и точно свързаният му източник влизат заедно.
  const { data: row, error } = await client
    .from("risk_analyses")
    .select("id, contract_type, score, summary, issues, missing_clauses, verification, uploaded_contract_id")
    .eq("id", entityId)
    .maybeSingle();
  if (error || !row) return { ok: false, code: "document_not_found" };

  let source: { id: string; title: string | null; extracted_text: string | null } | null = null;
  if (row.uploaded_contract_id) {
    const { data: up, error: upErr } = await client
      .from("uploaded_contracts")
      .select("id, title, extracted_text")
      .eq("id", row.uploaded_contract_id)
      .maybeSingle();
    if (upErr || !up) return { ok: false, code: "document_not_found" };
    source = { id: up.id, title: up.title ?? null, extracted_text: up.extracted_text ?? null };
  }

  const fields = {
    contract_type: row.contract_type ?? null,
    score: row.score ?? null,
    summary: row.summary ?? null,
    issues: row.issues ?? null,
    missing_clauses: row.missing_clauses ?? null,
    verification: row.verification ?? null,
    uploaded_contract_id: row.uploaded_contract_id ?? null,
    source_title: source?.title ?? null,
    source_text: source?.extracted_text ?? null,
  };

  const bodyParts = [
    `Тип документ: ${row.contract_type ?? "неуточнен"}`,
    row.score !== null && row.score !== undefined ? `Риск оценка: ${row.score}` : "",
    row.summary ? `Резюме: ${row.summary}` : "",
    Array.isArray(row.issues) && row.issues.length
      ? `Констатации: ${JSON.stringify(row.issues)}`
      : "",
    Array.isArray(row.missing_clauses) && row.missing_clauses.length
      ? `Липсващи клаузи: ${JSON.stringify(row.missing_clauses)}`
      : "",
    source?.extracted_text ? `Текст на източника: ${source.extracted_text}` : "",
  ].filter(Boolean);

  return {
    ok: true,
    value: {
      kind,
      entityId,
      version: await computeContextVersion({ kind, entityId, fields }),
      title: boundedContextTitle([row.contract_type, source?.title], kind),
      body: bodyParts.join("\n\n"),
    },
  };
}

function renderPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object") return String(payload);
  const p = payload as Record<string, any>;
  const parts: string[] = [];
  if (typeof p.intro === "string" && p.intro.trim()) parts.push(p.intro);
  if (Array.isArray(p.sections)) {
    for (const s of p.sections) {
      if (!s || typeof s !== "object") continue;
      parts.push([s.heading, s.body].filter((v) => typeof v === "string" && v.trim()).join("\n"));
    }
  }
  if (Array.isArray(p.clauses)) {
    for (const c of p.clauses) {
      if (!c || typeof c !== "object") continue;
      parts.push([c.title, c.body].filter((v) => typeof v === "string" && v.trim()).join("\n"));
    }
  }
  if (typeof p.text === "string" && p.text.trim()) parts.push(p.text);
  if (typeof p.closing === "string" && p.closing.trim()) parts.push(p.closing);
  const rendered = parts.filter((s) => s && s.trim()).join("\n\n");
  return rendered || JSON.stringify(payload);
}
