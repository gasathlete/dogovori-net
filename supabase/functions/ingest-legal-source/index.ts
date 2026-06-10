// Admin-only edge function: ingest a Bulgarian/EU normative act into the
// legal knowledge base. Steps:
//   1. Upsert legal_sources by (jurisdiction, short_code)
//   2. Insert/skip legal_documents by checksum (idempotent re-ingest)
//   3. Chunk the raw text by article/paragraph
//   4. Embed every chunk via google/gemini-embedding-001 (768 dims)
//   5. Insert into legal_chunks with citation labels
//
// Body shape:
// {
//   short_code: "ЗЗД",
//   title: "Закон за задълженията и договорите",
//   source_type: "act" | "code" | "regulation" | "directive" | "ordinance" | "case_law" | "constitution",
//   jurisdiction: "BG" | "EU",
//   issuer?: string,
//   official_url?: string,
//   version?: string,           // defaults to checksum prefix
//   effective_from?: "YYYY-MM-DD",
//   raw_text: string
// }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { chunkBgAct, sha256Hex } from "../_shared/legal-chunker.ts";
import { embedText } from "../_shared/legal-rag.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY липсва" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth: must be staff (admin/moderator)
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: ud } = await admin.auth.getUser(auth.replace("Bearer ", ""));
    const uid = ud?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isStaff } = await admin.rpc("is_staff", { _user_id: uid });
    if (!isStaff) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "Невалиден payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      short_code, title, source_type, jurisdiction, issuer, official_url,
      version, effective_from, raw_text,
    } = body as Record<string, string | undefined>;

    if (!short_code || !title || !source_type || !jurisdiction || !raw_text) {
      return new Response(JSON.stringify({
        error: "Задължителни полета: short_code, title, source_type, jurisdiction, raw_text",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (raw_text.length < 200) {
      return new Response(JSON.stringify({ error: "raw_text е твърде кратък" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Upsert source
    const { data: srcRow, error: srcErr } = await admin
      .from("legal_sources")
      .upsert({
        short_code, title, source_type, jurisdiction,
        issuer: issuer ?? null,
        official_url: official_url ?? null,
        last_indexed_at: new Date().toISOString(),
        active: true,
      }, { onConflict: "jurisdiction,short_code" })
      .select("id")
      .single();
    if (srcErr || !srcRow) {
      console.error("source upsert", srcErr);
      return new Response(JSON.stringify({ error: "Грешка при източник" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Insert document (skip if same checksum already indexed)
    const checksum = await sha256Hex(raw_text);
    const docVersion = version || checksum.slice(0, 12);
    const { data: existing } = await admin
      .from("legal_documents")
      .select("id")
      .eq("source_id", srcRow.id)
      .eq("checksum", checksum)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({
        ok: true, skipped: true, reason: "already_indexed",
        source_id: srcRow.id, document_id: existing.id,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: docRow, error: docErr } = await admin
      .from("legal_documents")
      .insert({
        source_id: srcRow.id,
        version: docVersion,
        effective_from: effective_from ?? null,
        raw_text,
        checksum,
        token_count: Math.ceil(raw_text.length / 4),
      })
      .select("id")
      .single();
    if (docErr || !docRow) {
      console.error("document insert", docErr);
      return new Response(JSON.stringify({ error: "Грешка при документ" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Chunk
    const chunks = chunkBgAct({ raw_text, short_code, source_title: title });
    if (chunks.length === 0) {
      return new Response(JSON.stringify({
        ok: true, source_id: srcRow.id, document_id: docRow.id, chunks: 0,
        warning: "Не са разпознати членове в текста. Проверете форматирането (Чл. N).",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4) Embed in batches of 8 with simple concurrency
    const CONCURRENCY = 4;
    type Row = {
      source_id: string;
      document_id: string;
      article_no: string | null;
      paragraph_no: string | null;
      heading_path: string[];
      citation_label: string;
      content: string;
      chunk_index: number;
      embedding: number[] | null;
    };
    const rows: Row[] = new Array(chunks.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= chunks.length) return;
        const c = chunks[i];
        const vec = await embedText(LOVABLE_API_KEY, `${c.citation_label}\n${c.content}`);
        rows[i] = {
          source_id: srcRow.id,
          document_id: docRow.id,
          article_no: c.article_no,
          paragraph_no: c.paragraph_no,
          heading_path: c.heading_path,
          citation_label: c.citation_label,
          content: c.content,
          chunk_index: c.chunk_index,
          embedding: vec,
        };
      }
    });
    await Promise.all(workers);

    const validRows = rows.filter((r) => r && Array.isArray(r.embedding) && r.embedding.length === 768);
    if (validRows.length === 0) {
      return new Response(JSON.stringify({ error: "Embedding API не върна валидни вектори" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert in batches of 100 to avoid payload limits
    const BATCH = 100;
    let inserted = 0;
    for (let i = 0; i < validRows.length; i += BATCH) {
      const slice = validRows.slice(i, i + BATCH).map((r) => ({
        ...r,
        embedding: r.embedding as unknown as string, // pgvector accepts JSON array
      }));
      const { error: insErr } = await admin.from("legal_chunks").insert(slice);
      if (insErr) {
        console.error("chunk insert", insErr);
        return new Response(JSON.stringify({
          error: "Грешка при записване на чункове", details: insErr.message,
          inserted,
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      inserted += slice.length;
    }

    return new Response(JSON.stringify({
      ok: true,
      source_id: srcRow.id,
      document_id: docRow.id,
      chunks_total: chunks.length,
      chunks_inserted: inserted,
      chunks_skipped: chunks.length - validRows.length,
      version: docVersion,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ingest-legal-source error", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
