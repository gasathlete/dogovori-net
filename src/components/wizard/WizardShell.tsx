/**
 * Shared chrome around any wizard flow:
 *  - <Header />
 *  - Sticky breadcrumb + progress strip
 *  - Optional blank-template download bar
 *  - Optional blank-download progress modal
 *
 * Used by WizardGraph today; intended adoption by legacy Wizard / WizardBilingual.
 */

import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Check, Download, FileSearch, Loader2,
  Search, ShieldCheck,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export interface WizardShellProgress {
  stepIdx: number;
  total: number;
}

export interface WizardShellProps {
  sectorTitle?: string;
  docName: string;
  progress: WizardShellProgress;
  children: ReactNode;
  blankDownload?: {
    onClick: () => void;
    downloading: boolean;
    step: number;
  };
}

const todayLabel = () =>
  new Date().toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric" });

const blankSteps = () => [
  { icon: ShieldCheck, label: "Проверка на сигурността на IP адреса…" },
  { icon: Search, label: "Подготовка на правната бланка…" },
  { icon: FileSearch, label: `Проверка за липсващи клаузи и реквизити към дата ${todayLabel()}…` },
  { icon: Download, label: "Бланката ще бъде свалена до 10 секунди…" },
];

export function WizardShell({
  sectorTitle, docName, progress, children, blankDownload,
}: WizardShellProps) {
  const navigate = useNavigate();
  const total = Math.max(progress.total, 1);
  const pct = Math.round(((progress.stepIdx + 1) / total) * 100);

  // While the blank-download modal is open, lock body scroll so it stays
  // anchored to the current viewport (especially on mobile, where scrolling
  // would otherwise push the modal out of view).
  const isDownloading = !!blankDownload?.downloading;
  useEffect(() => {
    if (!isDownloading) return;
    const prevOverflow = document.body.style.overflow;
    const prevTop = document.body.style.top;
    const prevPosition = document.body.style.position;
    const prevWidth = document.body.style.width;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
  }, [isDownloading]);

  return (
    <div className="min-h-screen">
      <Header />

      {blankDownload?.downloading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-gold/30 bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
              <h3 className="font-serif text-lg text-foreground">Подготвяме бланката…</h3>
            </div>
            <ul className="space-y-2.5">
              {blankSteps().map((s, i) => {
                const Icon = s.icon;
                const active = i === blankDownload.step;
                const done = i < blankDownload.step;
                return (
                  <li
                    key={i}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                      active ? "bg-gold/10 text-foreground"
                        : done ? "text-muted-foreground"
                        : "text-muted-foreground/60"
                    }`}
                  >
                    {done ? <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                      : active ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gold" />
                      : <Icon className="h-4 w-4 shrink-0" />}
                    <span>{s.label}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Свалянето ще започне автоматично.
            </p>
          </div>
        </div>
      )}

      <div className="sticky top-16 z-30 border-b border-border/60 bg-navy/90 backdrop-blur-xl">
        <div className="container py-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-gold"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Сектори
              </button>
              {sectorTitle && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className="font-medium text-foreground">{sectorTitle}</span>
                </>
              )}
              <span className="hidden text-muted-foreground sm:inline">·</span>
              <span className="hidden font-serif italic text-gold sm:inline">{docName}</span>
            </div>
            <div className="text-muted-foreground">
              Секция {progress.stepIdx + 1} от {total}
            </div>
          </div>
          <Progress value={pct} className="h-1.5 bg-secondary" />
        </div>
      </div>

      {blankDownload && (
        <div className="border-b border-border/40 bg-card/30">
          <div className="container flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="text-xs text-muted-foreground">
              Нужна Ви е само празна бланка за разпечатване?
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={blankDownload.onClick}
              disabled={blankDownload.downloading}
              className="border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
            >
              {blankDownload.downloading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-4 w-4" />
              )}
              Изтегли празна бланка (.docx)
            </Button>
          </div>
        </div>
      )}

      <main className="container py-6 md:py-8">{children}</main>
    </div>
  );
}
