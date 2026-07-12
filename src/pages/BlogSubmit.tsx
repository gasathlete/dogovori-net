import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchQuotaCached } from "@/hooks/useQuota";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Crown, ArrowLeft, Upload } from "@/icons";
import { toast } from "sonner";

const CATEGORIES = [
  "Договорно право",
  "Трудово право",
  "Търговско право",
  "Имоти",
  "Семейно право",
  "Данъци",
  "GDPR / Защита на данните",
  "Електронна търговия",
  "Защита на потребителите",
  "Финанси и заеми",
  "Интелектуална собственост",
  "Други",
];

export default function BlogSubmit() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [summary, setSummary] = useState("");
  const [intro, setIntro] = useState("");
  const [sections, setSections] = useState<{ heading: string; body: string }[]>([{ heading: "", body: "" }]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) { setIsPro(null); return; }
    fetchQuotaCached(user.id).then((data) => {
      const pro = data?.plan === "pro" || (!!data?.pro_until && new Date(data.pro_until) > new Date());
      setIsPro(pro);
    });
  }, [user?.id]);

  const wordCount = (() => {
    const text = [intro, ...sections.map((s) => `${s.heading} ${s.body}`)].join(" ");
    return (text.match(/\S+/g) ?? []).length;
  })();

  const onImage = (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Изображението е над 5 MB."); return; }
    if (!file.type.startsWith("image/")) { toast.error("Файлът не е изображение."); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const submit = async () => {
    if (!user) return;
    if (!imageFile && !imagePreview) { toast.error("Качете изображение."); return; }
    if (wordCount < 300) { toast.error(`Статията трябва да е поне 300 думи (има ${wordCount}).`); return; }

    setSubmitting(true);

    let imageUrl = imagePreview;
    try {
      if (imageFile) {
        setUploading(true);
        const ext = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("user-articles")
          .upload(path, imageFile, { contentType: imageFile.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("user-articles").getPublicUrl(path);
        imageUrl = pub.publicUrl;
        setUploading(false);
      }

      const { data, error } = await supabase.functions.invoke("submit-user-article", {
        body: {
          title, category, summary, imageUrl, intro,
          sections: sections.filter((s) => s.heading.trim() && s.body.trim()),
          faq: [], takeaways: [],
        },
      });
      if (error) throw error;
      if ((data as any)?.error) {
        const details = (data as any).details?.join("\n") ?? (data as any).error;
        toast.error(details);
        setSubmitting(false);
        return;
      }
      toast.success("Статията е изпратена за одобрение.");
      navigate("/blog");
    } catch (e: any) {
      toast.error(e.message ?? "Грешка при изпращане.");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  if (authLoading) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-dvh bg-background">
        <Header />
        <div className="container py-20 text-center">
          <h1 className="mb-3 font-serif text-2xl font-bold">Необходим е акаунт</h1>
          <p className="mb-5 text-muted-foreground">Влезте, за да публикувате статия.</p>
          <Button asChild><Link to="/auth?redirect=/blog/submit">Вход</Link></Button>
        </div>
      </div>
    );
  }

  if (isPro === false) {
    return (
      <div className="min-h-dvh bg-background">
        <Header />
        <div className="container py-20 text-center">
          <Crown className="mx-auto mb-4 h-10 w-10 text-gold" />
          <h1 className="mb-3 font-serif text-2xl font-bold">Само за Pro потребители</h1>
          <p className="mb-5 text-muted-foreground">Публикуването на статии в блога е достъпно с Pro абонамент.</p>
          <Button asChild><Link to="/account">Към плановете</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <Seo title="Публикувай статия | Dogovori.net Блог" description="Споделете експертна юридическа статия в блога на Dogovori.net." canonical="/blog/submit" />
      <Header />
      <main className="container max-w-3xl py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4"><Link to="/blog"><ArrowLeft className="mr-1 h-4 w-4" /> Към блога</Link></Button>
        <h1 className="font-serif text-3xl font-bold">Публикувай статия</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Изисквания: правна тема, минимум 300 думи, задължително изображение. Статията минава през модерация.
        </p>

        <div className="mt-8 space-y-6">
          <div>
            <Label htmlFor="title">Заглавие</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Напр. Как да защитим правата си при онлайн покупка" />
          </div>

          <div>
            <Label>Категория</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="summary">Кратко резюме (30–250 знака)</Label>
            <Textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={250} rows={2} />
            <p className="mt-1 text-xs text-muted-foreground">{summary.length}/250</p>
          </div>

          <div>
            <Label>Изображение (задължително)</Label>
            <div className="mt-2 flex items-start gap-4">
              <label className="flex h-32 w-48 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border/60 bg-card/30 text-muted-foreground hover:border-gold/50">
                {imagePreview ? (
                  <img loading="lazy" decoding="async" src={imagePreview} alt="preview" className="h-full w-full rounded-lg object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-xs"><Upload className="h-5 w-5" /> Качи</div>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onImage(e.target.files?.[0] ?? null)} />
              </label>
              {imagePreview && <Button variant="ghost" size="sm" onClick={() => { setImageFile(null); setImagePreview(""); }}>Премахни</Button>}
            </div>
          </div>

          <div>
            <Label htmlFor="intro">Въведение</Label>
            <Textarea id="intro" value={intro} onChange={(e) => setIntro(e.target.value)} rows={5} placeholder="2-3 параграфа..." />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Секции</Label>
              <Button variant="outline" size="sm" onClick={() => setSections([...sections, { heading: "", body: "" }])}>
                <Plus className="mr-1 h-3 w-3" /> Добави секция
              </Button>
            </div>
            <div className="space-y-4">
              {sections.map((s, i) => (
                <div key={i} className="rounded-lg border border-border/50 bg-card/30 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Секция {i + 1}</span>
                    {sections.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setSections(sections.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={s.heading}
                    onChange={(e) => {
                      const c = [...sections]; c[i] = { ...c[i], heading: e.target.value }; setSections(c);
                    }}
                    placeholder="Заглавие на секцията"
                    className="mb-2"
                  />
                  <Textarea
                    value={s.body}
                    onChange={(e) => {
                      const c = [...sections]; c[i] = { ...c[i], body: e.target.value }; setSections(c);
                    }}
                    rows={6} placeholder="Текст на секцията..."
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-card/30 p-4">
            <span className="text-sm">
              Думи: <strong className={wordCount >= 300 ? "text-emerald-500" : "text-destructive"}>{wordCount}</strong> / 300 минимум
            </span>
            <Button onClick={submit} disabled={submitting || uploading || wordCount < 300 || !title || !summary || (!imageFile && !imagePreview)}>
              {(submitting || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Изпрати за одобрение
            </Button>
          </div>
        </div>
      </main>
      <SeoFooter />
    </div>
  );
}
