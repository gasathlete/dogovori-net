/**
 * Админ панел за рекламното поле на началната страница: добавяне, спиране,
 * премахване и точна продължителност (таймер) на всяка реклама.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Megaphone, Plus, Trash2 } from "@/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type Ad = {
  id: string;
  title: string;
  excerpt: string | null;
  link: string;
  image_url: string | null;
  badge: string | null;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

const DURATIONS = [
  { label: "1 час", hours: 1 },
  { label: "24 часа", hours: 24 },
  { label: "7 дни", hours: 24 * 7 },
  { label: "30 дни", hours: 24 * 30 },
  { label: "Без край", hours: 0 },
] as const;

function remaining(endsAt: string | null, now: number): string {
  if (!endsAt) return "Без краен срок";
  const left = new Date(endsAt).getTime() - now;
  if (left <= 0) return "Изтекла";
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} д. ${h} ч.`;
  if (h > 0) return `${h} ч. ${m} мин.`;
  return `${m} мин. ${sec} сек.`;
}

export function AdminAdsPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [link, setLink] = useState("");
  const [badge, setBadge] = useState("");
  const [hours, setHours] = useState<number>(24 * 7);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("home_ad_slots")
      .select("id,title,excerpt,link,image_url,badge,is_active,starts_at,ends_at,created_at")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data as Ad[]) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const create = async () => {
    if (!title.trim()) return toast.error("Въведете заглавие");
    if (!link.trim()) return toast.error("Въведете адрес (например /blog/…)");
    setCreating(true);
    const ends = hours > 0 ? new Date(Date.now() + hours * 3600_000).toISOString() : null;
    const { error } = await supabase.from("home_ad_slots").insert({
      title: title.trim(),
      excerpt: excerpt.trim() || null,
      link: link.trim(),
      badge: badge.trim() || null,
      ends_at: ends,
      created_by: user?.id ?? null,
    });
    setCreating(false);
    if (error) return toast.error(error.message);
    toast.success("Рекламата е добавена");
    setTitle("");
    setExcerpt("");
    setLink("");
    setBadge("");
    load();
  };

  const toggle = async (ad: Ad) => {
    setBusyId(ad.id);
    const { error } = await supabase
      .from("home_ad_slots")
      .update({ is_active: !ad.is_active })
      .eq("id", ad.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    load();
  };

  const extend = async (ad: Ad, addHours: number) => {
    setBusyId(ad.id);
    const from = ad.ends_at && new Date(ad.ends_at).getTime() > Date.now()
      ? new Date(ad.ends_at).getTime()
      : Date.now();
    const { error } = await supabase
      .from("home_ad_slots")
      .update({ ends_at: new Date(from + addHours * 3600_000).toISOString() })
      .eq("id", ad.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Срокът е удължен");
    load();
  };

  const remove = async (ad: Ad) => {
    if (!confirm(`Премахване на „${ad.title}“?`)) return;
    setBusyId(ad.id);
    const { error } = await supabase.from("home_ad_slots").delete().eq("id", ad.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Премахната");
    load();
  };

  const liveCount = useMemo(
    () =>
      rows.filter(
        (r) => r.is_active && (!r.ends_at || new Date(r.ends_at).getTime() > now),
      ).length,
    [rows, now],
  );

  return (
    <section className="mt-10 rounded-xl border border-border bg-card p-5">
      <div className="mb-5 flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-gold" />
        <h2 className="text-lg font-semibold">Реклама на началната страница</h2>
        <Badge variant="outline" className="ml-auto">Активни: {liveCount}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <Label htmlFor="ad-title">Заглавие</Label>
            <Input id="ad-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label htmlFor="ad-excerpt">Извадка</Label>
            <Textarea id="ad-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={3} maxLength={400} />
          </div>
          <div>
            <Label htmlFor="ad-link">Адрес</Label>
            <Input id="ad-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/blog/dogovor-za-darenie" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ad-badge">Етикет (по избор)</Label>
              <Input id="ad-badge" value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="Реклама" maxLength={30} />
            </div>
            <div>
              <Label htmlFor="ad-duration">Продължителност</Label>
              <select
                id="ad-duration"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {DURATIONS.map((d) => (
                  <option key={d.label} value={d.hours}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
          <Button onClick={create} disabled={creating} className="min-h-[44px]">
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Добавяне
          </Button>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Зареждане…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Няма добавени реклами.</p>
          ) : (
            rows.map((ad) => {
              const expired = !!ad.ends_at && new Date(ad.ends_at).getTime() <= now;
              return (
                <div key={ad.id} className="rounded-lg border border-border/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{ad.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{ad.link}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{remaining(ad.ends_at, now)}</p>
                    </div>
                    <Badge variant={ad.is_active && !expired ? "outline" : "secondary"}>
                      {expired ? "Изтекла" : ad.is_active ? "Активна" : "Спряна"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={busyId === ad.id} onClick={() => toggle(ad)}>
                      {ad.is_active ? "Спиране" : "Пускане"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === ad.id} onClick={() => extend(ad, 24)}>
                      +24 ч.
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === ad.id} onClick={() => extend(ad, 24 * 7)}>
                      +7 дни
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === ad.id} onClick={() => remove(ad)}>
                      <Trash2 className="mr-1 h-4 w-4" /> Премахване
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

export default AdminAdsPanel;
