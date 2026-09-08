// Q2e — разрешаване на документния контекст през RLS-обхванат клиент.
// Достъпът се доказва от политиките на базата (включително екипните правила),
// а не от service-role заявка.
import {
  boundedContextTitle,
  computeContextVersion,
  renderBoundedLeaves,
  type AssistantContextKind,
  type RequestedDocumentContext,
} from "./document-context.ts";
import {
  buildAnalysisSourceBinding,
  buildTitleContext,
  isSourceBindingEqual,
  readSourceBinding,
} from "../_shared/analysis-source-binding.ts";

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

export type ContextResolutionCode = "document_not_found" | "analysis_context_stale";

export type ContextResolution =
  | { ok: true; value: ResolvedDocumentContext }
  | { ok: false; code: ContextResolutionCode };

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
      .select("id, title, kind, payload, created_at")
      .eq("id", entityId)
      .maybeSingle();
    if (error || !data) return { ok: false, code: "document_not_found" };
    // Версията се изчислява върху ПЪЛНИЯ payload, независимо от ограниченото
    // текстово представяне по-долу.
    const fields = {
      title: data.title ?? null,
      kind: data.kind ?? null,
      payload: data.payload ?? null,
      created_at: data.created_at ?? null,
    };
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
    .select(
      "id, contract_type, score, summary, issues, missing_clauses, verification, negotiation_strategy, model, created_at, uploaded_contract_id",
    )
    .eq("id", entityId)
    .maybeSingle();
  if (error || !row) return { ok: false, code: "document_not_found" };

  // Стар анализ без свързан източник не може да бъде доказан като актуален.
  if (!row.uploaded_contract_id) return { ok: false, code: "analysis_context_stale" };

  const { data: up, error: upErr } = await client
    .from("uploaded_contracts")
    .select("id, title, extracted_text")
    .eq("id", row.uploaded_contract_id)
    .maybeSingle();
  if (upErr || !up) return { ok: false, code: "document_not_found" };
  const source = {
    id: up.id as string,
    title: (up.title ?? null) as string | null,
    extracted_text: (up.extracted_text ?? null) as string | null,
  };

  // Актуалност: ТОЧНО същият тримнат текст и заглавен контекст, които ползва
  // анализиращият конвейер. Липсващо/невалидно/различно обвързване → отказ.
  const currentBinding = await buildAnalysisSourceBinding({
    sourceText: String(source.extracted_text ?? "").trim(),
    titleContext: buildTitleContext(source.title),
  });
  const storedBinding = readSourceBinding(row.verification);
  if (!storedBinding || !isSourceBindingEqual(storedBinding, currentBinding)) {
    return { ok: false, code: "analysis_context_stale" };
  }

  const fields = {
    contract_type: row.contract_type ?? null,
    score: row.score ?? null,
    summary: row.summary ?? null,
    issues: row.issues ?? null,
    missing_clauses: row.missing_clauses ?? null,
    verification: row.verification ?? null,
    negotiation_strategy: row.negotiation_strategy ?? null,
    model: row.model ?? null,
    created_at: row.created_at ?? null,
    uploaded_contract_id: row.uploaded_contract_id ?? null,
    source_title: source.title ?? null,
    source_text: source.extracted_text ?? null,
  };

  const bodyParts = [
    `Тип документ: ${row.contract_type ?? "неуточнен"}`,
    row.score !== null && row.score !== undefined ? `Риск оценка: ${row.score}` : "",
    row.model ? `Модел на анализа: ${row.model}` : "",
    row.created_at ? `Дата на анализа: ${row.created_at}` : "",
    row.summary ? `Резюме: ${row.summary}` : "",
    Array.isArray(row.issues) && row.issues.length
      ? `Констатации:\n${renderBoundedLeaves(row.issues, { maxTotal: 4000 })}`
      : "",
    Array.isArray(row.missing_clauses) && row.missing_clauses.length
      ? `Липсващи клаузи:\n${renderBoundedLeaves(row.missing_clauses, { maxTotal: 2000 })}`
      : "",
    row.negotiation_strategy
      ? `Преговорна стратегия:\n${renderBoundedLeaves(row.negotiation_strategy, { maxTotal: 2000 })}`
      : "",
    source.extracted_text ? `Текст на източника: ${source.extracted_text}` : "",
  ].filter(Boolean);

  return {
    ok: true,
    value: {
      kind,
      entityId,
      version: await computeContextVersion({ kind, entityId, fields }),
      title: boundedContextTitle([row.contract_type, source.title], kind),
      body: bodyParts.join("\n\n"),
    },
  };
}

/**
 * Ограниченото представяне на запазен документ. Известните полета запазват
 * четимия си ред, а ВСИЧКИ останали листа се добавят рекурсивно с пътища —
 * нищо не се изпуска тихо само защото `intro`/`sections` съществуват.
 */
function renderPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object" || Array.isArray(payload)) {
    return renderBoundedLeaves(payload);
  }
  const p = payload as Record<string, any>;
  const known = new Set(["intro", "sections", "clauses", "text", "closing"]);
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

  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(p)) {
    if (!known.has(key)) rest[key] = p[key];
  }
  // Нестандартни структури в известните полета също влизат (напр. sections с
  // допълнителни ключове) — чрез рекурсивното представяне.
  if (Array.isArray(p.sections)) {
    const extraSections = p.sections.map((s: any) => {
      if (!s || typeof s !== "object") return s;
      const { heading: _h, body: _b, ...restSection } = s;
      return Object.keys(restSection).length ? restSection : null;
    }).filter(Boolean);
    if (extraSections.length) rest.sections = extraSections;
  }
  if (Array.isArray(p.clauses)) {
    const extraClauses = p.clauses.map((c: any) => {
      if (!c || typeof c !== "object") return c;
      const { title: _t, body: _b, ...restClause } = c;
      return Object.keys(restClause).length ? restClause : null;
    }).filter(Boolean);
    if (extraClauses.length) rest.clauses = extraClauses;
  }

  const restRendered = Object.keys(rest).length ? renderBoundedLeaves(rest, { maxTotal: 4000 }) : "";
  const body = parts.filter((s) => s && s.trim()).join("\n\n");
  const rendered = [body, restRendered].filter((s) => s && s.trim()).join("\n\n");
  return rendered || renderBoundedLeaves(payload);
}
