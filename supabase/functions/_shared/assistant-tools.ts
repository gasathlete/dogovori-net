// Shared tool definitions for the DogovaryAI assistant. OpenAI-compatible
// "tools" schema used directly with the Lovable AI Gateway. Server-side tools
// are executed in the edge function; client-side tools are forwarded to the
// browser via SSE for UI execution (navigation, prefill, opening uploader).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type ToolKind = "server" | "client";

export interface ToolDef {
  kind: ToolKind;
  schema: Record<string, unknown>; // OpenAI function tool schema
}

/**
 * Allowed top-level navigation paths. We never let the model navigate to
 * arbitrary URLs — only known platform routes (sometimes with a slug).
 */
const NAV_PATHS = [
  "/", "/catalog", "/build", "/blog", "/account", "/team", "/kits",
  "/plans", "/auth", "/analyze", "/dashboard", "/console",
] as const;

const SECTOR_PATHS = ["business", "real-estate", "employment", "it"];

export const ASSISTANT_TOOLS: Record<string, ToolDef> = {
  // ---------------- Server-side tools ----------------
  search_templates: {
    kind: "server",
    schema: {
      type: "function",
      function: {
        name: "search_templates",
        description:
          "Търси шаблони и бланки в каталога на Dogovori.net. Извикай преди да предложиш конкретен шаблон или линк към /shablon/...",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Заявка на български — напр. 'договор за наем офис'" },
            limit: { type: "number", description: "Максимум 5", minimum: 1, maximum: 5 },
          },
          required: ["query"],
        },
      },
    },
  },
  // ---------------- Client-side tools ----------------
  navigate: {
    kind: "client",
    schema: {
      type: "function",
      function: {
        name: "navigate",
        description:
          "Навигирай потребителя към страница в платформата. Използвай вместо markdown линк, когато потребителят е поискал да отиде някъде. Path трябва да е една от: " +
          NAV_PATHS.join(", ") + ", /sektor/{business|real-estate|employment|it}, или /shablon/{slug}.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Път започващ със /" },
            reason: { type: "string", description: "Кратко обяснение защо отиваме там (1 изречение)" },
          },
          required: ["path"],
        },
      },
    },
  },
  open_template: {
    kind: "client",
    schema: {
      type: "function",
      function: {
        name: "open_template",
        description: "Отвори конкретен шаблон по slug (от search_templates).",
        parameters: {
          type: "object",
          properties: { slug: { type: "string" } },
          required: ["slug"],
        },
      },
    },
  },
  prefill_build_contract: {
    kind: "client",
    schema: {
      type: "function",
      function: {
        name: "prefill_build_contract",
        description:
          "Стартирай wizard-а за изграждане на договор с предложени стойности. Използвай когато потребителят опише какъв договор иска (страни, предмет, цена, срок).",
        parameters: {
          type: "object",
          properties: {
            documentType: { type: "string", description: "ID на типа документ (напр. rental_agreement)" },
            name: { type: "string", description: "Заглавие на договора" },
            partiesA: { type: "string", description: "Страна А" },
            partiesB: { type: "string", description: "Страна Б" },
            subject: { type: "string", description: "Предмет/обхват на договора" },
            bilingual: { type: "boolean", description: "Двуезичен (BG/EN)" },
          },
        },
      },
    },
  },
  open_upload_analyzer: {
    kind: "client",
    schema: {
      type: "function",
      function: {
        name: "open_upload_analyzer",
        description:
          "Отвори анализатора на договори за качване на PDF/DOCX. Извикай когато потребителят иска да анализираш съществуващ документ.",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  ask_clarification: {
    kind: "client",
    schema: {
      type: "function",
      function: {
        name: "ask_clarification",
        description:
          "Покажи структурирана форма с 2–5 кратки въпроса към потребителя за критични липсващи данни (страни, предмет, срок, цена, особености). Използвай ВИНАГИ преди prefill_build_contract или propose_contract_outline, ако липсват ключови данни. Само 1 ask_clarification на ход. Не повтаряй въпроси, на които потребителят вече е отговорил.",
        parameters: {
          type: "object",
          properties: {
            contextSummary: {
              type: "string",
              description: "1 кратко изречение какво вече разбираме (напр. 'Трудов договор за счетоводител')."
            },
            questions: {
              type: "array",
              maxItems: 5,
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "snake_case идентификатор (напр. 'gross_salary')" },
                  label: { type: "string", description: "Кратък въпрос до 60 знака" },
                  type: { type: "string", enum: ["text", "choice", "number", "date"] },
                  placeholder: { type: "string" },
                  options: {
                    type: "array",
                    items: { type: "string" },
                    description: "Само при type='choice' (2–6 опции)"
                  },
                  required: { type: "boolean" }
                },
                required: ["id", "label", "type"]
              }
            }
          },
          required: ["contextSummary", "questions"]
        }
      }
    }
  },
  propose_contract_outline: {
    kind: "client",
    schema: {
      type: "function",
      function: {
        name: "propose_contract_outline",
        description:
          "Покажи план на договора (5–10 клаузи) за потвърждение от потребителя ПРЕДИ да извикаш prefill_build_contract. Използвай след ask_clarification или ако потребителят е дал достатъчно данни.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Заглавие на договора" },
            documentType: { type: "string", description: "ID на типа документ (от search_templates ако има)" },
            basedOnTemplateSlug: { type: "string", description: "slug от search_templates ако планът се базира на конкретен шаблон" },
            clauses: {
              type: "array",
              minItems: 3,
              maxItems: 12,
              items: {
                type: "object",
                properties: {
                  heading: { type: "string" },
                  summary: { type: "string", description: "1 изречение какво ще съдържа клаузата" }
                },
                required: ["heading", "summary"]
              }
            },
            prefill: {
              type: "object",
              description: "Стойности които ще се подадат на wizard-а при потвърждение",
              properties: {
                name: { type: "string" },
                partiesA: { type: "string" },
                partiesB: { type: "string" },
                subject: { type: "string" },
                bilingual: { type: "boolean" }
              }
            }
          },
          required: ["title", "clauses"]
        }
      }
    }
  },


