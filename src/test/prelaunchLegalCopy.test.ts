/**
 * Публичните правни твърдения трябва да останат доказуеми: без категорични
 * гаранции за приемане пред институции, без blanket арбитраж, с точното
 * разграничение по чл. 25 eIDAS и с коректен език за обработващите.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ_ITEMS } from "@/data/faqItems";

const allText = FAQ_ITEMS.map((i) => `${i.q} ${i.a}`).join("\n");

describe("FAQ — премахнати категорични твърдения", () => {
  it("няма гаранция за валидност пред НАП, съд и нотариус", () => {
    expect(allText).not.toContain("са валидни за подаване пред НАП");
    expect(allText).not.toMatch(/Всички шаблони[^.]*валидни/);
  });

  it("няма твърдение, че всички шаблони са съобразени с действащото право", () => {
    expect(allText).not.toContain("Всички шаблони са съобразени с действащото");
  });

  it("арбитражът не е представен като подразбираща се клауза", () => {
    expect(allText).not.toContain("по избор на страните.");
    expect(allText).toMatch(/арбитражно споразумение/);
  });

  it("няма твърдение за несподеляне с трети лица, а език за обработващи", () => {
    expect(allText).not.toContain("Не споделяме съдържанието");
    expect(allText).toMatch(/обработващи/);
    expect(allText).toContain("подизпълнителите по обработването (подпроцесори)");
    expect(allText).not.toContain("подобработващи");
    expect(allText).toContain("/privacy");
  });

  it("разграничението по чл. 25 eIDAS е налице и QES не е приравнен на SES", () => {
    expect(allText).toContain("чл. 25, § 2");
    expect(allText).not.toContain("чл. 25, ал. 2");
    expect(allText).toMatch(/квалифицираният електронен подпис \(QES\)/);
    expect(allText).toContain("не е доставчик на квалифицирани удостоверителни услуги");
    expect(allText).not.toMatch(/Подписването в браузър[^.]*е SES/);
    expect(allText).not.toMatch(/Прост, усъвършенстван и квалифициран електронен подпис имат правна сила/);
  });
});

describe("правни връзки", () => {
  it("политиката за AI сочи към съществуващия маршрут /legal/model-routing", () => {
    const page = readFileSync("src/pages/legal/AIProcessingPolicy.tsx", "utf8");
    expect(page).not.toContain("/legal/model-routing-policy");
    expect(page).toContain('href="/legal/model-routing"');
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain('path="/legal/model-routing"');
  });

  it("всеки маршрут, споменат във FAQ, съществува в App.tsx", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const routes = [...new Set(allText.match(/\/[a-z0-9-]+(?:\/[a-z0-9-]+)*/g) ?? [])]
      .filter((r) => r.startsWith("/privacy") || r.startsWith("/legal/"));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(app, `липсва маршрут ${route}`).toContain(`path="${route}"`);
    }
  });
});

describe("миграция 0028 — маркетингът е изричен opt-in", () => {
  const sql = readFileSync(
    "drizzle/migrations/0028_marketing_explicit_opt_in_consent_events.sql",
    "utf8",
  );

  it("добавя идемпотентен ключ за събитие", () => {
    expect(sql).toContain("consent_event_id");
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*user_id, consent_type, consent_event_id/);
  });

  it("получателите се филтрират по последно granted = true", () => {
    expect(sql).toMatch(/admin_list_marketing_recipients/);
    expect(sql).toMatch(/admin_send_campaign_topic/);
    expect(sql.match(/= true/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(sql).not.toMatch(/granted\s*=\s*false\s*\)\s*IS NULL/);
  });

  it("админ списъкът връща тристойностен статус", () => {
    expect(sql).toContain("marketing_status");
    expect(sql).toContain("'opt_in'");
    expect(sql).toContain("'opt_out'");
    expect(sql).toContain("'unknown'");
  });

  it("запазва staff проверката, search_path и правата", () => {
    expect(sql).toContain("is_staff(auth.uid())");
    expect(sql).toContain("SET search_path TO 'public'");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_list_users(text, integer) TO authenticated");
  });

  it("не пренаписва история на съгласията", () => {
    expect(sql).not.toMatch(/DELETE FROM public\.user_consents/i);
    expect(sql).not.toMatch(/UPDATE public\.user_consents/i);
  });

  it("е огледален в supabase/migrations", () => {
    const mirror = readFileSync(
      "supabase/migrations/20260920073000_marketing_explicit_opt_in_consent_events.sql",
      "utf8",
    );
    expect(mirror).toBe(sql);
  });
});
