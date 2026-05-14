import { useEffect, useState } from "react";
import { Loader2, Upload, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type TeamRow = {
  id: string;
  name: string;
  logo_url: string | null;
  brand_color: string | null;
  signature_data_url: string | null;
  signature_name: string | null;
  letterhead_enabled: boolean;
  company_eik: string | null;
  company_vat: string | null;
  company_address: string | null;
  company_mol: string | null;
  company_email: string | null;
  company_phone: string | null;
  company_website: string | null;
};

export function TeamBranding({ teamId, isAdmin }: { teamId: string; isAdmin: boolean }) {
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("teams")
        .select("id, name, logo_url, brand_color, signature_data_url, signature_name, letterhead_enabled, company_eik, company_vat, company_address, company_mol, company_email, company_phone, company_website")
        .eq("id", teamId).maybeSingle();
      setTeam(data as TeamRow | null);
    })();
  }, [teamId]);

  if (!team) return <div className="rounded-2xl border border-border/60 bg-gradient-card p-6"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>;

  const update = (patch: Partial<TeamRow>) => setTeam({ ...team, ...patch });

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("teams").update({
      logo_url: team.logo_url, brand_color: team.brand_color,
      signature_data_url: team.signature_data_url, signature_name: team.signature_name,
      letterhead_enabled: team.letterhead_enabled,
      company_eik: team.company_eik, company_vat: team.company_vat,
      company_address: team.company_address, company_mol: team.company_mol,
      company_email: team.company_email, company_phone: team.company_phone,
      company_website: team.company_website,
    }).eq("id", teamId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Брандингът е запазен");
  };

  const onUploadLogo = async (file: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Макс. 2 MB"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${teamId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("team-assets").upload(path, file, { upsert: true });
    if (error) { setUploading(false); toast.error(error.message); return; }
    const { data: pub } = supabase.storage.from("team-assets").getPublicUrl(path);
    update({ logo_url: pub.publicUrl });
    setUploading(false);
    toast.success("Лого е качено – не забравяйте да запазите.");
  };

  const lookupEik = async () => {
    if (!team.company_eik || !/^\d{9}(\d{4})?$/.test(team.company_eik)) {
      toast.error("Въведете валиден 9- или 13-цифрен ЕИК"); return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("lookup-eik", { body: { eik: team.company_eik } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (data?.ok && data.data) {
      update({
        company_vat: team.company_vat || data.data.vat_number || null,
        company_address: team.company_address || data.data.address || null,
        company_mol: team.company_mol || data.data.mol || null,
      });
      if (data.data.name && !team.name) {
        toast.info(`Намерено име: ${data.data.name}`);
      }
      toast.success("Данните са попълнени");
    } else {
      toast.message(data?.error || "Не намерихме данни – попълнете ръчно");
      if (data?.suggested?.vat_number && !team.company_vat) update({ company_vat: data.suggested.vat_number });
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-card p-6 space-y-6">
      <div>
        <h2 className="font-serif text-xl font-bold">Брандинг и фирмени данни</h2>
        <p className="mt-1 text-xs text-muted-foreground">Логото, цветът и фирмените данни се прилагат върху всички документи на екипа.</p>
      </div>

      {!isAdmin && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">Само администратор може да променя брандинга.</p>}

      <fieldset disabled={!isAdmin || busy} className="space-y-6">
        {/* Лого */}
        <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
          <div className="flex h-[120px] w-[120px] items-center justify-center rounded-lg border border-border/60 bg-background/50 overflow-hidden">
            {team.logo_url ? <img src={team.logo_url} alt="Лого" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">Лого</span>}
          </div>
          <div className="space-y-2">
            <Label>Лого на фирмата (PNG/JPG, до 2 MB)</Label>
            <div className="flex items-center gap-2">
              <Input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(e) => e.target.files?.[0] && onUploadLogo(e.target.files[0])} disabled={uploading} />
              {uploading && <Loader2 className="h-4 w-4 animate-spin text-gold" />}
            </div>
            {team.logo_url && <Button variant="ghost" size="sm" onClick={() => update({ logo_url: null })}>Премахни</Button>}
          </div>
        </div>

        {/* Brand color */}
        <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
          <div>
            <Label>Основен цвят</Label>
            <div className="mt-2 flex items-center gap-2">
              <Input type="color" value={team.brand_color || "#c9a84c"} onChange={(e) => update({ brand_color: e.target.value })} className="h-10 w-16 p-1" />
              <Input value={team.brand_color || ""} onChange={(e) => update({ brand_color: e.target.value })} placeholder="#c9a84c" />
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-3 rounded-lg border border-border/60 px-4 py-3">
              <Switch checked={team.letterhead_enabled} onCheckedChange={(v) => update({ letterhead_enabled: v })} />
              <div>
                <div className="text-sm font-medium">Letterhead на документи</div>
                <div className="text-xs text-muted-foreground">Лого + фирмени данни в горната част на PDF</div>
              </div>
            </div>
          </div>
        </div>

        {/* Фирмени данни + ЕИК lookup */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>ЕИК / БУЛСТАТ</Label>
            <div className="flex gap-2">
              <Input value={team.company_eik || ""} onChange={(e) => update({ company_eik: e.target.value })} placeholder="123456789" />
              <Button type="button" variant="outline" onClick={lookupEik}>Справка</Button>
            </div>
          </div>
          <div>
            <Label>ДДС №</Label>
            <Input value={team.company_vat || ""} onChange={(e) => update({ company_vat: e.target.value })} placeholder="BG123456789" />
          </div>
          <div className="sm:col-span-2">
            <Label>Седалище / Адрес</Label>
            <Input value={team.company_address || ""} onChange={(e) => update({ company_address: e.target.value })} />
          </div>
          <div>
            <Label>МОЛ / Управител</Label>
            <Input value={team.company_mol || ""} onChange={(e) => update({ company_mol: e.target.value })} />
          </div>
          <div>
            <Label>Имейл за контакт</Label>
            <Input type="email" value={team.company_email || ""} onChange={(e) => update({ company_email: e.target.value })} />
          </div>
          <div>
            <Label>Телефон</Label>
            <Input value={team.company_phone || ""} onChange={(e) => update({ company_phone: e.target.value })} />
          </div>
          <div>
            <Label>Уебсайт</Label>
            <Input value={team.company_website || ""} onChange={(e) => update({ company_website: e.target.value })} placeholder="https://" />
          </div>
        </div>

        {/* Подпис */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Име за подпис (по подразбиране)</Label>
            <Input value={team.signature_name || ""} onChange={(e) => update({ signature_name: e.target.value })} placeholder="Иван Иванов, управител" />
          </div>
          <div>
            <Label>Подпис (data URL на изображение)</Label>
            <Input type="file" accept="image/png" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              if (f.size > 500 * 1024) { toast.error("Макс. 500 KB"); return; }
              const reader = new FileReader();
              reader.onload = () => update({ signature_data_url: String(reader.result) });
              reader.readAsDataURL(f);
            }} />
          </div>
          {team.signature_data_url && (
            <div className="sm:col-span-2 flex items-center gap-3">
              <img src={team.signature_data_url} alt="Подпис" className="h-16 rounded border border-border/60 bg-background/50 px-3" />
              <Button variant="ghost" size="sm" onClick={() => update({ signature_data_url: null })}>Премахни</Button>
            </div>
          )}
        </div>

        {/* Letterhead preview */}
        {team.letterhead_enabled && (
          <div className="rounded-lg border-2 border-dashed border-border/60 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Преглед на letterhead</div>
            <div className="flex items-start justify-between gap-4 border-b-2 pb-3" style={{ borderColor: team.brand_color || "#c9a84c" }}>
              {team.logo_url && <img src={team.logo_url} alt="" className="h-14 object-contain" />}
              <div className="text-right text-xs leading-tight">
                <div className="font-bold text-sm" style={{ color: team.brand_color || undefined }}>{team.name}</div>
                {team.company_eik && <div>ЕИК: {team.company_eik}{team.company_vat ? ` · ДДС: ${team.company_vat}` : ""}</div>}
                {team.company_address && <div>{team.company_address}</div>}
                {(team.company_email || team.company_phone) && <div>{[team.company_email, team.company_phone].filter(Boolean).join(" · ")}</div>}
              </div>
            </div>
          </div>
        )}

        <Button onClick={save} disabled={busy} className="bg-gradient-gold text-navy">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Запази брандинга
        </Button>
      </fieldset>
    </div>
  );
}
