import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ALL_POSTS, getPostBySlug, hasVerifiedSources, resolveDateModified } from "@/lib/blog";
import { BLOG_TOPICS } from "@/data/blogTopics";
import protocolContent from "@/data/templateContent/priemo-predavatelen-protokol";
import templateMeta from "@/data/templateContentMeta.json";

const RENT_SLUG = "kak-da-napravim-dogovor-za-naem";
const FIRE_SLUG = "predizvestie-uvolnenie";

const RENT_SOURCES = [
  "https://justice.government.bg/home/normdoc/2121934337",
  "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
];
const FIRE_SOURCES = [
  "https://www.justice.government.bg/home/normdoc/1594373121",
  "https://www.mlsp.government.bg/trudovo-pravootnoshenie-prekratyavane",
  "https://www.mlsp.government.bg/otpuski",
  "https://www.gli.government.bg/bg/taxonomy/term/416/node/4386",
  "https://www.gli.government.bg/bg/node/4390",
];

const rent = getPostBySlug(RENT_SLUG)!;
const fire = getPostBySlug(FIRE_SLUG)!;

/** All visible prose of a post, concatenated. */
function prose(slug: string): string {
  const p = getPostBySlug(slug)!;
  return [
    p.title,
    p.summary,
    p.metaDescription,
    p.intro,
    ...p.sections.flatMap((s) => [s.heading, s.body]),
    ...p.faq.flatMap((f) => [f.q, f.a]),
    ...p.takeaways,
  ].join("\n");
}

const RENT_TEXT = prose(RENT_SLUG);
const FIRE_TEXT = prose(FIRE_SLUG);
const PROTOCOL_TEXT = [
  protocolContent.intro,
  ...protocolContent.usageCases,
  ...protocolContent.requirements,
  ...protocolContent.mistakes,
  ...protocolContent.faq.flatMap((f) => [f.q, f.a]),
].join("\n");

describe("pillar posts: preserved identity and URLs", () => {
  it("keeps the article count and every slug", () => {
    expect(ALL_POSTS.length).toBe(35);
    expect(new Set(ALL_POSTS.map((p) => p.slug)).size).toBe(35);
    expect(ALL_POSTS.every((p) => p.publishedAt.match(/^\d{4}-\d{2}-\d{2}$/))).toBe(true);
  });

  it("preserves slug, publishedAt, image, title and keyword of both pillars", () => {
    expect(rent.slug).toBe(RENT_SLUG);
    expect(rent.publishedAt).toBe("2026-04-15");
    expect(rent.image).toBe("/blog/kak-da-napravim-dogovor-za-naem.webp");
    expect(rent.title).toBe("Как да направим договор за наем на жилище през 2026 г.");
    expect(rent.keyword).toBe("договор за наем на жилище");
    expect(rent.category).toBe("Имоти");

    expect(fire.slug).toBe(FIRE_SLUG);
    expect(fire.publishedAt).toBe("2026-03-25");
    expect(fire.image).toBe("/blog/predizvestie-uvolnenie.webp");
    expect(fire.title).toBe("Предизвестие за уволнение: срокове и грешки на работодателите");
    expect(fire.keyword).toBe("предизвестие уволнение");
    expect(fire.category).toBe("Трудово право");
  });
});

