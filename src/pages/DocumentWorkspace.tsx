/**
 * DocumentWorkspace — split-view page that shows the parent contract on the
 * left and a linked document (appendix / annex / handover protocol / …) on
 * the right. The right panel starts empty with a "Generate document" CTA
 * that calls the `generate-linked-document` edge function using the parent
 * contract as context.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles, FileWarning } from "@/icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ContractPreview } from "@/components/wizard/ContractPreview";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  getLinkedDocSpec,
  type LinkedDocKind,
} from "@/lib/linked-document-kinds";
import type { GeneratedContract } from "@/lib/exporters";

interface ParentSnapshot {
  slug: string;
  contract: GeneratedContract;
}

function loadParent(slug: string): ParentSnapshot | null {
  try {
    const raw = sessionStorage.getItem(`workspace:parent:${slug}`);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.contract?.title) return null;
    return obj as ParentSnapshot;
  } catch {
    return null;
  }
}

export default function DocumentWorkspacePage() {
  const { slug = "", kind = "" } = useParams<{ slug: string; kind: string }>();
  const [search] = useSearchParams();
  const number = search.get("n") ?? "";
  const navigate = useNavigate();

  const spec = useMemo(() => getLinkedDocSpec(kind), [kind]);
  const [parent, setParent] = useState<ParentSnapshot | null>(() => loadParent(slug));
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [linked, setLinked] = useState<GeneratedContract | null>(null);

  useEffect(() => {
    if (!parent) setParent(loadParent(slug));
  }, [slug, parent]);

  useEffect(() => {
    document.title = spec
      ? `${spec.label} • Workspace • Договори.нет`
      : "Работно пространство • Договори.нет";
  }, [spec]);

  const handleGenerate = async () => {
    if (!spec || !parent) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-linked-document",
        {
          body: {
            kind: spec.kind,
            number,
            notes: notes.trim(),
            parent_slug: slug,
            parent_contract: parent.contract,
          },
        },
      );
      if (error) throw error;
      if (!data || data.error) {
        if (data?.requires_login) {
          toast.error(data.error);
          setTimeout(() => navigate("/auth"), 1000);
          return;
        }
        throw new Error(data?.error ?? "Неуспешно създаване");
      }
      const c = data.contract as GeneratedContract;
      setLinked(c);
      toast.success(`${spec.shortLabel} е готов`, {
        description: "Прегледайте текста и го редактирайте при нужда.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Възникна грешка", { description: msg });
    } finally {
      setGenerating(false);
    }
  };

  if (!spec) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <FileWarning className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 font-serif text-2xl font-bold">Непознат вид документ</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Видът „{kind}" не се поддържа в момента.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to={`/wizard-graph/${slug}/review`}>Обратно към договора</Link>
        </Button>
      </div>
    );
  }

  const Icon = spec.icon;

  return (
    <div className="min-h-dvh bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="flex-shrink-0"
          >
            <Link to={`/wizard-graph/${slug}/review`}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Обратно към договора</span>
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-muted-foreground">
              Работно пространство • свързан документ
            </div>
            <div className="truncate font-serif text-sm font-semibold sm:text-base">
              {parent?.contract.title ?? "Основен договор"}
              <span className="mx-2 text-muted-foreground">→</span>
              <span className="text-gold">
                {spec.label}
                {number ? ` №${number}` : ""}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Split panels */}
      <ResizablePanelGroup
        direction="horizontal"
        className="mx-auto min-h-[calc(100vh-64px)] max-w-[1600px] hidden md:flex"
      >
        <ResizablePanel defaultSize={50} minSize={30}>
          <div className="h-full overflow-y-auto p-4 lg:p-6">
            <PanelHeading title="Основен договор" muted />
            {parent ? (
              <div className="pointer-events-none opacity-95">
                <ContractPreview
                  contract={parent.contract}
                  onChange={() => {
                    /* read-only in workspace */
                  }}
                />
              </div>
            ) : (
              <EmptyParent slug={slug} />
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={50} minSize={30}>
          <div className="h-full overflow-y-auto p-4 lg:p-6">
            <PanelHeading
              title={
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-gold" />
                  {spec.label}
                  {number ? ` №${number}` : ""}
                </span>
              }
            />
            {linked ? (
              <ContractPreview contract={linked} onChange={setLinked} />
            ) : (
              <GeneratePanel
                spec={spec}
                notes={notes}
                setNotes={setNotes}
                onGenerate={handleGenerate}
                generating={generating}
                disabled={!parent}
              />
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Mobile stacked fallback */}
      <div className="md:hidden">
        <div className="border-b border-border/60 p-4">
          <PanelHeading title="Основен договор" muted />
          {parent ? (
            <div className="pointer-events-none opacity-95">
              <ContractPreview
                contract={parent.contract}
                onChange={() => {
                  /* read-only */
                }}
              />
            </div>
          ) : (
            <EmptyParent slug={slug} />
          )}
        </div>
        <div className="p-4">
          <PanelHeading
            title={
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-gold" />
                {spec.label}
                {number ? ` №${number}` : ""}
              </span>
            }
          />
          {linked ? (
            <ContractPreview contract={linked} onChange={setLinked} />
          ) : (
            <GeneratePanel
              spec={spec}
              notes={notes}
              setNotes={setNotes}
              onGenerate={handleGenerate}
              generating={generating}
              disabled={!parent}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PanelHeading({
  title,
  muted,
}: {
  title: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={`mb-3 text-xs font-semibold uppercase tracking-wider ${
        muted ? "text-muted-foreground" : "text-foreground"
      }`}
    >
      {title}
    </div>
  );
}

function EmptyParent({ slug }: { slug: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-8 text-center">
      <FileWarning className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">
        Основният договор не е намерен в текущата сесия. Върнете се и го
        генерирайте отново.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link to={`/wizard-graph/${slug}/review`}>Отвори договора</Link>
      </Button>
    </div>
  );
}

function GeneratePanel({
  spec,
  notes,
  setNotes,
  onGenerate,
  generating,
  disabled,
}: {
  spec: ReturnType<typeof getLinkedDocSpec>;
  notes: string;
  setNotes: (v: string) => void;
  onGenerate: () => void;
  generating: boolean;
  disabled: boolean;
}) {
  if (!spec) return null;
  const Icon = spec.icon;
  return (
    <div className="rounded-xl border border-gold/30 bg-gradient-to-br from-gold/5 via-card to-card p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-lg font-bold leading-tight">
            {spec.label}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{spec.description}</p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Допълнителни указания (по избор)
        </label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder='Напр. „Опис на движимо имущество в апартамента — легло, диван, хладилник…“ или „Анекс за удължаване на срока с 6 месеца“.'
          rows={4}
          className="resize-none"
        />
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] text-muted-foreground">
          Ще използва 1 операция от вашия лимит.
        </p>
        <Button
          onClick={onGenerate}
          disabled={generating || disabled}
          className="bg-gradient-gold text-navy hover:shadow-gold"
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Изготвяме документа…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Изготви документ
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
