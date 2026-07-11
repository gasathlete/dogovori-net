import { useEffect, useMemo, useState } from "react";
import { FileText, Upload, Wand2, Check } from "@/icons";
import { Button } from "@/components/ui/button";
import { detectReferences, type DetectedReference } from "@/lib/documentReferences";
import { listActiveChildren, type ActiveChildLink } from "@/lib/documentLinks";
import { ReferencePromptDialog } from "./ReferencePromptDialog";

interface Props {
  text: string;
  parentSavedId?: string | null;
  parentUploadedId?: string | null;
  parentTitle?: string;
  parentContext?: {
    partiesA?: string[];
    partiesB?: string[];
    subject?: string;
  };
  onChildLinked?: () => void;
}

export function DetectedReferencesBanner({
  text, parentSavedId, parentUploadedId, parentTitle, parentContext, onChildLinked,
}: Props) {
  const refs = useMemo(() => detectReferences(text), [text]);
  const [activeLinks, setActiveLinks] = useState<ActiveChildLink[]>([]);
  const [openRef, setOpenRef] = useState<DetectedReference | null>(null);

  const refreshLinks = async () => {
    if (!parentSavedId && !parentUploadedId) { setActiveLinks([]); return; }
    const links = await listActiveChildren({
      saved_id: parentSavedId ?? undefined,
      uploaded_id: parentUploadedId ?? undefined,
    });
    setActiveLinks(links);
  };

  useEffect(() => { void refreshLinks(); }, [parentSavedId, parentUploadedId]);

  if (refs.length === 0) return null;

  const isLinked = (r: DetectedReference) =>
    activeLinks.some(
      (l) => l.ref_type === r.type && (l.ref_number ?? -1) === (r.number ?? -1)
    );

  return (
    <>
      <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 shadow-soft animate-fade-in">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-gold" />
          <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-foreground">
            Открити препратки към допълнителни документи ({refs.length})
          </h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          В договора са посочени следните документи. Можете да ги <span className="text-gold">качите</span> (ако вече ги имате) или да ги <span className="text-gold">изготвите</span> с AI — те ще се прикачат към основния документ при експорт в PDF.
        </p>
        <ul className="space-y-2">
          {refs.map((r) => {
            const linked = isLinked(r);
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-card/60 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{r.displayLabel}</span>
                    {linked && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-400">
                        <Check className="h-3 w-3" /> прикачен
                      </span>
                    )}
                  </div>
                  {r.contextSentence && (
                    <p className="mt-0.5 line-clamp-1 text-[11px] italic text-muted-foreground">
                      „…{r.contextSentence}…"
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={linked ? "outline" : "default"}
                  onClick={() => setOpenRef(r)}
                  className={
                    linked
                      ? "h-7 border-gold/40 text-xs hover:bg-gold/10 hover:text-gold"
                      : "h-7 bg-gradient-gold text-xs text-navy hover:shadow-gold"
                  }
                >
                  {linked ? (
                    <>Замени</>
                  ) : (
                    <>
                      <Upload className="mr-1 h-3 w-3" /> Качи / <Wand2 className="mx-1 h-3 w-3" /> Изготви
                    </>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>

      {openRef && (
        <ReferencePromptDialog
          reference={openRef}
          parentSavedId={parentSavedId ?? null}
          parentUploadedId={parentUploadedId ?? null}
          parentTitle={parentTitle}
          parentContext={parentContext}
          onClose={() => setOpenRef(null)}
          onLinked={() => {
            void refreshLinks();
            onChildLinked?.();
          }}
        />
      )}
    </>
  );
}