describe("pillar posts: editorial metadata", () => {
  for (const [name, post, urls] of [
    ["rent", rent, RENT_SOURCES],
    ["dismissal", fire, FIRE_SOURCES],
  ] as const) {
    it(`${name}: source-checked metadata and exact official source URLs`, () => {
      expect(post.status).toBe("published");
      expect(post.reviewStatus).toBe("source-checked");
      expect(post.reviewedAt).toBe("2026-09-07");
      expect(post.modifiedAt).toBe("2026-09-07");
      expect(resolveDateModified(post)).toBe("2026-09-07");
      expect(hasVerifiedSources(post)).toBe(true);
      expect(post.sources?.map((s) => s.url)).toEqual(urls);
      for (const s of post.sources ?? []) {
        expect(s.url.startsWith("https://")).toBe(true);
        expect(s.title.trim().length).toBeGreaterThan(0);
        expect((s.note ?? "").trim().length).toBeGreaterThan(0);
      }
    });
  }

  it("matching blog topics carry the identical curated source packs", () => {
    const topicRent = BLOG_TOPICS.find((t) => t.slug === RENT_SLUG)!;
    const topicFire = BLOG_TOPICS.find((t) => t.slug === FIRE_SLUG)!;
    expect(topicRent.sourcePack?.map((s) => s.url)).toEqual(RENT_SOURCES);
    expect(topicFire.sourcePack?.map((s) => s.url)).toEqual(FIRE_SOURCES);
    for (const s of [...(topicRent.sourcePack ?? []), ...(topicFire.sourcePack ?? [])]) {
      expect(s.url.startsWith("https://")).toBe(true);
      expect(s.note.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not claim lawyer or expert review anywhere in the metadata", () => {
    const meta = JSON.stringify([rent.sources, fire.sources, rent.cta, fire.cta]);
    expect(meta).not.toMatch(/проверено от (юрист|адвокат|експерт)/i);
    expect(meta).not.toMatch(/lex\.bg/i);
  });
});

describe("pillar posts: CTA routes exist", () => {
  it("rental CTA points at an existing template slug", () => {
    expect(rent.cta?.href).toBe("/shablon/dogovor-za-naem-na-zhilishte");
    const slugs = Object.keys(templateMeta as Record<string, unknown>);
    expect(slugs).toContain("dogovor-za-naem-na-zhilishte");
  });

  it("dismissal CTA uses the verified /start route (no employment-notice template exists)", () => {
    expect(fire.cta?.href).toBe("/start");
    const routes = readFileSync("src/App.tsx", "utf8");
    expect(routes).toContain('path="/start"');
    expect(routes).toContain('path="/shablon/:slug"');
  });

  it("never invents a route: every pillar CTA href is a known route shape", () => {
    for (const href of [rent.cta?.href, fire.cta?.href]) {
      expect(href).toMatch(/^\/(start|shablon\/[a-z0-9-]+)$/);
    }
  });
});

describe("rental article: legal regression guards", () => {
  it("does not conflate art. 237 with a >3-year notarisation duty", () => {
    expect(RENT_TEXT).not.toMatch(/по-дълъг от три години[^.]{0,80}нотариално/);
    expect(RENT_TEXT).not.toMatch(/нотариална заверка е задължителна/i);
    expect(RENT_TEXT).not.toMatch(/чл\. 237[^.]{0,60}(трябва|задължително) да бъде нотариално/);
  });

  it("separates art. 229 (term / ordinary management) from art. 237 (effect on acquirer)", () => {
    expect(RENT_TEXT).toContain("чл. 229 ЗЗД");
    expect(RENT_TEXT).toMatch(/обикновено управление/);
    expect(RENT_TEXT).toMatch(/не повече от една година от прехвърлянето/);
    expect(RENT_TEXT).toMatch(/неопределен срок/);
  });

  it("does not ban subletting of parts without consent (art. 234)", () => {
    expect(RENT_TEXT).not.toMatch(/няма право да пренаема части/);
    expect(RENT_TEXT).toContain("чл. 234 ЗЗД");
    expect(RENT_TEXT).toMatch(/може да пренаеме части от наетия имот без съгласие/);
  });

  it("does not present landlord access as an automatic statutory right", () => {
    expect(RENT_TEXT).not.toMatch(/наемодателят има право на достъп до имота/);
    expect(RENT_TEXT).toMatch(/не е автоматично законово право/);
    expect(RENT_TEXT).toMatch(/аварийни ситуации/);
  });

  it("does not use blanket 'all major repairs' wording", () => {
    expect(RENT_TEXT).not.toMatch(/всички основни ремонти/);
    expect(RENT_TEXT).toMatch(/обикновено употребление/);
    expect(RENT_TEXT).toMatch(/етажна собственост/);
  });

  it("does not claim full name + EGN + ID data are always legally required", () => {
    expect(RENT_TEXT).not.toMatch(/единен граждански номер \(ЕГН\) и данни от лична карта/);
    expect(RENT_TEXT).not.toMatch(/има право да изиска тези данни/);
    expect(RENT_TEXT).toMatch(/свеждане на данните до минимум/);
    expect(RENT_TEXT).toMatch(/чл\. 6, параграф 1, буква \(в\)|буква \(е\)/);
  });

  it("keeps the protocol recommendation honest and correctly spelled", () => {
    expect(RENT_TEXT).not.toMatch(/приемо-предавател/);
    expect(RENT_TEXT).toMatch(/приемно-предавателен протокол/);
    expect(RENT_TEXT).toContain("чл. 233 ЗЗД");
  });
});

describe("dismissal article: legal regression guards", () => {
  it("uses art. 220 (not art. 221) for unobserved-notice compensation", () => {
    expect(FIRE_TEXT).not.toMatch(/чл\. 221[^.]{0,80}неспазен/);
    expect(FIRE_TEXT).not.toMatch(/обезщетение за разликата по реда на чл\. 221/);
    expect(FIRE_TEXT).toContain("чл. 220, ал. 1 КТ");
    expect(FIRE_TEXT).toContain("чл. 220, ал. 2 КТ");
  });

  it("answers the early-departure FAQ by reference to who gave notice", () => {
    const faq = fire.faq.find((f) => f.q.includes("не спазя срока на предизвестието"))!;
    expect(faq.a).toContain("чл. 220, ал. 1 КТ");
    expect(faq.a).toContain("чл. 220, ал. 2 КТ");
    expect(faq.a).toMatch(/кой е отправил предизвестието/);
  });

  it("does not state a blanket ban on employer-granted leave", () => {
    expect(FIRE_TEXT).not.toMatch(/без Вашето писмено съгласие работодателят не може/);
    expect(FIRE_TEXT).toContain("чл. 173, ал. 4 КТ");
  });

  it("does not claim blanket art. 333 protection during any sick leave", () => {
    expect(FIRE_TEXT).not.toMatch(/по време на такъв отпуск без предварително разрешение/);
    expect(FIRE_TEXT).toContain("чл. 333, ал. 7 КТ");
    expect(FIRE_TEXT).toMatch(/изброен(а|и)/);
    expect(FIRE_TEXT).toMatch(/мнение на трудово-експертната лекарска комисия/);
    expect(FIRE_TEXT).toMatch(/предварително съгласие на съответния синдикален орган/);
  });

  it("nuances the burden of proof instead of 'employee only needs to prove X'", () => {
    expect(FIRE_TEXT).not.toMatch(/Вие трябва единствено да докажете/);
    expect(FIRE_TEXT).toMatch(/всяка страна доказва фактите/i);
  });

  it("distinguishes the notice from the termination order and avoids categorical motives claims", () => {
    expect(FIRE_TEXT).not.toMatch(/предизвестието трябва да бъде мотивирано/);
    expect(FIRE_TEXT).not.toMatch(/задължително.{0,40}подробни мотиви/);
    expect(FIRE_TEXT).toMatch(/заповедта е акта, с който прекратяването се извършва/);
  });

  it("preserves the 2-month challenge deadline", () => {
    expect(FIRE_TEXT).toContain("чл. 358, ал. 1, т. 2 КТ");
    expect(FIRE_TEXT).toMatch(/двумесечен/);
  });
});

describe("handover protocol page: legal regression guards", () => {
  it("uses the correct Bulgarian spelling in all visible copy", () => {
    expect(PROTOCOL_TEXT).not.toMatch(/приемо-предавател/);
    expect(PROTOCOL_TEXT).toMatch(/приемно-предавател/);
  });

  it("cites art. 233 (not art. 230) for the no-protocol presumption, rebuttably", () => {
    expect(PROTOCOL_TEXT).not.toMatch(/чл\. 230 от ЗЗД/);
    expect(PROTOCOL_TEXT).toContain("чл. 233 от ЗЗД");
    expect(PROTOCOL_TEXT).toMatch(/до доказване на противното/);
    expect(PROTOCOL_TEXT).toMatch(/оборима презумпция/);
  });

  it("drops the 'high evidentiary weight' claim and explains art. 180 GPK", () => {
    expect(PROTOCOL_TEXT).not.toMatch(/доказателствената сила[^.]{0,40}висока/);
    expect(PROTOCOL_TEXT).toContain("чл. 180 от ГПК");
    expect(PROTOCOL_TEXT).toMatch(/изявленията в тях са направени от тези лица/);
    expect(PROTOCOL_TEXT).toMatch(/съвкупно с всички останали доказателства/);
  });

  it("does not cite art. 232(2) for damage and does not regulate meters by art. 232", () => {
    expect(PROTOCOL_TEXT).not.toMatch(/чл\. 232/);
  });

  it("avoids universal power-of-attorney form claims", () => {
    expect(PROTOCOL_TEXT).not.toMatch(/пълномощното следва да е издадено в съответната форма съгласно Закона за задълженията/);
    expect(PROTOCOL_TEXT).toMatch(/зависи от естеството на действието/);
  });

  it("keeps the 'useful but not mandatory' framing non-promissory", () => {
    expect(PROTOCOL_TEXT).toMatch(/не е условие за действителност/);
    expect(PROTOCOL_TEXT).not.toMatch(/гарантира|гарантиран|100%/);
  });
});
