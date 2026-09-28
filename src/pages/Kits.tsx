import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as Icons from "@/icons";
import { ArrowRight, Sparkles, Package } from "@/icons";
import { Header } from "@/components/Header";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { breadcrumbSchema } from "@/lib/jsonLd";
import { DOCUMENT_KITS, KIT_GROUPS, type DocumentKit } from "@/data/documentKits";
import { useAuth } from "@/hooks/useAuth";
import { listMyKits, type UserKit } from "@/lib/kits";
import corporateCover from "@/assets/kits/kit-corporate.jpg";
import realEstateCover from "@/assets/kits/kit-real-estate.jpg";
import employmentCover from "@/assets/kits/kit-employment.jpg";
import digitalCover from "@/assets/kits/kit-digital.jpg";
import ipCover from "@/assets/kits/kit-ip.jpg";
import familyCover from "@/assets/kits/kit-family.jpg";
import otherCover from "@/assets/kits/kit-other.jpg";

const KIT_COVERS: Record<DocumentKit["group"], string> = {
  corporate: corporateCover,
  real_estate: realEstateCover,
  employment: employmentCover,
  digital: digitalCover,
  ip: ipCover,
  family: familyCover,
  other: otherCover,
};

export default function KitsPage() {
  const [group, setGroup] = useState<DocumentKit["group"] | "all">("all");
  const { user } = useAuth();
  const [myKits, setMyKits] = useState<UserKit[]>([]);

  useEffect(() => {
    if (!user) { setMyKits([]); return; }
    void listMyKits(user.id).then(setMyKits);
  }, [user]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const visible = useMemo(
    () => (group === "all" ? DOCUMENT_KITS : DOCUMENT_KITS.filter((k) => k.group === group)),
    [group],
  );

  return (
    <>
      <Seo
        title="Готови комплекти документи | dogovori.net"
        description="Куратирани комплекти от свързани документи — от регистрация на ООД до наем, IP, GDPR и SaaS. Стартирайте целия пакет с един клик."
        canonical="https://dogovori.net/komplekti"
        jsonLd={breadcrumbSchema([
          { name: "Начало", url: "/" },
          { name: "Комплекти" },
        ])}
      />
      <Header />
      <main className="bg-background">
        {/* Hero */}
        <section className="border-b border-border/40">
          <div className="container py-12 sm:py-16 md:py-20">
            <div className="eyebrow mb-4">
              <span className="font-serif text-base font-normal tracking-normal text-gold/60">★</span>
              <span className="h-px w-6 bg-gold/40" />
              Комплекти
            </div>
            <h1 className="font-serif text-3xl font-bold leading-[1.1] text-balance sm:text-4xl md:text-5xl">
              Готови комплекти документи
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Сценарии от реалния бизнес — учредяване, наем, дигитални проекти, GDPR.
              Всеки комплект включва основния документ, неговите приложения и придружаващи документи,
              готови за изготвяне с един клик.
            </p>
          </div>
        </section>

        {/* Browsing remains open; creating or purchasing a new kit stays closed. */}
        <section className="border-b border-border/40 bg-card/40">
          <div className="container py-6">
            <div className="flex flex-col items-start gap-4 rounded-xl border border-gold/30 bg-gradient-to-br from-gold/[0.08] to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-gold" />
                  <h2 className="font-serif text-lg font-bold">Разгледайте комплекти по ситуация</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Вижте подредените етапи и наличните документи. Създаването на нов комплект ще бъде отключено при пускането.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="#kits-grid"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-background/40 px-4 py-2 text-sm font-semibold text-gold hover:bg-gold/10"
                >
                  Разгледай нашите <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
            <LaunchPurchaseBanner className="mt-4" source="kit_catalog" productId="kit_catalog" />
          </div>
        </section>

        {/* My in-progress kits */}
        {user && myKits.length > 0 && (
          <section className="border-b border-border/40 bg-card/40">
            <div className="container py-8">
              <div className="mb-4 flex items-center gap-2">
                <Package className="h-4 w-4 text-gold" />
                <h2 className="font-serif text-sm font-bold uppercase tracking-wider">
                  Моите комплекти ({myKits.length})
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {myKits.slice(0, 6).map((k) => (
                  <Link
                    key={k.id}
                    to={`/komplekti/moi/${k.id}`}
                    className="group rounded-lg border border-border/60 bg-card/70 p-4 transition-all hover:border-gold/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="line-clamp-1 text-sm font-medium text-foreground">{k.title}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-gold opacity-60 transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {k.status === "in_progress" ? "В процес" : k.status === "complete" ? "Завършен" : "Архив"}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Group filter */}
        <section className="container pt-10">
          <div className="flex flex-wrap gap-2">
            <FilterPill active={group === "all"} onClick={() => setGroup("all")}>
              Всички ({DOCUMENT_KITS.length})
            </FilterPill>
            {KIT_GROUPS.map((g) => {
              const count = DOCUMENT_KITS.filter((k) => k.group === g.id).length;
              return (
                <FilterPill key={g.id} active={group === g.id} onClick={() => setGroup(g.id)}>
                  {g.label} ({count})
                </FilterPill>
              );
            })}
          </div>
        </section>

        {/* Kits grid */}
        <section id="kits-grid" className="container py-10">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {visible.map((kit) => (
              <KitCard key={kit.id} kit={kit} />
            ))}
          </div>
        </section>
      </main>
      <SeoFooter />
    </>
  );
}

function FilterPill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "rounded-full border border-gold/50 bg-gold/15 px-4 py-1.5 text-xs font-semibold text-gold transition-colors"
          : "rounded-full border border-border/60 bg-card/40 px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-gold/30 hover:text-gold"
      }
    >
      {children}
    </button>
  );
}

function KitCard({ kit }: { kit: DocumentKit }) {
  const Icon = (Icons as any)[kit.icon] ?? Icons.Package;
  const cover = KIT_COVERS[kit.group];
  return (
    <Link
      to={`/komplekti/${kit.id}`}
      className="group relative isolate flex h-full flex-col overflow-hidden rounded-xl surface-elevated transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/45"
    >
      <div className="relative aspect-[16/9] overflow-hidden border-b border-border/50 bg-muted">
        <img
          src={cover}
          alt={`Корица на комплект „${kit.title}“`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.035]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/55 via-transparent to-transparent" />
      </div>
      {kit.featured && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-gold/50 bg-background/85 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-gold shadow-sm backdrop-blur-sm">
          <Sparkles className="h-2.5 w-2.5" /> ТОП
        </span>
      )}
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold/25 bg-gold/5 text-gold transition-all duration-200 group-hover:border-gold/50 group-hover:bg-gold/10">
            <Icon className="h-5 w-5" strokeWidth={1.6} />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/80">
            {kit.groupLabel}
          </p>
        </div>
        <h3 className="font-serif text-lg font-bold leading-snug text-foreground sm:text-xl">
          {kit.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {kit.shortDescription}
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {kit.items.slice(0, 3).map((it) => (
            <span
              key={it.docName}
              className="rounded-full border border-border/60 bg-card/60 px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {it.docName.length > 32 ? it.docName.slice(0, 30) + "…" : it.docName}
            </span>
          ))}
          {kit.items.length > 3 && (
            <span className="rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] text-gold">
              +{kit.items.length - 3}
            </span>
          )}
        </div>
        <div className="mt-auto pt-5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold opacity-80 transition-opacity group-hover:opacity-100">
            Виж комплекта
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
