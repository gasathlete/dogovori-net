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

describe("Hero — едно основно действие към /start", () => {
  const src = read("src/components/Hero.tsx");

  it("основният CTA е реален Link към /start и за анонимни, и за влезли", () => {
    expect(src).toContain('to="/start"');
    expect(src).toContain("Започни документ");
    expect(src).toContain('trackFunnelEvent("home_primary_cta_clicked"');
    expect(src).toContain('destination: "/start"');
  });

  it("има само едно златно (primary) действие", () => {
    expect(src.match(/btn-gold/g)?.length ?? 0).toBe(1);
  });

  it("„Виж как работи“ отваря демо стори, не навигира", () => {
    expect(src).toContain("Виж как работи");
    expect(src).toContain("openStartStory");
    expect(src).toContain('trackFunnelEvent("home_demo_story_opened"');
  });

  it("вторичното ROI действие е запазено", () => {
    expect(src).toContain("Виж колко спестяваш");
  });

  it("няма onStart prop, нито мъртъв TeaserDialog", () => {
    expect(src).not.toMatch(/onStart/);
    expect(src).not.toMatch(/TeaserDialog|teaserOpen/);
  });

  it("trust линията е без изтекли обещания за 5 операции", () => {
    expect(src).toContain("Старт без регистрация");
    expect(src).not.toContain("5 безплатни операции");
  });
});

describe("Index — премахната мъртва plumbing", () => {
  const src = read("src/pages/Index.tsx");
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

  it("финалният CTA е „Започни документ“ към /start с source:\"cta\"", () => {
    expect(src).toContain('const START_HREF = "/start"');
    expect(src).toContain("Започни документ");
    expect(src).toContain('trackFunnelEvent("story_cta_click", { target: "start", source })');
    expect(src).toContain('goToStart("cta")');
  });

  it("входът пази намерението /start", () => {
    expect(src).toContain('const LOGIN_HREF = "/auth?redirect=%2Fstart"');
  });

  it("затварянето никога не навигира", () => {
    const closeFn = src.slice(src.indexOf("const close = useCallback"), src.indexOf("const goToStart"));
    expect(closeFn).not.toContain("navigate(");
  });

  it("отвъд последната карта goto не навигира", () => {
    expect(src).toContain("if (nextIdx >= total) return;");
  });
});

describe("Template — създаването на документ е без auth гейт", () => {
  const src = read("src/pages/Template.tsx");

  it("hero / content / footer CTA-тата не викат requireAuth", () => {
    for (const marker of [
      "Изготви за 3 минути",
      "Изготви документа сега",
      "Започни сега",
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

  it("микрокопието е еднакво и за шаблони с, и без готов текст", () => {
    expect(src.match(/Старт без регистрация · преглед преди плащане/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
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
