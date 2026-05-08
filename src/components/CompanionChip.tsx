import { useState } from "react";
import { FileDown, FileText, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { COMPANION_TEMPLATES } from "@/data/companionTemplates";
import { exportTemplateDOCX, exportTemplatePDF } from "@/lib/templateExporter";
import { toast } from "sonner";

interface Props {
  name: string;
}

export function CompanionChip({ name }: Props) {
  const tpl = COMPANION_TEMPLATES[name];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);

  if (!tpl) {
    return (
      <span className="rounded-full bg-gold/5 px-2.5 py-0.5 text-foreground/80">
        {name}
      </span>
    );
  }

  const handle = async (kind: "pdf" | "docx") => {
    setBusy(kind);
    try {
      if (kind === "pdf") await exportTemplatePDF(tpl);
      else await exportTemplateDOCX(tpl);
      toast.success(kind === "pdf" ? "PDF изтеглен" : "DOCX изтеглен");
    } catch (e: any) {
      toast.error("Грешка при изтегляне", { description: String(e?.message ?? e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2.5 py-0.5 text-foreground/90 transition-colors hover:border-gold/60 hover:bg-gold/10 hover:text-gold"
      >
        <Eye className="h-3 w-3" />
        {name}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-serif">{tpl.title}</DialogTitle>
            <DialogDescription>
              Бланка – темплейт за попълване на ръка или след сваляне.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border/60 bg-navy-light/30 p-4 text-sm">
            {tpl.intro && (
              <p className="mb-3 whitespace-pre-wrap text-muted-foreground">{tpl.intro}</p>
            )}
            {tpl.sections.map((s, i) => (
              <div key={i} className="mb-3">
                {s.heading && (
                  <h4 className="mb-1 font-serif text-sm font-bold text-gold">{s.heading}</h4>
                )}
                <p className="whitespace-pre-wrap text-foreground/90">{s.body}</p>
              </div>
            ))}
            {tpl.closing && (
              <p className="mt-4 whitespace-pre-wrap border-t border-border/40 pt-3 text-muted-foreground">
                {tpl.closing}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              onClick={() => handle("pdf")}
              disabled={!!busy}
              className="bg-gradient-gold text-navy hover:shadow-gold"
            >
              {busy === "pdf" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              PDF
            </Button>
            <Button
              onClick={() => handle("docx")}
              disabled={!!busy}
              variant="outline"
              className="border-gold/40 hover:bg-gold/10 hover:text-gold"
            >
              {busy === "docx" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              DOCX
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
