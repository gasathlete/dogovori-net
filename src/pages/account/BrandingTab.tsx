import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Palette, Upload, Save, Lock, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBranding } from "@/hooks/useBranding";
import { ACCENT_PALETTE } from "@/lib/branding/defaults";
import type { BrandingSettings } from "@/lib/branding/types";
import {
  brandingAssetPreviewUrl,
  removeBrandingAsset,
  uploadBrandingAsset,
  validateBrandingAsset,
  type BrandingAssetKind,
} from "@/lib/branding/storage";
import { invalidateResolvedBranding } from "@/lib/branding/resolve";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { fmtEur } from "@/lib/pricing";

const BRANDING_PRICE_EUR = 29;

function AssetField({
  label,
  hint,
  path,
  kind,
  onChange,
}: {
  label: string;
  hint: string;
  path: string | null;
  kind: BrandingAssetKind;
  onChange: (path: string | null) => void;
}) {
  const { user } = useAuth();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void brandingAssetPreviewUrl(path).then((url) => {
      if (alive) setPreview(url);
    });
    return () => {
      alive = false;
    };
  }, [path]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
          {preview ? (
            <img src={preview} alt={label} className="max-h-16 max-w-28 object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">няма</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file || !user) return;
                const err = validateBrandingAsset(file);
                if (err) {
                  toast.error(err);
                  return;
                }
                setBusy(true);
                try {
                  const newPath = await uploadBrandingAsset(user.id, kind, file);
                  onChange(newPath);
                  toast.success("Файлът е качен.");
                } catch {
                  toast.error("Качването не бе успешно.");
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Button asChild size="sm" variant="outline" disabled={busy}>
              <span>
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Качи
              </span>
            </Button>
          </label>
          {path && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await removeBrandingAsset(path).catch(() => undefined);
                onChange(null);
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Премахни
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function BrandingTab() {
  const { user } = useAuth();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const { unlocked, includedInPlan, settings, loading, saving, save, refresh } = useBranding();
  const [draft, setDraft] = useState<BrandingSettings>(settings);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(settings);
    setDirty(false);
  }, [settings]);

  const patch = <K extends keyof BrandingSettings>(key: K, value: Partial<BrandingSettings[K]>) => {
    setDraft((d) => ({ ...d, [key]: { ...(d[key] as object), ...(value as object) } as BrandingSettings[K] }));
    setDirty(true);
  };

  const previewHeader = useMemo(
    () =>
      [draft.header.companyName, draft.header.address, [draft.header.phone, draft.header.email].filter(Boolean).join(" · ")]
        .filter(Boolean),
    [draft.header],
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Зареждане…</p>;
  }

  if (!unlocked) {
    return (
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" /> Персонално брандиране
          </CardTitle>
          <CardDescription>
            Вашите документи излизат с фирмен колонтитул, лого, подпис и печат, избран шрифт и
            цветова тема — автоматично при всяко генериране.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>• Горен колонтитул с лого и фирмени данни</li>
            <li>• Долен колонтитул с номерация на страниците</li>
            <li>• Запазен подпис и печат в подписната част</li>
            <li>• Шрифт, размери, отстъпи и акцентен цвят</li>
            <li>• Шаблони за рекламни материали (оферти, предложения)</li>
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setCheckoutOpen(true)} disabled={!user}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Отключи еднократно за {fmtEur(BRANDING_PRICE_EUR)}
            </Button>
            <span className="text-xs text-muted-foreground">
              Включено безплатно в планове Предприемач и Екип.
            </span>
          </div>
        </CardContent>
        {checkoutOpen && user && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-lg border bg-card p-4 shadow-lg">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium">Персонално брандиране</span>
                <Button size="sm" variant="ghost" onClick={() => setCheckoutOpen(false)}>
                  Затвори
                </Button>
              </div>
              <StripeEmbeddedCheckout
                priceId="branding_unlock_once"
                quantity={1}
                customerEmail={user.email}
                userId={user.id}
                returnUrl={`${window.location.origin}/account?tab=branding&branding=success&session_id={CHECKOUT_SESSION_ID}`}
              />
            </div>
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Palette className="h-4 w-4 text-primary" /> Персонално брандиране
          </h2>
          <p className="text-sm text-muted-foreground">
            Стилът се прилага автоматично към всички бъдещи документи (PDF и DOCX).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {includedInPlan && <Badge variant="secondary">Включено в плана</Badge>}
          <Button
            disabled={!dirty || saving}
            onClick={async () => {
              try {
                await save(draft);
                invalidateResolvedBranding();
                setDirty(false);
                await refresh();
                toast.success("Стилът е запазен и ще се прилага към новите документи.");
              } catch {
                toast.error("Запазването не бе успешно.");
              }
            }}
          >
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "Запазване…" : "Приложи стил на форматиране"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Горен колонтитул */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Горен колонтитул</CardTitle>
                <Switch
                  checked={draft.header.enabled}
                  onCheckedChange={(v) => patch("header", { enabled: v })}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <AssetField
                label="Лого"
                hint="PNG, JPG, WebP или SVG до 2 MB."
                kind="logo"
                path={draft.header.logoPath}
                onChange={(p) => patch("header", { logoPath: p })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Фирма</Label>
                  <Input
                    value={draft.header.companyName}
                    onChange={(e) => patch("header", { companyName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>ЕИК</Label>
                  <Input value={draft.header.eik} onChange={(e) => patch("header", { eik: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>ДДС №</Label>
                  <Input
                    value={draft.header.vatNumber}
                    onChange={(e) => patch("header", { vatNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Адрес</Label>
                  <Input value={draft.header.address} onChange={(e) => patch("header", { address: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Телефон</Label>
                  <Input value={draft.header.phone} onChange={(e) => patch("header", { phone: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Имейл</Label>
                  <Input value={draft.header.email} onChange={(e) => patch("header", { email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Уебсайт</Label>
                  <Input value={draft.header.website} onChange={(e) => patch("header", { website: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Подравняване</Label>
                  <Select
                    value={draft.header.align}
                    onValueChange={(v) => patch("header", { align: v as BrandingSettings["header"]["align"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Ляво</SelectItem>
                      <SelectItem value="center">Центрирано</SelectItem>
                      <SelectItem value="split">Лого ляво, данни дясно</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Разделителна линия</Label>
                  <Select
                    value={draft.header.rule}
                    onValueChange={(v) => patch("header", { rule: v as BrandingSettings["header"]["rule"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без</SelectItem>
                      <SelectItem value="thin">Тънка</SelectItem>
                      <SelectItem value="accent">Акцентна</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Повторение</Label>
                  <Select
                    value={draft.header.repeat}
                    onValueChange={(v) => patch("header", { repeat: v as BrandingSettings["header"]["repeat"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first">Само на първа страница</SelectItem>
                      <SelectItem value="all">На всички страници</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Височина на логото</Label>
                  <Select
                    value={String(draft.header.logoHeight)}
                    onValueChange={(v) => patch("header", { logoHeight: Number(v) as 24 | 32 | 40 })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24">Малко</SelectItem>
                      <SelectItem value="32">Средно</SelectItem>
                      <SelectItem value="40">Голямо</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Долен колонтитул */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Долен колонтитул</CardTitle>
                <Switch
                  checked={draft.footer.enabled}
                  onCheckedChange={(v) => patch("footer", { enabled: v })}
                />
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Първи ред</Label>
                <Input value={draft.footer.line1} onChange={(e) => patch("footer", { line1: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Втори ред</Label>
                <Input value={draft.footer.line2} onChange={(e) => patch("footer", { line2: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Номерация на страниците</Label>
                <Select
                  value={draft.footer.numbering}
                  onValueChange={(v) => patch("footer", { numbering: v as BrandingSettings["footer"]["numbering"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без</SelectItem>
                    <SelectItem value="short">1, 2, 3…</SelectItem>
                    <SelectItem value="full">Стр. 1 от N</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm">Показвай „Изготвено с Договори.нет“</span>
                <Switch
                  checked={draft.footer.showMadeWith}
                  onCheckedChange={(v) => patch("footer", { showMadeWith: v })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Подпис */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Подпис и печат</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <AssetField
                  label="Подпис"
                  hint="Прозрачен PNG изглежда най-добре."
                  kind="signature"
                  path={draft.signature.signaturePath}
                  onChange={(p) => patch("signature", { signaturePath: p })}
                />
                <AssetField
                  label="Печат"
                  hint="Поставя се в долния десен ъгъл на подписната част."
                  kind="stamp"
                  path={draft.signature.stampPath}
                  onChange={(p) => patch("signature", { stampPath: p })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Разположение</Label>
                  <Select
                    value={draft.signature.layout}
                    onValueChange={(v) => patch("signature", { layout: v as BrandingSettings["signature"]["layout"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="two-columns">Две колони</SelectItem>
                      <SelectItem value="left">Моят подпис вляво</SelectItem>
                      <SelectItem value="right">Моят подпис вдясно</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Размер на изображенията</Label>
                  <Select
                    value={draft.signature.assetSize}
                    onValueChange={(v) => patch("signature", { assetSize: v as BrandingSettings["signature"]["assetSize"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="s">Малък</SelectItem>
                      <SelectItem value="m">Среден</SelectItem>
                      <SelectItem value="l">Голям</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Надпис под линията</Label>
                  <Input
                    value={draft.signature.caption}
                    onChange={(e) => patch("signature", { caption: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                  <span className="text-sm">Показвай ред „Град, дата“</span>
                  <Switch
                    checked={draft.signature.showCityDate}
                    onCheckedChange={(v) => patch("signature", { showCityDate: v })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Тема и типография */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Тема, шрифт и форматиране</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Акцентен цвят</Label>
                <div className="flex flex-wrap gap-2">
                  {ACCENT_PALETTE.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      aria-label={`Цвят ${c.label}`}
                      title={c.label}
                      onClick={() => patch("theme", { accent: c.value })}
                      className={`h-8 w-8 rounded-full border-2 transition ${
                        draft.theme.accent.toLowerCase() === c.value.toLowerCase()
                          ? "border-foreground scale-110"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Фон</Label>
                  <Select
                    value={draft.theme.background}
                    onValueChange={(v) => patch("theme", { background: v as BrandingSettings["theme"]["background"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="white">Бял</SelectItem>
                      <SelectItem value="cream">Крем</SelectItem>
                      <SelectItem value="gray">Светло сив</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Шрифт</Label>
                  <Select
                    value={draft.typography.font}
                    onValueChange={(v) => patch("typography", { font: v as BrandingSettings["typography"]["font"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sans">Безсерифен</SelectItem>
                      <SelectItem value="serif">Серифен</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Основен размер</Label>
                  <Select
                    value={String(draft.typography.baseSize)}
                    onValueChange={(v) => patch("typography", { baseSize: Number(v) as 10 | 11 | 12 })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 pt</SelectItem>
                      <SelectItem value="11">11 pt</SelectItem>
                      <SelectItem value="12">12 pt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Размер на заглавията</Label>
                  <Select
                    value={String(draft.typography.headingSize)}
                    onValueChange={(v) => patch("typography", { headingSize: Number(v) as 12 | 14 | 16 })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12">12 pt</SelectItem>
                      <SelectItem value="14">14 pt</SelectItem>
                      <SelectItem value="16">16 pt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Междуредие</Label>
                  <Select
                    value={String(draft.formatting.lineHeight)}
                    onValueChange={(v) => patch("formatting", { lineHeight: Number(v) as 1 | 1.15 | 1.5 })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1.0</SelectItem>
                      <SelectItem value="1.15">1.15</SelectItem>
                      <SelectItem value="1.5">1.5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Полета на страницата</Label>
                  <Select
                    value={draft.formatting.margin}
                    onValueChange={(v) => patch("formatting", { margin: v as BrandingSettings["formatting"]["margin"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="narrow">Тесни</SelectItem>
                      <SelectItem value="normal">Нормални</SelectItem>
                      <SelectItem value="wide">Широки</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Подравняване на текста</Label>
                  <Select
                    value={draft.formatting.bodyAlign}
                    onValueChange={(v) => patch("formatting", { bodyAlign: v as BrandingSettings["formatting"]["bodyAlign"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="justify">Двустранно</SelectItem>
                      <SelectItem value="left">Ляво</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Заглавия</Label>
                  <Select
                    value={draft.formatting.headingAlign}
                    onValueChange={(v) => patch("formatting", { headingAlign: v as "left" | "center" })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Ляво</SelectItem>
                      <SelectItem value="center">Центрирани</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                  <span className="text-sm">Заглавия с главни букви</span>
                  <Switch
                    checked={draft.formatting.uppercaseHeadings}
                    onCheckedChange={(v) => patch("formatting", { uppercaseHeadings: v })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Преглед */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Преглед</CardTitle>
              <CardDescription>Ориентировъчен изглед на страницата.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-md border p-4 text-[11px] leading-relaxed"
                style={{
                  backgroundColor:
                    draft.theme.background === "cream"
                      ? "#FDFBF5"
                      : draft.theme.background === "gray"
                        ? "#F6F6F7"
                        : "#FFFFFF",
                  color: draft.theme.text,
                  fontFamily: draft.typography.font === "serif" ? "Georgia, serif" : "system-ui, sans-serif",
                }}
              >
                {draft.header.enabled && (
                  <div
                    className={
                      draft.header.align === "center" ? "text-center" : draft.header.align === "split" ? "text-right" : ""
                    }
                  >
                    {previewHeader.map((l, i) => (
                      <div key={i} className={i === 0 ? "font-semibold" : "opacity-70"}>
                        {l}
                      </div>
                    ))}
                    {draft.header.rule !== "none" && (
                      <div
                        className="my-2"
                        style={{
                          borderBottom: `${draft.header.rule === "accent" ? 2 : 1}px solid ${
                            draft.header.rule === "accent" ? draft.theme.accent : "#D4D4D8"
                          }`,
                        }}
                      />
                    )}
                  </div>
                )}
                <div
                  className={`${draft.formatting.headingAlign === "center" ? "text-center" : ""} font-semibold`}
                  style={{ fontSize: draft.typography.headingSize }}
                >
                  {draft.formatting.uppercaseHeadings ? "ДОГОВОР ЗА УСЛУГА" : "Договор за услуга"}
                </div>
                <div style={{ borderBottom: `2px solid ${draft.theme.accent}` }} className="my-2" />
                <p className={draft.formatting.bodyAlign === "justify" ? "text-justify" : ""}>
                  Днес, [дата], в [град], между страните се сключи настоящият договор при следните
                  условия…
                </p>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 gap-3 opacity-80">
                  <div>
                    <div className="mb-6 font-medium">ВЪЗЛОЖИТЕЛ</div>
                    <div className="border-t pt-1">{draft.signature.caption}</div>
                  </div>
                  <div>
                    <div className="mb-6 font-medium">ИЗПЪЛНИТЕЛ</div>
                    <div className="border-t pt-1">{draft.signature.caption}</div>
                  </div>
                </div>
                {draft.footer.enabled && (
                  <div className="mt-4 border-t pt-2 text-[10px] opacity-60">
                    {draft.footer.line1 && <div>{draft.footer.line1}</div>}
                    {draft.footer.line2 && <div>{draft.footer.line2}</div>}
                    {draft.footer.numbering !== "none" && (
                      <div className="text-right">{draft.footer.numbering === "short" ? "1" : "Стр. 1 от 1"}</div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
