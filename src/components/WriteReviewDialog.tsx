import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, Loader2, Camera, X } from "@/icons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const BUCKET = "home-testimonials";

const schema = z.object({
  name: z.string().trim().min(2, "Името е задължително").max(80),
  role: z.string().trim().max(80).optional(),
  quote: z
    .string()
    .trim()
    .min(10, "Мнението трябва да е поне 10 символа")
    .max(600, "Мнението е твърде дълго (max 600)"),
  rating: z.number().int().min(1).max(5),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
}

export function WriteReviewDialog({ open, onOpenChange, onSubmitted }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [quote, setQuote] = useState("");
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName(""); setRole(""); setQuote(""); setRating(5);
      setPhoto(null); setPhotoPreview(null);
    }
  }, [open]);

  const handleFile = (file: File | null) => {
    if (!file) { setPhoto(null); setPhotoPreview(null); return; }
    if (!file.type.startsWith("image/")) {
      toast.error("Моля, качете изображение");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Максимален размер: 5 MB");
      return;
    }
    setPhoto(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!user) {
      toast.error("Моля, влезте в профила си, за да оставите ревю");
      onOpenChange(false);
      navigate("/auth");
      return;
    }
    if (!photo) {
      toast.error("Моля, добавете снимка — тя е задължителна");
      return;
    }
    const parsed = schema.safeParse({ name, role: role || undefined, quote, rating });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Невалидни данни");
      return;
    }

    setBusy(true);
    try {
      const ext = (photo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
      const key = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, photo, {
        cacheControl: "3600",
        upsert: false,
        contentType: photo.type,
      });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("home_testimonials").insert({
        user_id: user.id,
        name: parsed.data.name,
        role: parsed.data.role ?? null,
        quote: parsed.data.quote,
        rating: parsed.data.rating,
        photo_url: key,
        is_approved: false,
        is_admin_added: false,
      });
      if (insErr) throw insErr;

      toast.success("Благодарим! Вашето ревю е изпратено за преглед.");
      onOpenChange(false);
      onSubmitted?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Възникна грешка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Напишете ревю</DialogTitle>
          <DialogDescription>
            Споделете своя опит с Договори.нет. Ревюто ще бъде публикувано след преглед от екипа.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">Оценка</Label>
            <div
              className="flex items-center gap-1"
              onMouseLeave={() => setHoverRating(null)}
              role="radiogroup"
              aria-label="Оценка"
            >
              {[1, 2, 3, 4, 5].map((n) => {
                const active = (hoverRating ?? rating) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} от 5`}
                    onMouseEnter={() => setHoverRating(n)}
                    onClick={() => setRating(n)}
                    className="rounded p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    <Star
                      className={`h-7 w-7 transition-colors ${active ? "fill-gold text-gold drop-shadow-[0_0_6px_hsl(var(--gold)/0.45)]" : "text-muted-foreground/40"}`}
                      strokeWidth={active ? 0 : 1.5}
                    />
                  </button>
                );
              })}
              <span className="ml-2 text-sm text-muted-foreground">{rating}/5</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="rev-name">Име</Label>
              <Input id="rev-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Иван Петров" />
            </div>
            <div>
              <Label htmlFor="rev-role">Роля / компания (незадължително)</Label>
              <Input id="rev-role" value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} placeholder="Юрист, ХХХ ООД" />
            </div>
          </div>

          <div>
            <Label htmlFor="rev-quote">Вашето мнение</Label>
            <Textarea
              id="rev-quote"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              maxLength={600}
              rows={4}
              placeholder="Какво харесахте? Как ви помогна платформата?"
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">{quote.length}/600</div>
          </div>

          <div>
            <Label className="mb-2 block">
              Снимка <span className="text-destructive">*</span>
              <span className="ml-1 text-xs font-normal text-muted-foreground">(задължителна)</span>
            </Label>
            {photoPreview ? (
              <div className="relative inline-block">
                <img src={photoPreview} alt="Preview" className="h-24 w-24 rounded-full border border-hairline object-cover" />
                <button
                  type="button"
                  onClick={() => handleFile(null)}
                  className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
                  aria-label="Премахни снимката"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-full border-2 border-dashed border-hairline text-xs text-muted-foreground transition-colors hover:border-gold/60 hover:text-foreground"
              >
                <Camera className="h-5 w-5" />
                Качете
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Отказ</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Изпрати ревю
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
