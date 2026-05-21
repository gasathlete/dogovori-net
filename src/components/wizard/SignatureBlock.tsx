import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pen, Upload, Trash2, Lock, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { LegalDisclaimer } from "@/components/LegalDisclaimer";

export interface SignatureData {
  /** Печатно име отдолу — винаги се попълва */
  name_a: string;
  name_b: string;
  city: string;
  date: string;
  /** Само Pro: дигитално изображение на подписа (data URL) */
  image_a?: string;
  image_b?: string;
}

interface Props {
  isPro: boolean;
  defaultPartyA?: string;
  defaultPartyB?: string;
  value: SignatureData;
  onChange: (v: SignatureData) => void;
}

export function SignatureBlock({ isPro, defaultPartyA, defaultPartyB, value, onChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [drawingFor, setDrawingFor] = useState<"a" | "b" | null>(null);
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Hidrate defaults
  useEffect(() => {
    if (!value.name_a && defaultPartyA) onChange({ ...value, name_a: defaultPartyA });
    if (!value.name_b && defaultPartyB) onChange({ ...value, name_b: defaultPartyB });
    if (!value.date) onChange({ ...value, date: new Date().toLocaleDateString("bg-BG") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPartyA, defaultPartyB]);

  // Pull saved signature for Pro user
  useEffect(() => {
    if (!isPro || !user) return;
    supabase
      .from("profiles")
      .select("signature_data_url, signature_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.signature_data_url) setSavedSig(data.signature_data_url);
      });
  }, [isPro, user]);

  const handleUseSaved = (which: "a" | "b") => {
    if (!savedSig) return;
    onChange({ ...value, [which === "a" ? "image_a" : "image_b"]: savedSig });
  };

  const handleClear = (which: "a" | "b") => {
    onChange({ ...value, [which === "a" ? "image_a" : "image_b"]: undefined });
  };

  const handleUpload = (which: "a" | "b", file: File) => {
    if (file.size > 1024 * 1024) {
      toast.error("Файлът е твърде голям (макс. 1MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      onChange({ ...value, [which === "a" ? "image_a" : "image_b"]: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleSaveToProfile = async (dataUrl: string) => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ signature_data_url: dataUrl, signature_name: value.name_a })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) toast.error("Грешка при запазване");
    else {
      setSavedSig(dataUrl);
      toast.success("Подписът е запазен в профила");
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-card p-6 shadow-soft">
      <h3 className="mb-1 font-serif text-lg font-bold">Подпис на договора</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        {isPro
          ? "Pro режим: можете да нарисувате или качите дигитален подпис, който ще се вгради в PDF/DOCX."
          : "Въведете имената на страните, града и датата. За дигитален подпис надградете до Pro."}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs">Град</Label>
          <Input
            value={value.city}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
            placeholder="Напр. София"
          />
        </div>
        <div>
          <Label className="text-xs">Дата</Label>
          <Input
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
            placeholder="дд.мм.гггг"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {(["a", "b"] as const).map((side) => {
          const nameKey = side === "a" ? "name_a" : "name_b";
          const imgKey = side === "a" ? "image_a" : "image_b";
          const img = value[imgKey];
          return (
            <div key={side} className="rounded-lg border border-border/50 p-3">
              <Label className="text-xs uppercase tracking-wider text-gold">
                Страна {side === "a" ? "А" : "Б"}
              </Label>
              <Input
                className="mt-1"
                value={value[nameKey]}
                onChange={(e) => onChange({ ...value, [nameKey]: e.target.value })}
                placeholder="Имена / наименование"
              />

              {isPro ? (
                <div className="mt-3">
                  {img ? (
                    <div className="relative rounded-md border border-border/50 bg-white p-2">
                      <img src={img} alt="Подпис" className="mx-auto h-16 object-contain" />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleClear(side)}
                        className="absolute right-1 top-1 h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      {!savedSig && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSaveToProfile(img)}
                          disabled={savingProfile}
                          className="mt-1 h-7 w-full text-[10px]"
                        >
                          {savingProfile ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                          Запази в профила
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => setDrawingFor(side)} className="flex-1 text-xs">
                        <Pen className="mr-1 h-3 w-3" /> Нарисувай
                      </Button>
                      <label className="flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && handleUpload(side, e.target.files[0])}
                        />
                        <Button size="sm" variant="outline" asChild className="w-full text-xs">
                          <span><Upload className="mr-1 h-3 w-3" /> Качи</span>
                        </Button>
                      </label>
                      {savedSig && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUseSaved(side)}
                          className="w-full border-gold/40 text-xs hover:bg-gold/10"
                        >
                          Използвай запазения
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate("/account?tab=subscription")}
                  className="mt-3 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-gold/40 px-2 py-2 text-[11px] text-muted-foreground hover:bg-gold/5 hover:text-gold"
                >
                  <Lock className="h-3 w-3" /> Дигитален подпис — Pro
                </button>
              )}
            </div>
          );
        })}
      </div>

      {drawingFor && (
        <SignaturePadModal
          onSave={(dataUrl) => {
            const which = drawingFor;
            onChange({ ...value, [which === "a" ? "image_a" : "image_b"]: dataUrl });
            setDrawingFor(null);
          }}
          onClose={() => setDrawingFor(null)}
        />
      )}
    </div>
  );
}

function SignaturePadModal({ onSave, onClose }: { onSave: (d: string) => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0c1e3d";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const t = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: ((t.clientX - r.left) * c.width) / r.width, y: ((t.clientY - r.top) * c.height) / r.height };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
  };
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  };
  const end = () => setDrawing(false);

  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const save = () => {
    const c = canvasRef.current!;
    onSave(c.toDataURL("image/png"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border/60 bg-card p-5 shadow-elegant"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-serif text-base font-bold">Нарисувайте подписа си</h3>
        <p className="mb-3 text-xs text-muted-foreground">Използвайте мишка или пръст върху бялото поле.</p>
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full rounded-md border border-border/60 bg-white touch-none"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        <div className="mt-3 flex justify-between gap-2">
          <Button variant="ghost" onClick={clear}>Изчисти</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Отказ</Button>
            <Button onClick={save} disabled={!hasInk} className="bg-gradient-gold text-navy">Запази</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
