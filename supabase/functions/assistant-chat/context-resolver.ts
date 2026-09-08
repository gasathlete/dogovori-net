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
    // `original_filename` участва в сървърното заглавие, затова ТРЯБВА да влиза
    // и във версията — иначе смяна само на името не би направила разговора
    // остарял, макар етикетът му да се променя.
    const fields = {
      title: data.title ?? null,
      original_filename: data.original_filename ?? null,
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

/** Плитко-дълбоко копие на прост JSON-подобен обект (без класове/функции). */
function jsonClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => jsonClone(v)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>)) {
    out[k] = jsonClone((value as Record<string, unknown>)[k]);
  }
  return out as unknown as T;
}

/**
 * Ограниченото представяне на запазен документ.
 *
 * Известните полета запазват четимия си ред САМО когато формата им е
 * стандартна; всеки консумиран лист се маха от остатъка, а остатъкът се извежда
 * рекурсивно с пътища. Така всеки string/number/boolean лист се появява точно
 * ВЕДНЪЖ — включително при нестандартни форми (`sections` като обект, `intro`
 * като обект, `clauses` като скалар, вложен `text`).
 */
function renderPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object" || Array.isArray(payload)) {
    return renderBoundedLeaves(payload);
  }
  const p = payload as Record<string, any>;
  const rest = jsonClone(p) as Record<string, any>;
  const parts: string[] = [];

  const takeString = (holder: Record<string, any>, key: string): string | null => {
    const v = holder?.[key];
    if (typeof v === "string" && v.trim()) {
      delete holder[key];
      return v;
    }
    return null;
  };

  const intro = takeString(rest, "intro");
  if (intro) parts.push(intro);

  if (Array.isArray(p.sections) && Array.isArray(rest.sections)) {
    for (let i = 0; i < rest.sections.length; i++) {
      const s = rest.sections[i];
      if (!s || typeof s !== "object" || Array.isArray(s)) continue;
      const heading = takeString(s, "heading");
      const body = takeString(s, "body");
      const joined = [heading, body].filter(Boolean).join("\n");
      if (joined) parts.push(joined);
    }
  }

  if (Array.isArray(p.clauses) && Array.isArray(rest.clauses)) {
    for (let i = 0; i < rest.clauses.length; i++) {
      const c = rest.clauses[i];
      if (!c || typeof c !== "object" || Array.isArray(c)) continue;
      const title = takeString(c, "title");
      const body = takeString(c, "body");
      const joined = [title, body].filter(Boolean).join("\n");
      if (joined) parts.push(joined);
    }
  }

  const text = takeString(rest, "text");
  if (text) parts.push(text);
  const closing = takeString(rest, "closing");
  if (closing) parts.push(closing);

  const restRendered = renderBoundedLeaves(rest, { maxTotal: 4000 });
  const body = parts.filter((s) => s && s.trim()).join("\n\n");
  const rendered = [body, restRendered].filter((s) => s && s.trim()).join("\n\n");
  return rendered || renderBoundedLeaves(payload);
}
