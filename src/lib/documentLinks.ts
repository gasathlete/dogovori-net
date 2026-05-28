// Helpers for managing parent↔child document_links with versioning.
import { supabase } from "@/integrations/supabase/client";
import type { RefType } from "@/lib/documentReferences";

export interface LinkParent {
  saved_id?: string;
  uploaded_id?: string;
}
export interface LinkChild {
  saved_id?: string;
  uploaded_id?: string;
}

export interface CreateLinkParams {
  user_id: string;
  team_id?: string | null;
  parent: LinkParent;
  child: LinkChild;
  ref_type: RefType;
  ref_number: number | null;
  ref_label: string;
}

/**
 * Inserts a new document_links row. If a previous *active* link exists for the
 * same parent + ref_type + ref_number, marks the new row as a new version and
 * sets the old row's superseded_by to the new id.
 */
export async function linkChildToParent(p: CreateLinkParams): Promise<{ id: string; version: number } | { error: string }> {
  // Find existing active link with same parent + ref
  const parentFilter = p.parent.saved_id
    ? { col: "parent_saved_id", val: p.parent.saved_id }
    : { col: "parent_uploaded_id", val: p.parent.uploaded_id! };

  const { data: existing } = await supabase
    .from("document_links")
    .select("id, version")
    .eq(parentFilter.col, parentFilter.val)
    .eq("ref_type", p.ref_type)
    .is("superseded_by", null)
    .filter("ref_number", p.ref_number === null ? "is" : "eq", p.ref_number === null ? null : p.ref_number)
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = ((existing && existing[0]?.version) ?? 0) + 1;

  const insert = {
    user_id: p.user_id,
    team_id: p.team_id ?? null,
    parent_saved_id: p.parent.saved_id ?? null,
    parent_uploaded_id: p.parent.uploaded_id ?? null,
    child_saved_id: p.child.saved_id ?? null,
    child_uploaded_id: p.child.uploaded_id ?? null,
    ref_type: p.ref_type,
    ref_number: p.ref_number,
    ref_label: p.ref_label,
    version: nextVersion,
  };

  const { data: inserted, error } = await supabase
    .from("document_links")
    .insert(insert)
    .select("id, version")
    .single();

  if (error) return { error: error.message };

  if (existing && existing[0]) {
    await supabase
      .from("document_links")
      .update({ superseded_by: inserted.id })
      .eq("id", existing[0].id);
  }

  return inserted;
}

export interface ActiveChildLink {
  id: string;
  ref_type: string;
  ref_number: number | null;
  ref_label: string;
  version: number;
  child_saved_id: string | null;
  child_uploaded_id: string | null;
}

export async function listActiveChildren(parent: LinkParent): Promise<ActiveChildLink[]> {
  const q = supabase
    .from("document_links")
    .select("id, ref_type, ref_number, ref_label, version, child_saved_id, child_uploaded_id")
    .is("superseded_by", null);

  if (parent.saved_id) q.eq("parent_saved_id", parent.saved_id);
  else if (parent.uploaded_id) q.eq("parent_uploaded_id", parent.uploaded_id);

  const { data, error } = await q.order("ref_number", { ascending: true });
  if (error) return [];
  return (data ?? []) as ActiveChildLink[];
}
