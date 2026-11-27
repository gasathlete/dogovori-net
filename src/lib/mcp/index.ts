import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMyDocumentsTool from "./tools/list-my-documents";
import getMyDocumentTool from "./tools/get-my-document";
import listMyContactsTool from "./tools/list-my-contacts";
import searchTemplatesTool from "./tools/search-templates";

// The OAuth issuer MUST be the direct Supabase host, built from the project
// ref (never from SUPABASE_URL — that's the .lovable.cloud proxy). Vite inlines
// VITE_SUPABASE_PROJECT_ID as a literal at build time, keeping this file
// import-safe. The fallback keeps the URL well-formed during the manifest
// extract eval, where a token never verifies against the sentinel.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "dogovori-net-mcp",
  title: "Dogovori.net",
  version: "0.1.0",
  instructions:
    "Tools for the Dogovori.net legal document platform. Use `search_templates` to find Bulgarian legal document templates in the public catalog. Use `list_my_documents` and `get_my_document` to read the signed-in user's saved contracts, blanks and uploaded documents. Use `list_my_contacts` to look up the user's saved counterparties. All user-scoped tools respect the account's row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchTemplatesTool, listMyDocumentsTool, getMyDocumentTool, listMyContactsTool],
});
