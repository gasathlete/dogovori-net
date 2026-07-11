import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_my_document",
  title: "Get one of my documents",
  description:
    "Fetches the full content of one of the signed-in user's saved documents by id. Returns title, kind, and the JSON payload with clauses/fields.",
  inputSchema: {
    id: z.string().uuid().describe("UUID of the saved document (use list_my_documents to find it)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("saved_documents")
      .select("id, title, kind, payload, created_at, updated_at")
      .eq("user_id", ctx.getUserId())
      .eq("id", id)
      .maybeSingle();
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
    if (!data) {
      return { content: [{ type: "text", text: "Document not found." }], isError: true };
    }
    return {
      content: [
        {
          type: "text",
          text: `# ${data.title || "(untitled)"}\nKind: ${data.kind}\nUpdated: ${data.updated_at}\n\n${JSON.stringify(data.payload, null, 2)}`,
        },
      ],
      structuredContent: { document: data },
    };
  },
});
