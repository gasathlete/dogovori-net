import { supabase } from "@/integrations/supabase/client";

export const BRANDING_BUCKET = "branding";

export type BrandingAssetKind = "logo" | "signature" | "stamp";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_BYTES = 2 * 1024 * 1024;

export function validateBrandingAsset(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Позволени формати: PNG, JPG, WebP или SVG.";
  }
  if (file.size > MAX_BYTES) {
    return "Файлът е по-голям от 2 MB.";
  }
  return null;
}

/** Качва актив в частния бъкет под `<user_id>/<kind>-<timestamp>.<ext>`. */
export async function uploadBrandingAsset(
  userId: string,
  kind: BrandingAssetKind,
  file: File,
): Promise<string> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}

export async function removeBrandingAsset(path: string): Promise<void> {
  await supabase.storage.from(BRANDING_BUCKET).remove([path]);
}

/** Сваля актив и го връща като data URL (нужно за jsPDF/docx). */
export async function loadBrandingAssetDataUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BRANDING_BUCKET).download(path);
  if (error || !data) return null;
  return await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(data);
  });
}

/** Кратко валиден подписан URL за преглед в браузъра. */
export async function brandingAssetPreviewUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BRANDING_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
