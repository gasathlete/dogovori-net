import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Star, Trash2, CheckCircle2, Plus, Camera, X } from "@/icons";

type Row = {
  id: string;
  user_id: string | null;
  name: string;
  role: string | null;
  quote: string;
  rating: number;
  photo_url: string;
  is_approved: boolean;
  is_admin_added: boolean;
  position: number;
  created_at: string;
};

const BUCKET = "home-testimonials";

async function resolvePhotoSrc(photo_url: string): Promise<string> {
  if (/^https?:\/\//i.test(photo_url)) return photo_url;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(photo_url, 60 * 60);
  return data?.signedUrl ?? "";
}

function StarRow({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${n}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={i < n ? "h-4 w-4 fill-gold text-gold" : "h-4 w-4 text-muted-foreground/40"}
          strokeWidth={i < n ? 0 : 1.5}
        />
      ))}
    </div>
  );
}

function AddTestimonialDialog({
  open, onOpenChange, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [quote, setQuote] = useState("");
  const [rating, setRating] = useState(5);
  const [position, setPosition] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName(""); setRole(""); setQuote(""); setRating(5); setPosition(0);
      setPhoto(null); setPreview(null);
    }
  }, [open]);

  const handleFile = (f: File | null) => {
    if (!f) { setPhoto(null); setPreview(null); return; }
    if (!f.type.startsWith("image/")) { toast.error("Само изображения"); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error("Max 5 MB"); return; }
    setPhoto(f);
    const r = new FileReader();
    r.onload = () => setPreview(String(r.result));
    r.readAsDataURL(f);
  };

  const save = async () => {
    if (!user || !photo) { toast.error("Име, мнение и снимка са задължителни"); return; }
    if (name.trim().length < 2 || quote.trim().length < 10) { toast.error("Проверете полетата"); return; }
    setBusy(true);
    try {
      const ext = (photo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
      const key = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, photo, {
        cacheControl: "3600", upsert: false, contentType: photo.type,
      });
      if (upErr) throw upErr;

      const { error } = await supabase.from("home_testimonials").insert({
        user_id: user.id,
        name: name.trim(),
        role: role.trim() || null,
        quote: quote.trim(),
        rating,
        photo_url: key,
        is_approved: true,
        is_admin_added: true,
        position,
      });
      if (error) throw error;

      toast.success("Мнението е публикувано");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Грешка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ново мнение (админ)</DialogTitle>
          <DialogDescription>
            Публикува се веднага. Използвайте за seed/marketing мнения.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Име</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>
            <div>
              <Label>Роля / компания</Label>
              <Input value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} />
            </div>
          </div>
          <div>
            <Label>Мнение</Label>
            <Textarea rows={4} value={quote} onChange={(e) => setQuote(e.target.value)} maxLength={600} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Оценка</Label>
              <div className="mt-1 flex items-center gap-1">
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" onClick={() => setRating(n)}>
                    <Star className={n <= rating ? "h-6 w-6 fill-gold text-gold" : "h-6 w-6 text-muted-foreground/40"} strokeWidth={n <= rating ? 0 : 1.5} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Приоритет (по-високо = напред)</Label>
              <Input type="number" value={position} onChange={(e) => setPosition(parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <Label>Снимка *</Label>
            <div className="mt-1">
              {preview ? (
                <div className="relative inline-block">
                  <img src={preview} alt="" className="h-20 w-20 rounded-full border border-hairline object-cover" />
                  <button type="button" onClick={() => handleFile(null)} className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"><X className="h-3 w-3" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-hairline text-muted-foreground hover:border-gold/60">
                  <Camera className="h-5 w-5" />
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Отказ</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Публикувай</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminHomeTestimonialsPage() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [srcs, setSrcs] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  const load = async () => {
    setBusy(true);
    let q = supabase.from("home_testimonials").select("*").order("position", { ascending: false }).order("created_at", { ascending: false });
    if (filter === "pending") q = q.eq("is_approved", false);
    if (filter === "approved") q = q.eq("is_approved", true);
    const { data, error } = await q;
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const list = (data as Row[]) ?? [];
    setRows(list);

    // resolve signed URLs
    const map: Record<string, string> = {};
    await Promise.all(list.map(async (r) => { map[r.id] = await resolvePhotoSrc(r.photo_url); }));
    setSrcs(map);
  };

  useEffect(() => { if (allowed) load(); }, [allowed, filter]); // eslint-disable-line

  const approve = async (id: string) => {
    const { error } = await supabase.from("home_testimonials").update({ is_approved: true }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Одобрено");
    load();
  };
  const unapprove = async (id: string) => {
    const { error } = await supabase.from("home_testimonials").update({ is_approved: false }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Скрито");
    load();
  };
  const del = async (row: Row) => {
    if (!confirm("Изтриване на мнението?")) return;
    if (!/^https?:\/\//i.test(row.photo_url)) {
      await supabase.storage.from(BUCKET).remove([row.photo_url]);
    }
    const { error } = await supabase.from("home_testimonials").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Изтрито");
    load();
  };
  const setPos = async (id: string, position: number) => {
    const { error } = await supabase.from("home_testimonials").update({ position }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  if (loading || allowed === null) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-dvh">
        <Header />
        <div className="container py-20 text-center">
          <h1 className="mb-2 text-2xl font-bold">Достъп отказан</h1>
          <Button asChild variant="outline"><Link to="/">Към начало</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <div className="container py-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="sm"><Link to="/admin"><ArrowLeft className="mr-1 h-4 w-4" /> Админ</Link></Button>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Star className="h-7 w-7 fill-gold text-gold" strokeWidth={0} />
            Мнения на началната страница
          </h1>
          <Button className="ml-auto" onClick={() => setAddOpen(true)}><Plus className="mr-1 h-4 w-4" /> Ново мнение</Button>
        </div>

        <div className="mb-4 flex gap-2">
          {(["pending", "approved", "all"] as const).map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
              {f === "pending" ? "Чакащи" : f === "approved" ? "Публикувани" : "Всички"}
            </Button>
          ))}
        </div>

        {busy ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">Няма мнения в тази категория.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-hairline bg-card p-5">
                <div className="mb-3 flex items-start gap-3">
                  {srcs[r.id] ? (
                    <img src={srcs[r.id]} alt={r.name} className="h-14 w-14 rounded-full border border-hairline object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded-full border border-hairline bg-muted" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{r.name}</span>
                      {r.is_approved ? (
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Публикувано</Badge>
                      ) : (
                        <Badge variant="outline">Чака</Badge>
                      )}
                      {r.is_admin_added && <Badge variant="outline">Админ</Badge>}
                    </div>
                    {r.role && <div className="text-xs text-muted-foreground">{r.role}</div>}
                    <div className="mt-1"><StarRow n={r.rating} /></div>
                  </div>
                </div>
                <p className="mb-3 text-sm leading-relaxed">„{r.quote}"</p>
                <div className="flex items-center gap-2 border-t border-hairline pt-3">
                  {r.is_approved ? (
                    <Button size="sm" variant="outline" onClick={() => unapprove(r.id)}>Скрий</Button>
                  ) : (
                    <Button size="sm" onClick={() => approve(r.id)}><CheckCircle2 className="mr-1 h-4 w-4" />Одобри</Button>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>Ред:</span>
                    <Input
                      type="number"
                      className="h-7 w-16"
                      defaultValue={r.position}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value) || 0;
                        if (v !== r.position) setPos(r.id, v);
                      }}
                    />
                  </div>
                  <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => del(r)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("bg-BG")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddTestimonialDialog open={addOpen} onOpenChange={setAddOpen} onSaved={load} />
    </div>
  );
}
