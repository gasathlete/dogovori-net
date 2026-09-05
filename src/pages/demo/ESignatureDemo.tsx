import { Link } from "react-router-dom";
import { FREE_OFFER_RULE } from "@/lib/pricing";
import { FileSignature, CheckCircle2, ShieldCheck, Clock, Users, ArrowRight, Download, Sparkles } from "@/icons";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";

const SIGNERS = [
  { name: "Иван Петров", role: "Възложител", email: "ivan@example.bg", at: "17.06.2026 · 10:14", ip: "85.130.x.x" },
  { name: "Maria García", role: "Contractor", email: "maria@contractor.es", at: "17.06.2026 · 12:48", ip: "91.126.x.x" },
  { name: "Адв. Стоянова", role: "Свидетел", email: "lawyer@kantora.bg", at: "17.06.2026 · 13:02", ip: "78.83.x.x" },
];

const STEPS = [
  { icon: FileSignature, title: "1. Изберете подписващи", desc: "Добавете имейли и ред на подписване. До 10 страни в един envelope." },
  { icon: Clock, title: "2. Изпратете покана", desc: "Всеки получава защитен линк. Напомняния се изпращат автоматично." },
  { icon: Users, title: "3. Подписване с КЕП или OTP", desc: "Подкрепяме квалифициран електронен подпис (eIDAS) и OTP през SMS/имейл." },
  { icon: ShieldCheck, title: "4. Заключен PDF + одит", desc: "Финален PDF с timestamp, hash и пълна одит-следа — приемлива в съда." },
];

export default function ESignatureDemo() {
  const { user } = useAuth();
  const primaryHref = user ? "/console/signing?autostart=new" : "/auth?redirect=/console/signing";
  const primaryLabel = user ? "Стартирай envelope сега" : "Започни електронен подпис";
  return (
    <div className="min-h-dvh bg-background">
      <Seo
        title="Електронен подпис · Пример за успешно подписан договор — Dogovori.net"
        description="Вижте как работи многостранното електронно подписване в DogovaryAI — съвместимо с eIDAS, с пълна одит-следа и заключен PDF."
        canonical="/demo/e-signature"
      />
      <Header />
      <main className="container max-w-5xl py-10 sm:py-14">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> Пример · Успешно подписан документ
        </div>
        <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">
          Електронен подпис — <span className="text-accent-gradient">валиден в целия ЕС</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Подпишете договор от телефон или лаптоп. Многостранно подписване, одит-следа, timestamp,
          хеш на документа — съответствие с Регламент (ЕС) № 910/2014 (eIDAS).
        </p>

        <section className="mt-10 overflow-hidden rounded-2xl border border-emerald-500/30 bg-card/50">
          <div className="flex items-center justify-between gap-3 border-b border-emerald-500/30 bg-emerald-500/10 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <div>
                <div className="font-serif text-base font-bold">Договор за услуги — подписан</div>
                <div className="text-[11px] text-muted-foreground">Envelope #DGV-2026-001847 · Финализиран на 17.06.2026, 13:02 EET</div>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
            >
              <Download className="h-3.5 w-3.5" /> Подписан PDF
            </button>
          </div>

          <div className="p-5 sm:p-7">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Подписващи</h2>
            <ul className="mt-3 space-y-2">
              {SIGNERS.map((s) => (
                <li key={s.email} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {s.role}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{s.email} · IP {s.ip}</div>
                  </div>
                  <div className="text-right">
                    <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Подписан
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{s.at}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Hash (SHA-256)</div>
                <div className="mt-1 font-mono text-[11px] break-all text-foreground/80">a4f1…c9e2…71b8</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Timestamp (RFC 3161)</div>
                <div className="mt-1 text-xs">17.06.2026 13:02:14 UTC+3</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Съответствие</div>
                <div className="mt-1 text-xs">eIDAS · GDPR · ЗЕДЕП</div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-serif text-2xl font-bold">Как работи процесът</h2>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2">
            {STEPS.map((s) => (
              <li key={s.title} className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-4">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
                  <s.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-serif text-base font-bold">{s.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-10 rounded-xl border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent p-6 text-center">
          <h2 className="font-serif text-2xl font-bold">
            {user ? "Стартирайте envelope в Workspace-а" : "Подпишете първия си документ днес"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {user ? "Един клик — отива в /console/signing със стартиран нов envelope." : `Безплатен профил след регистрация: ${FREE_OFFER_RULE}. Без карта.`}
          </p>
          <Link
            to={primaryHref}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-gold px-6 py-3 text-sm font-semibold text-navy"
          >
            {user && <Sparkles className="h-4 w-4" />} {primaryLabel} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
      <SeoFooter />
    </div>
  );
}
