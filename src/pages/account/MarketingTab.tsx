import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Megaphone, FileDown, Save, Trash2, Plus, Lock, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBranding } from "@/hooks/useBranding";
import { resolveBrandingForUser } from "@/lib/branding/resolve";
import {
  MARKETING_TEMPLATES,
  getMarketingTemplate,
  type MarketingItem,
  type MarketingTemplate,
} from "@/lib/marketing/templates";
import {
  emptyItem,
  itemsTotal,
  marketingTitle,
  renderMarketingDocument,
  type MarketingValues,
} from "@/lib/marketing/render";
import { fmtEur } from "@/lib/pricing";
import { Link } from "react-router-dom";

interface SavedRow {
  id: string;
  title: string;
  template_key: string;
  payload: MarketingValues;
  updated_at: string;
}

export default function MarketingTab() {
  const { user } = useAuth();
  const { unlocked, loading: brandingLoading } = useBranding();
  const [rows, setRows] = useState<SavedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tpl, setTpl] = useState<MarketingTemplate | null>(null);
  const [values, setValues] = useState<MarketingValues>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("marketing_documents")
      .select("id, title, template_key, payload, updated_at")
      .order("updated_at", { ascending: false });
    setRows((data ?? []) as unknown as SavedRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const startNew = (t: MarketingTemplate) => {
    setTpl(t);
    setEditingId(null);
    setValues(t.hasItems ? { items: [emptyItem()] } : {});
  };

  const openSaved = (row: SavedRow) => {
    const t = getMarketingTemplate(row.template_key);
    if (!t) return;
    setTpl(t);
    setEditingId(row.id);
    setValues(row.payload ?? {});
  };

  const setField = (key: string, v: MarketingValues[string]) =>
    setValues((s) => ({ ...s, [key]: v }));

  const items: MarketingItem[] = Array.isArray(values.items) ? (values.items as MarketingItem[]) : [];
  const setItems = (next: MarketingItem[]) => setField("items", next);

  const save = async () => {
    if (!tpl || !user) return;
    setBusy(true);
    try {
      const title = marketingTitle(tpl, values);
      if (editingId) {
        const { error } = await supabase
          .from("marketing_documents")
          .update({ title, payload: values as never })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("marketing_documents")
          .insert({ user_id: user.id, template_key: tpl.key, title, payload: values as never })
          .select("id")
          .single();
        if (error) throw error;
        setEditingId(data.id);
      }
      toast.success("Материалът е запазен.");
      await load();
    } catch {
      toast.error("Запазването не бе успешно.");
    } finally {
      setBusy(false);
    }
  };

  const download = async (format: "pdf" | "docx") => {
    if (!tpl || !user) return;
    setBusy(true);
    try {
      const doc = renderMarketingDocument(tpl, values);
      const branding = await resolveBrandingForUser(user.id).catch(() => null);
      if (format === "pdf") {
        const { exportPDF } = await import("@/lib/exporters.pdf");
        await exportPDF(doc, { branding });
      } else {
        const { exportDOCX } = await import("@/lib/exporters.docx");
        await exportDOCX(doc, { branding });
      }
    } catch {
      toast.error("Свалянето не бе успешно.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await supabase.from("marketing_documents").delete().eq("id", id);
    if (editingId === id) {
      setTpl(null);
      setEditingId(null);
    }
    await load();
  };

  if (brandingLoading) return <p className="text-sm text-muted-foreground">Зареждане…</p>;

  if (!unlocked) {
    return (
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" /> Рекламни материали
          </CardTitle>
          <CardDescription>
            Изготвяйте оферти, предложения, проформи и ценоразписи по готови шаблони — с вашето
            лого, колонтитули и стил.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/account?tab=branding">Отключи Персонално брандиране</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (tpl) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setTpl(null)} className="mb-1 -ml-2">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Всички материали
            </Button>
            <h2 className="text-lg font-semibold">{tpl.name}</h2>
            <p className="text-sm text-muted-foreground">{tpl.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void save()}>
              <Save className="mr-1.5 h-4 w-4" /> Запази
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void download("docx")}>
              <FileDown className="mr-1.5 h-4 w-4" /> DOCX
            </Button>
            <Button disabled={busy} onClick={() => void download("pdf")}>
              <FileDown className="mr-1.5 h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
            {tpl.fields.map((f) => {
              if (f.type === "items") {
                return (
                  <div key={f.key} className="space-y-3 sm:col-span-2">
                    <Label>{f.label}</Label>
                    {items.map((it, idx) => (
                      <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_80px_80px_110px_40px]">
                        <Input
                          placeholder="Описание"
                          value={it.description}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...it, description: e.target.value };
                            setItems(next);
                          }}
                        />
                        <Input
                          type="number"
                          min={0}
                          value={it.qty}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...it, qty: Number(e.target.value) };
                            setItems(next);
                          }}
                        />
                        <Input
                          value={it.unit}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...it, unit: e.target.value };
                            setItems(next);
                          }}
                        />
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={it.unitPrice}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...it, unitPrice: Number(e.target.value) };
                            setItems(next);
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <Button variant="outline" size="sm" onClick={() => setItems([...items, emptyItem()])}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Добави ред
                      </Button>
                      <span className="text-sm font-medium">Общо: {fmtEur(itemsTotal(items))}</span>
                    </div>
                  </div>
                );
              }
              const value = typeof values[f.key] === "string" ? (values[f.key] as string) : "";
              const wide = f.type === "textarea" || f.type === "list";
              return (
                <div key={f.key} className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
                  <Label>
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </Label>
                  {wide ? (
                    <Textarea
                      rows={f.type === "list" ? 4 : 5}
                      placeholder={f.placeholder}
                      value={value}
                      onChange={(e) => setField(f.key, e.target.value)}
                    />
                  ) : (
                    <Input
                      type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                      placeholder={f.placeholder}
                      value={value}
                      onChange={(e) => setField(f.key, e.target.value)}
                    />
                  )}
                  {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Megaphone className="h-4 w-4 text-primary" /> Рекламни материали
        </h2>
        <p className="text-sm text-muted-foreground">
          Готови шаблони за оферти и предложения — с вашето лого и стил на форматиране.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MARKETING_TEMPLATES.map((t) => (
          <button
            key={t.key}
            onClick={() => startNew(t)}
            className="rounded-lg border p-4 text-left transition hover:border-primary/60 hover:bg-accent/40"
          >
            <div className="font-medium">{t.name}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
          </button>
        ))}
      </div>

      <Separator />

      <div>
        <h3 className="mb-3 text-sm font-medium">Моите материали</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Зареждане…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Още нямате запазени материали.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    <Badge variant="secondary" className="mr-2">
                      {getMarketingTemplate(r.template_key)?.name ?? r.template_key}
                    </Badge>
                    {new Date(r.updated_at).toLocaleDateString("bg-BG")}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => openSaved(r)}>
                    Отвори
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
