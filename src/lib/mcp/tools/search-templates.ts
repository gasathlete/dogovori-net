import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { postgrestSubstring } from "../../postgrestLiteral";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "search_templates",
  title: "Search legal templates",
  description:
    "Searches the public catalog of Bulgarian legal document templates by keyword. Returns slug, name, category and purpose so the user can navigate to /shablon/<slug> or start a wizard.",
  inputSchema: {
    query: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .describe("Keyword to match against template name/purpose/category (Bulgarian or English)."),
    limit: z.number().int().min(1).max(25).default(10).describe("Maximum results (1-25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ query, limit }, ctx) => {
    const supabase = supabaseForUser(ctx);
    const like = postgrestSubstring(query);
    const { data, error } = await supabase
      .from("template_search_index")
      .select("slug, name, category_title, purpose, document_type, bilingual, has_dynamic_wizard")
      .or(`name.ilike.${like},purpose.ilike.${like},category_title.ilike.${like}`)
      .limit(limit);
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
    const rows = data ?? [];
    return {
      content: [
        {
          type: "text",
          text: rows.length
            ? rows
                .map(
                  (r) =>
                    `- ${r.name} — /shablon/${r.slug}${r.category_title ? ` — ${r.category_title}` : ""}${r.purpose ? `\n  ${r.purpose}` : ""}`,
                )
                .join("\n")
            : `No templates matched "${query}".`,
        },
      ],
      structuredContent: { templates: rows },
    };
  },
});
