/**
 * P2 conversion / activation — регресионни тестове.
 *
 * Целта е един и същ инвариант навсякъде: СЪЗДАВАНЕТО на документ никога не е
 * зад регистрация, никой таймер не навигира вместо потребителя, а измерването
 * записва правилната страница и правилните събития.
 *
 * Повечето проверки са source-level, защото гейтовете и таймерите са именно
 * структурни свойства на файловете (липса на requireAuth, липса на idle таймер).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Hero — едно основно действие към безплатното начало", () => {
  const src = read("src/components/Hero.tsx");

  it("основният CTA е реален Link към /catalog и за анонимни, и за влезли", () => {
    expect(src).toContain('action="/catalog"');
    expect(src).toContain("Намерете документ");
    expect(src).toContain('trackFunnelEvent("home_primary_cta_clicked"');
    expect(src).toContain('destination: "/catalog"');
  });

  it("има само едно златно (primary) действие", () => {
    expect(src.match(/btn-gold/g)?.length ?? 0).toBe(1);
  });

  it("„Вижте как работи“ отваря демо стори, не навигира", () => {
    expect(src).toContain("Вижте как работи");
    expect(src).toContain("openStartStory");
    expect(src).toContain('trackFunnelEvent("home_demo_story_opened"');
  });

  it("няма ROI действие и обещание за икономия в hero-а", () => {
    expect(src).not.toContain("Вижте колко спестявате");
    expect(src).not.toContain("RoiDialog");
    expect(src).not.toContain("спестявате");
  });

  it("второстепенните връзки водят към създаване и качване", () => {
    expect(src).toContain('to="/build"');
    expect(src).toContain("Изготвяне · В подготовка");
    expect(src).toContain('to="/analiz"');
    expect(src).toContain("Проверка · В подготовка");
  });

  it("няма onStart prop, нито мъртъв TeaserDialog", () => {
    expect(src).not.toMatch(/onStart/);
    expect(src).not.toMatch(/TeaserDialog|teaserOpen/);
  });

  it("под бутона стои само каноничното правило, без GDPR обещание", async () => {
    const { FREE_OFFER_RULE } = await import("@/lib/pricing");
    expect(FREE_OFFER_RULE.length).toBeGreaterThan(10);
    expect(src).not.toContain("FREE_OFFER_RULE");
    expect(src).not.toContain("Старт без регистрация");
    expect(src).not.toContain("GDPR");
    expect(src).not.toContain("5 безплатни операции");
  });
});

describe("Index — премахната мъртва plumbing", () => {
  const src = read("src/components/home/HomeSections.tsx");
  it("Hero се рендира без props и без startInterview", () => {
    expect(src).toContain("<Hero />");
    expect(src).not.toContain("startInterview");
  });
});

describe("StartStoryOverlay — опционално демо без автонавигация", () => {
  const src = read("src/components/funnel/StartStoryOverlay.tsx");

  it("няма idle таймер, idle прогрес или автоматично пренасочване", () => {
    expect(src).not.toContain("LAST_IDLE_MS");
    expect(src).not.toContain("idleProgress");
    expect(src).not.toContain("idleRafRef");
    expect(src).not.toContain("goToSignup");
    expect(src).not.toContain("SIGNUP_HREF");
  });

  it("финалът е регистрационно действие с безопасна дестинация /build", () => {
    expect(src).toContain('<RegistrationCTA source="story" destination="/build"');
  });

  it("затварянето никога не навигира", () => {
    const closeFn = src.slice(src.indexOf("const close = "), src.indexOf("return <Dialog"));
    expect(closeFn.length).toBeGreaterThan(0);
    expect(closeFn).not.toContain("navigate(");
  });

  it("отвъд последната карта goto не навигира", () => {
    expect(src).toContain("Math.min(SCENES.length - 1, next)");
  });
});

describe("Template — създаването на документ е без auth гейт", () => {
  const src = read("src/pages/Template.tsx");

  it("hero / content / footer CTA-тата не викат requireAuth", () => {
    for (const marker of [
      "Разгледайте подготовката за бланка",
      "Разгледайте подготовката",
    ]) {
      const idx = src.indexOf(marker);
      expect(idx, marker).toBeGreaterThan(-1);
      const around = src.slice(Math.max(0, idx - 400), idx);
      expect(around, marker).not.toContain("requireAuth");
    }
  });

  it("и трите позиции се проследяват", () => {
    expect(src).toContain('trackFunnelEvent("template_create_cta_clicked"');
    expect(src).toContain('trackCreateCta("hero")');
    expect(src).toContain('trackCreateCta("content")');
    expect(src).toContain('trackCreateCta("footer")');
  });

  it("гейтът остава само за комплект/профил", () => {
    const idx = src.indexOf("Добави в профила");
    const around = src.slice(Math.max(0, idx - 400), idx);
    expect(around).toContain("requireAuth");
  });

  it("не обещава работещо или безплатно генериране", () => {
    expect(src).not.toContain("Старт без регистрация · преглед преди плащане");
    expect(src).not.toContain("Изготви за 3 минути");
    expect(src).toContain("Новото генериране е в подготовка.");
  });
});

describe("/start — изборът на намерение не е начало на документ", () => {
  const src = read("src/pages/Start.tsx");

  it("не се вика trackDocStart", () => {
    expect(src).not.toContain("trackDocStart");
  });

  it("праща start_intent_selected със destination и requires_auth", () => {
    expect(src).toContain('trackFunnelEvent("start_intent_selected"');
    expect(src).toContain("requires_auth: needsAuth(intent)");
    expect(src).toContain("destination: intent.to");
  });

  it("праща start_scenario_selected за бързите сценарии", () => {
    expect(src).toContain('trackFunnelEvent("start_scenario_selected"');
    expect(src).toContain("scenario: s.id");
  });
});

describe("Истинският doc_start остава в wizard-а", () => {
  it("BuildContract продължава да отчита document_selected", () => {
    expect(read("src/pages/BuildContract.tsx")).toContain("trackDocStart");
  });
});

describe("Копирайт за безплатния план", () => {
  const files = [
    "src/pages/demo/RiskAnalysisDemo.tsx",
    "src/pages/demo/ESignatureDemo.tsx",
    "src/pages/demo/BilingualDemo.tsx",
    "src/components/BetaDisclaimerModal.tsx",
    "src/pages/ProcessStep.tsx",
    "src/pages/Start.tsx",
  ];
  it("няма голи твърдения за „5 безплатни операции“", () => {
    for (const f of files) expect(read(f), f).not.toContain("5 безплатни операции");
  });

  it("платеният входен пакет остава 5 операции / 2.90 €", async () => {
    const { ENTRY_PACK_CONFIG } = await import("@/lib/pricing");
    expect(ENTRY_PACK_CONFIG.ops).toBe(5);
    expect(ENTRY_PACK_CONFIG.eur).toBeCloseTo(2.9, 2);
  });
});

describe("funnel.ts — пътят се хваща синхронно", () => {
  const rows: Record<string, unknown>[] = [];

  beforeEach(() => {
    rows.length = 0;
    vi.resetModules();
  });

  it("записва страницата от момента на клика, не от момента на записа", async () => {
    // Записът във фунията е зад съгласие за аналитика (Stage 2a).
    vi.doMock("@/lib/analytics", () => ({
      getCategoryConsent: () => true,
      trackEvent: () => undefined,
    }));
    vi.doMock("@/integrations/supabase/client", () => ({

      supabase: {
        auth: {
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          getSession: () => Promise.resolve({ data: { session: null } }),
        },
        from: () => ({
          insert: (row: Record<string, unknown>) => {
            rows.push(row);
            return Promise.resolve({ error: null });
          },
        }),
      },
    }));

    const { trackFunnelEvent } = await import("@/lib/funnel");

    window.history.pushState({}, "", "/shablon/naem");
    trackFunnelEvent("template_create_cta_clicked", { slug: "naem", position: "hero" });
    // Навигацията се случва преди асинхронния запис да е стигнал до базата.
    window.history.pushState({}, "", "/wizard/imoti");

    await vi.waitFor(() => expect(rows.length).toBe(1));
    expect(rows[0].path).toBe("/shablon/naem");
  });
});