export const ANON_TOOL_NAMES: string[] = ["search_templates", "navigate", "open_template"];
export const FULL_TOOL_NAMES: string[] = Object.keys(ASSISTANT_TOOLS);

export function toolSchemasFor(names: string[]) {
  return names.map((n) => ASSISTANT_TOOLS[n].schema);
}

export function isServerTool(name: string) {
  return ASSISTANT_TOOLS[name]?.kind === "server";
}

// Sanitize/validate navigate paths.
export function sanitizePath(p: unknown): string | null {
  if (typeof p !== "string") return null;
  if (!p.startsWith("/")) return null;
  if (p.length > 200) return null;
  // exact matches
  if ((NAV_PATHS as readonly string[]).includes(p.split("?")[0])) return p;
  // /sektor/{slug}
  const sectorM = p.match(/^\/sektor\/([a-z\-]+)(\?.*)?$/);
  if (sectorM && SECTOR_PATHS.includes(sectorM[1])) return p;
  // /shablon/{slug}
  const shablonM = p.match(/^\/shablon\/([a-z0-9\-]+)(\?.*)?$/);
  if (shablonM) return p;
  // /blog/{slug}
  if (/^\/blog\/[a-z0-9\-]+$/i.test(p)) return p;
  return null;
}

// ---------------- Server tool execution ----------------

export async function execSearchTemplates(
  admin: SupabaseClient,
  args: { query?: string; limit?: number },
): Promise<{ results: Array<{ slug: string; name: string; purpose: string; category: string; documentType: string }> }> {
  const q = String(args?.query ?? "").trim().slice(0, 200);
  const limit = Math.min(5, Math.max(1, Number(args?.limit) || 5));
  if (!q) return { results: [] };

  // Use Postgres full-text search via the precomputed tsvector.
  // websearch_to_tsquery is forgiving (handles natural-language queries).
  const { data, error } = await admin
    .from("template_search_index")
    .select("slug, name, purpose, category_title, document_type")
    .textSearch("search_tsv", q, { type: "websearch", config: "simple" })
    .eq("locale", "bg")
    .limit(limit);

  const map = (rows: any[] | null) =>
    (rows ?? []).map((r) => ({
      slug: r.slug,
      name: r.name,
      purpose: (r.purpose ?? "").slice(0, 200),
      category: r.category_title ?? "",
      documentType: r.document_type ?? "",
    }));

  // If FTS errored or returned nothing, fall back to ilike on each token.
  if (error || !data || data.length === 0) {
    const tokens = q.split(/\s+/).filter((t) => t.length >= 3).slice(0, 5);
    const ors = tokens.length
      ? tokens.flatMap((tok) => [`name.ilike.%${tok}%`, `purpose.ilike.%${tok}%`]).join(",")
      : `name.ilike.%${q}%,purpose.ilike.%${q}%`;
    const { data: fb } = await admin
      .from("template_search_index")
      .select("slug, name, purpose, category_title, document_type")
      .or(ors)
      .eq("locale", "bg")
      .limit(limit);
    return { results: map(fb) };
  }

  return { results: map(data) };
}
