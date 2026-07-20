// CRUD helpers for user document kits. Wraps `document_kits` and
// `document_kit_items`. All calls are safe to fail — kit work is non-blocking
// over the existing save/link logic.
import { supabase } from "@/integrations/supabase/client";
import { DOCUMENT_KITS, getKit, type DocumentKit, type KitItem } from "@/data/documentKits";

export interface UserKit {
  id: string;
  user_id: string;
  team_id: string | null;
  title: string;
  source_kit_id: string | null;
  status: "in_progress" | "complete" | "archived";
  created_at: string;
  updated_at: string;
}

export interface UserKitItem {
  id: string;
  kit_id: string;
  role: "primary" | "appendix" | "companion";
  ref_label: string;
  saved_id: string | null;
  uploaded_id: string | null;
  planned_doc_name: string | null;
  position: number;
  created_at: string;
}

export interface UserKitWithItems extends UserKit {
  items: UserKitItem[];
}

/** Create an empty kit. Optionally seeded from a predefined kit template. */
export async function createKit(input: {
  user_id: string;
  team_id?: string | null;
  title: string;
  source_kit_id?: string;
}): Promise<UserKit | null> {
  const { data, error } = await supabase
    .from("document_kits")
    .insert({
      user_id: input.user_id,
      team_id: input.team_id ?? null,
      title: input.title,
      source_kit_id: input.source_kit_id ?? null,
    })
    .select("*")
    .single();
  if (error) {
    console.error("createKit failed:", error);
    return null;
  }
  return data as UserKit;
}

/** Create a kit from a predefined template, seeding planned items. */
export async function createKitFromTemplate(
  user_id: string,
  templateId: string,
  team_id?: string | null,
): Promise<UserKit | null> {
  const tpl = getKit(templateId);
  if (!tpl) return null;
  const kit = await createKit({
    user_id,
    team_id,
    title: tpl.title,
    source_kit_id: tpl.id,
  });
  if (!kit) return null;
  const items = tpl.items.map((it, idx) => ({
    kit_id: kit.id,
    role: it.role,
    ref_label: it.docName,
    planned_doc_name: it.docName,
    position: idx,
  }));
  if (items.length) {
    const { error } = await supabase.from("document_kit_items").insert(items);
    if (error) console.error("seed kit items failed:", error);
  }
  return kit;
}

export async function addItemToKit(input: {
  kit_id: string;
  role: UserKitItem["role"];
  ref_label: string;
  saved_id?: string;
  uploaded_id?: string;
  planned_doc_name?: string;
}): Promise<UserKitItem | null> {
  // Get current max position
  const { data: existing } = await supabase
    .from("document_kit_items")
    .select("position")
    .eq("kit_id", input.kit_id)
    .order("position", { ascending: false })
    .limit(1);
  const nextPos = (existing?.[0]?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("document_kit_items")
    .insert({
      kit_id: input.kit_id,
      role: input.role,
      ref_label: input.ref_label,
      saved_id: input.saved_id ?? null,
      uploaded_id: input.uploaded_id ?? null,
      planned_doc_name: input.planned_doc_name ?? null,
      position: nextPos,
    })
    .select("*")
    .single();
  if (error) {
    console.error("addItemToKit failed:", error);
    return null;
  }

  await supabase
    .from("document_kits")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.kit_id);

  return data as UserKitItem;
}

export async function listMyKits(user_id: string): Promise<UserKit[]> {
  const { data, error } = await supabase
    .from("document_kits")
    .select("*")
    .eq("user_id", user_id)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("listMyKits failed:", error);
    return [];
  }
  return (data ?? []) as UserKit[];
}

export async function getKitWithItems(id: string): Promise<UserKitWithItems | null> {
  const { data: kit, error } = await supabase
    .from("document_kits")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !kit) return null;
  const { data: items } = await supabase
    .from("document_kit_items")
    .select("*")
    .eq("kit_id", id)
    .order("position", { ascending: true });
  return { ...(kit as UserKit), items: (items ?? []) as UserKitItem[] };
}

export function kitProgress(items: UserKitItem[]): { done: number; total: number } {
  const total = items.length;
  const done = items.filter((i) => i.saved_id || i.uploaded_id).length;
  return { done, total };
}

export async function deleteKit(id: string): Promise<boolean> {
  const { error } = await supabase.from("document_kits").delete().eq("id", id);
  if (error) {
    console.error("deleteKit failed:", error);
    return false;
  }
  return true;
}

export async function setKitStatus(
  id: string,
  status: UserKit["status"],
): Promise<boolean> {
  const { error } = await supabase
    .from("document_kits")
    .update({ status })
    .eq("id", id);
  return !error;
}

/** Rename a kit. Returns true on success. */
export async function renameKit(id: string, title: string): Promise<boolean> {
  const clean = title.trim();
  if (!clean) return false;
  const { error } = await supabase
    .from("document_kits")
    .update({ title: clean, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("renameKit failed:", error);
    return false;
  }
  return true;
}

/** Remove a single item from a kit. */
export async function removeItemFromKit(itemId: string): Promise<boolean> {
  const { error } = await supabase
    .from("document_kit_items")
    .delete()
    .eq("id", itemId);
  if (error) {
    console.error("removeItemFromKit failed:", error);
    return false;
  }
  return true;
}

/**
 * Returns true if ANY item in the kit already has a signing request
 * (draft/sent/completed). Used to lock edits once the kit has been sent
 * for signature.
 */
export async function kitHasSigningRequests(items: UserKitItem[]): Promise<boolean> {
  const savedIds = items.map((i) => i.saved_id).filter(Boolean) as string[];
  const uploadedIds = items.map((i) => i.uploaded_id).filter(Boolean) as string[];
  if (savedIds.length === 0 && uploadedIds.length === 0) return false;

  const checks: Promise<number>[] = [];
  if (savedIds.length) {
    checks.push(
      supabase
        .from("signing_requests")
        .select("id", { count: "exact", head: true })
        .in("saved_document_id", savedIds)
        .then((r) => r.count ?? 0),
    );
  }
  if (uploadedIds.length) {
    checks.push(
      supabase
        .from("signing_requests")
        .select("id", { count: "exact", head: true })
        .in("uploaded_contract_id", uploadedIds)
        .then((r) => r.count ?? 0),
    );
  }
  const results = await Promise.all(checks);
  return results.some((c) => c > 0);
}

export { DOCUMENT_KITS };
export type { DocumentKit, KitItem };
