import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parsePendingMedia } from "@/lib/pendingMedia";

/**
 * Показва публичен адрес директно, а неодобрен файл от частната staging кофа —
 * чрез краткотраен подписан адрес (достъпен само за автора и модераторите).
 */
export function MediaImg({ src, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string }) {
  const pending = parsePendingMedia(src);
  const [resolved, setResolved] = useState<string | null>(pending ? null : src);

  useEffect(() => {
    const p = parsePendingMedia(src);
    if (!p) { setResolved(src); return; }
    let alive = true;
    supabase.storage.from(p.bucket).createSignedUrl(p.path, 300).then(({ data }) => {
      if (alive) setResolved(data?.signedUrl ?? null);
    });
    return () => { alive = false; };
  }, [src]);

  if (!resolved) return <span className="inline-block h-10 w-20 rounded bg-muted" aria-hidden="true" />;
  return <img src={resolved} {...rest} />;
}
