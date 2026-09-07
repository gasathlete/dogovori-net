/**
 * Lead magnet — инварианти на ЧАКАЩАТА (неприложена) миграция за съгласие и
 * минимизиране на данните, на генерираните типове и на статиката на клиента.
 *
 * Тестът чете реалните файлове: всяко отклонение тук е или регресия в
 * поверителността, или разминаване между клиент и база.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { Tables } from "@/integrations/supabase/types";
import type { LeadMagnetConsentColumns, SubscribeLeadMagnetArgs } from "@/lib/leadMagnetPendingSchema";
import { LEAD_MAGNET_CONSENT_VERSION, LEAD_MAGNET_SLUGS, type LeadMagnetSlug } from "@/lib/leadMagnets";
import { buildLeadMagnetSubscribeArgs, LEAD_MAGNET_CONSENT_COPY } from "@/lib/leadMagnetSubscribe";
import { LEAD_MAGNET_SHOWN_KEY, LEAD_MAGNET_SOURCE_GROUPS, type LeadMagnetSourceGroup } from "@/lib/leadMagnetTrigger";

const MIGRATION_NAME = "20260907123000_lead_magnet_consent_hardening.sql";
const MIGRATION_PATH = `supabase/migrations/${MIGRATION_NAME}`;
const JOURNAL_PATH = "drizzle/migrations/meta/_journal.json";
const DRIZZLE_DIR = "drizzle/migrations";
const COMPONENT_PATH = "src/components/funnel/ExitIntentLeadMagnet.tsx";
const SUBSCRIBE_PATH = "src/lib/leadMagnetSubscribe.ts";
const TRIGGER_PATH = "src/lib/leadMagnetTrigger.ts";
const TYPES_PATH = "src/integrations/supabase/types.ts";
const PENDING_SCHEMA_PATH = "src/lib/leadMagnetPendingSchema.ts";
const SOCIAL_PROOF_PATH = "src/components/funnel/SocialProofToast.tsx";
const ALLOWLIST_PATH = "scripts/security-allowlist.json";

const read = (p: string) => readFileSync(p, "utf8");
const rawSql = read(MIGRATION_PATH);
/** SQL без редовите коментари — за да проверяваме само изпълнимите изрази. */
const sql = rawSql
  .split("\n")
  .filter((line) => !/^\s*--/.test(line))
  .join("\n");
const fnBody = sql.slice(sql.indexOf("AS $$"), sql.lastIndexOf("$$;") + 3);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("миграция — местоположение и история", () => {
  it("има точно един източник в supabase/migrations и никакъв дубликат в docs/", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    expect(existsSync(`docs/db/${MIGRATION_NAME}`)).toBe(false);
    const siblings = readdirSync("supabase/migrations").filter((f) => /lead_magnet/i.test(f));
    expect(siblings).toEqual([MIGRATION_NAME]);
    expect(rawSql).not.toMatch(/НЕ Е ПРИЛОЖЕНА/);
  });

  it("Drizzle историята е консистентна: чакаща (без запис) или приложена (byte-identical + един запис)", () => {
    const journal = JSON.parse(read(JOURNAL_PATH)) as { entries: Array<{ tag: string; idx: number }> };
    const tags = journal.entries.map((e) => e.tag);
    const applied = readdirSync(DRIZZLE_DIR).filter((f) => /lead_magnet_consent_hardening\.sql$/.test(f));
    const journalHits = tags.filter((t) => /lead_magnet_consent_hardening$/.test(t));

    if (applied.length === 0) {
      // Все още не е приложена: журналът не бива да има запис за нея.
      expect(journalHits).toEqual([]);
    } else {
      expect(applied).toHaveLength(1);
      expect(read(join(DRIZZLE_DIR, applied[0]))).toBe(sql);
      expect(journalHits).toHaveLength(1);
      expect(applied[0]).toBe(`${journalHits[0]}.sql`);
    }
    // Индексите в журнала са уникални и последователни.
    const idx = journal.entries.map((e) => e.idx);
    expect(new Set(idx).size).toBe(idx.length);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
});

describe("миграция — само адитивни промени по схемата, без докосване на данни", () => {
  it("marketing_consent → DEFAULT false; consent_at/consent_version nullable", () => {
    expect(sql).toMatch(/ALTER TABLE public\.lead_magnet_subscribers\s+ALTER COLUMN marketing_consent SET DEFAULT false;/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS consent_at timestamptz NULL;/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS consent_version text NULL;/);
  });

  it("няма UPDATE/DELETE/TRUNCATE/backfill извън ON CONFLICT на RPC-то и нищо разрушително", () => {
    const outsideFn = sql.replace(fnBody, "");
    expect(outsideFn).not.toMatch(/\bUPDATE\b/i);
    expect(outsideFn).not.toMatch(/\bDELETE\b/i);
    expect(outsideFn).not.toMatch(/\bTRUNCATE\b/i);
    expect(outsideFn).not.toMatch(/\bINSERT\b/i);
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|RENAME|ALTER COLUMN\s+\w+\s+TYPE|SET NOT NULL/i);
    // Единствените UPDATE/INSERT са вътре в тялото на функцията, в един UPSERT.
    expect(fnBody.match(/\bINSERT INTO\b/g)).toHaveLength(1);
    expect(fnBody.match(/\bDO UPDATE SET\b/g)).toHaveLength(1);
    expect(fnBody).not.toMatch(/\bDELETE\b/i);
  });
});

describe("миграция — достъп до таблицата", () => {
  it("старата отворена INSERT политика е премахната и няма нова за запис", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Anyone can subscribe to a lead magnet" ON public.lead_magnet_subscribers;');
    const policies = [...sql.matchAll(/CREATE POLICY[\s\S]*?;/g)].map((m) => m[0]);
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatch(/FOR SELECT/);
    expect(policies[0]).toMatch(/TO authenticated/);
    expect(policies[0]).toMatch(/USING \(public\.has_role\(auth\.uid\(\), 'admin'\)\)/);
    expect(policies[0]).not.toMatch(/WITH CHECK/);
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
  });

  it("REVOKE ALL от PUBLIC/anon/authenticated; само SELECT за authenticated; RLS включена", () => {
    expect(sql).toContain("REVOKE ALL ON TABLE public.lead_magnet_subscribers FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT SELECT ON TABLE public.lead_magnet_subscribers TO authenticated;");
    expect(sql).toContain("GRANT ALL ON TABLE public.lead_magnet_subscribers TO service_role;");
    expect(sql).toContain("ALTER TABLE public.lead_magnet_subscribers ENABLE ROW LEVEL SECURITY;");
    const tableGrants = [...sql.matchAll(/GRANT ([A-Z, ]+) ON TABLE public\.lead_magnet_subscribers TO ([a-z_, ]+);/g)];
    for (const [, privs, roles] of tableGrants) {
      if (/anon|authenticated/.test(roles)) {
        expect(privs.trim()).toBe("SELECT");
        expect(roles).not.toContain("anon");
      }
    }
    // Последната дума за anon: никакво право върху таблицата.
    const grantToAnon = tableGrants.some(([, , roles]) => /\banon\b/.test(roles));
    expect(grantToAnon).toBe(false);
  });
});

describe("миграция — subscribe_lead_magnet RPC", () => {
  it("сигнатура, SECURITY DEFINER, заключен search_path, typed boolean резултат", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.subscribe_lead_magnet\(\s*_email text,\s*_magnet_slug text,\s*_source_group text,\s*_marketing_consent boolean\s*\)\s*RETURNS boolean\s*LANGUAGE plpgsql\s*SECURITY DEFINER\s*SET search_path = public, pg_temp/,
    );
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
  });

  it("NULL се отхвърля изрично за всеки аргумент ПРЕДИ всяко сравнение", () => {
    const nullGuard = fnBody.indexOf("IF _email IS NULL");
    expect(nullGuard).toBeGreaterThan(-1);
    expect(fnBody.slice(nullGuard, nullGuard + 200)).toMatch(
      /IF _email IS NULL\s+OR _magnet_slug IS NULL\s+OR _source_group IS NULL\s+OR _marketing_consent IS NULL THEN\s+RETURN false;/,
    );
    for (const later of ["IS NOT TRUE", "lower(btrim(", "length(v_email)", "!~", "NOT IN (", "INSERT INTO"]) {
      expect(fnBody.indexOf(later), later).toBeGreaterThan(nullGuard);
    }
  });

  it("съгласието трябва да е изрично true; имейлът е нормализиран, ограничен и със строг формат", () => {
    expect(fnBody).toMatch(/IF _marketing_consent IS NOT TRUE THEN\s+RETURN false;/);
    expect(fnBody).toContain("v_email := lower(btrim(_email));");
    expect(fnBody).toMatch(/IF length\(v_email\) < 6 OR length\(v_email\) > 254 THEN\s+RETURN false;/);
    expect(fnBody).toMatch(/IF v_email !~ '\^\[a-z0-9_%\+-\]\+\(\\\.\[a-z0-9_%\+-\]\+\)\*@\(\[a-z0-9\]\(\[a-z0-9-\]\{0,61\}\[a-z0-9\]\)\?\\\.\)\+\[a-z\]\{2,63\}\$' THEN\s+RETURN false;/);
  });

  it("allow-list-ите съвпадат точно с клиента (slug-ове и груби групи)", () => {
    const slugList = LEAD_MAGNET_SLUGS.map((s) => `'${s}'`).join(", ");
    const groupList = LEAD_MAGNET_SOURCE_GROUPS.map((g) => `'${g}'`).join(", ");
    expect(fnBody).toContain(`IF _magnet_slug NOT IN (${slugList}) THEN`);
    expect(fnBody).toContain(`IF _source_group NOT IN (${groupList}) THEN`);
    expect([...LEAD_MAGNET_SLUGS]).toEqual(["rent-red-flags", "labor-checklist-2026"]);
  });

  it("UPSERT само по (email, magnet_slug); name/user_agent NULL; consent_* фиксирани; source = груба група", () => {
    expect(fnBody).toMatch(/INSERT INTO public\.lead_magnet_subscribers AS s \(\s*email, name, magnet_slug, source, user_agent,\s*marketing_consent, consent_at, consent_version\s*\)/);
    expect(fnBody).toMatch(/VALUES \(\s*v_email, NULL, _magnet_slug, _source_group, NULL,\s*true, now\(\), 'lead-magnet-v2'\s*\)/);
    expect(fnBody).toContain("ON CONFLICT (email, magnet_slug)");
    expect(fnBody).toMatch(/DO UPDATE SET\s+name\s*=\s*NULL,\s+source\s*=\s*EXCLUDED\.source,\s+user_agent\s*=\s*NULL,\s+marketing_consent\s*=\s*true,\s+consent_at\s*=\s*now\(\),\s+consent_version\s*=\s*'lead-magnet-v2';/);
    expect(LEAD_MAGNET_CONSENT_VERSION).toBe("lead-magnet-v2");
    // Никакъв друг път за запис на consent_version.
    expect(fnBody.match(/lead-magnet-v2/g)).toHaveLength(2);
  });

  it("без идентификатори, без auth.uid, без заглавки, без RAISE, без суров вход в записа", () => {
    expect(fnBody).not.toMatch(/auth\.uid|auth\.jwt|current_setting|request\.headers|request\.jwt|inet_client_addr|session_user|current_user/);
    expect(fnBody).not.toMatch(/\bRAISE\b/);
    expect(fnBody).not.toMatch(/\bEXCEPTION\b/);
    // Суровият _email никога не влиза в INSERT/UPDATE — само нормализираният v_email.
    const insertPart = fnBody.slice(fnBody.indexOf("INSERT INTO"));
    expect(insertPart).not.toMatch(/[^v]_email\b/);
    // Резултатът е само true/false — нищо от реда не се връща.
    expect(fnBody).not.toMatch(/RETURNING/);
    expect(fnBody.match(/RETURN false;/g)).toHaveLength(6);
    expect(fnBody.match(/RETURN true;/g)).toHaveLength(1);
  });

  it("PUBLIC EXECUTE е отнет; EXECUTE само за anon и authenticated", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.subscribe_lead_magnet(text, text, text, boolean) FROM PUBLIC;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.subscribe_lead_magnet(text, text, text, boolean) TO anon, authenticated;");
    const fnGrants = [...sql.matchAll(/GRANT [A-Z ]+ ON FUNCTION[^;]+;/g)];
    expect(fnGrants).toHaveLength(1);
  });
});

describe("типове и клиент", () => {
  it("генерираните типове са канонични: чакащата схема живее само в един мост", () => {
    type Row = Tables<"lead_magnet_subscribers">;
    expectTypeOf<Row["marketing_consent"]>().toEqualTypeOf<boolean>();

    // Миграцията НЕ е приложена: генерираните типове още не я познават.
    const types = read(TYPES_PATH);
    expect(types).not.toContain("subscribe_lead_magnet");

    expectTypeOf<SubscribeLeadMagnetArgs>().toEqualTypeOf<{
      _email: string;
      _magnet_slug: string;
      _source_group: string;
      _marketing_consent: boolean;
    }>();
    expectTypeOf<LeadMagnetConsentColumns>().toEqualTypeOf<{
      consent_at: string | null;
      consent_version: string | null;
    }>();

    const bridge = read(PENDING_SCHEMA_PATH);
    expect(bridge).toContain(MIGRATION_NAME);
    expect((bridge.match(/as unknown as/g) ?? []).length).toBe(1);
  });

  it("клиентът ползва типизирано RPC без any/unknown кастове и без директен insert", () => {
    for (const p of [SUBSCRIBE_PATH, COMPONENT_PATH, TRIGGER_PATH]) {
      const src = read(p);
      expect(src, p).not.toMatch(/as unknown as|as any\b|: any\b|@ts-ignore|@ts-expect-error/);
    }
    const subscribe = read(SUBSCRIBE_PATH);
    expect(subscribe).toContain('.rpc("subscribe_lead_magnet"');
    expect(subscribe).not.toMatch(/\.insert\(|\.from\(/);
  });

  it("никой друг клиентски код не пише в lead_magnet_subscribers", () => {
    const offenders = walk("src").filter((p) => {
      if (p === TYPES_PATH || p.startsWith("src/test/")) return false;
      const src = read(p);
      return /from\(\s*["']lead_magnet_subscribers["']\s*\)/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("buildLeadMagnetSubscribeArgs праща минимален payload и връща null при всяко невалидно състояние", () => {
    const ok = buildLeadMagnetSubscribeArgs({
      email: "  Ivan@Example.BG ",
      magnetSlug: "rent-red-flags",
      sourceGroup: "home",
      marketingConsent: true,
    });
    expect(ok).toEqual({ _email: "ivan@example.bg", _magnet_slug: "rent-red-flags", _source_group: "home", _marketing_consent: true });
    expect(Object.keys(ok ?? {}).sort()).toEqual(["_email", "_magnet_slug", "_marketing_consent", "_source_group"]);

    const base = { email: "ivan@example.bg", magnetSlug: "rent-red-flags", sourceGroup: "home", marketingConsent: true } as const;
    expect(buildLeadMagnetSubscribeArgs({ ...base, marketingConsent: false })).toBeNull();
    expect(buildLeadMagnetSubscribeArgs({ ...base, email: "nope" })).toBeNull();
    expect(buildLeadMagnetSubscribeArgs({ ...base, email: "a".repeat(250) + "@x.bg" })).toBeNull();
    // Runtime защита и при заобиколена типизация (напр. стар bundle / ръчно извикване).
    expect(buildLeadMagnetSubscribeArgs({ ...base, magnetSlug: "other" as LeadMagnetSlug })).toBeNull();
    expect(buildLeadMagnetSubscribeArgs({ ...base, sourceGroup: "/shablon/nda" as LeadMagnetSourceGroup })).toBeNull();
  });
});

describe("статика на компонента — поверителност и копие", () => {
  const component = read(COMPONENT_PATH);

  it("няма „GDPR-съвместимо“, име, user agent, суров път или директен insert", () => {
    expect(component).not.toMatch(/GDPR/i);
    expect(component).not.toMatch(/navigator\.userAgent|user_agent/);
    expect(component).not.toMatch(/placeholder="Име/);
    expect(component).not.toMatch(/\.insert\(|\.from\(/);
    // В props на събитията няма суров path.
    for (const m of component.matchAll(/trackFunnelEvent\([^)]*\)/g)) {
      expect(m[0]).not.toMatch(/path|pathname|location\./);
    }
  });

  it("свалянето е нативна връзка, събитията са трите + converted само след успешен RPC", () => {
    expect(component).toMatch(/href=\{magnet\.fileUrl\}[\s\S]{0,200}download/);
    for (const ev of ["lead_magnet_shown", "lead_magnet_dismissed", "lead_magnet_downloaded", "lead_magnet_converted"]) {
      expect(component.match(new RegExp(`"${ev}"`, "g")), ev).toHaveLength(1);
    }
    const convertedIdx = component.indexOf('"lead_magnet_converted"');
    const subscribedCheck = component.lastIndexOf('result === "subscribed"', convertedIdx);
    expect(subscribedCheck).toBeGreaterThan(-1);
    expect(convertedIdx - subscribedCheck).toBeLessThan(200);
  });

  it("използва shadcn Dialog/Checkbox, има reduced-motion и 44px цели", () => {
    expect(component).toMatch(/from "@\/components\/ui\/dialog"/);
    expect(component).toMatch(/from "@\/components\/ui\/checkbox"/);
    expect(component).toContain("motion-reduce:!animate-none");
    expect((component.match(/min-h-\[44px\]/g) ?? []).length).toBeGreaterThanOrEqual(4);
    // Контролиран чекбокс, чието начално състояние е false (незадължен).
    expect(component).toContain("const [consent, setConsent] = useState(false);");
    expect(component).toContain("checked={consent}");
    expect(component).toContain("onCheckedChange={(v) => setConsent(v === true)}");
  });

  it("текстът на съгласието носи цел, честота, отказ и връзка към поверителността", () => {
    expect(LEAD_MAGNET_CONSENT_COPY.privacyHref).toBe("/privacy");
    expect(LEAD_MAGNET_CONSENT_COPY.label).toMatch(/бюлетин/);
    expect(LEAD_MAGNET_CONSENT_COPY.label).toMatch(/два пъти месечно/);
    expect(LEAD_MAGNET_CONSENT_COPY.label).toMatch(/отпиша по всяко време/);
  });
});

describe("свързани файлове", () => {
  it("SocialProofToast чете същия session ключ", () => {
    expect(read(SOCIAL_PROOF_PATH)).toContain(`"${LEAD_MAGNET_SHOWN_KEY}"`);
  });

  it("security allow-list има само насочения запис за миграцията", () => {
    const list = JSON.parse(read(ALLOWLIST_PATH)) as string[];
    const hits = list.filter((e) => e.includes("lead_magnet_consent_hardening"));
    expect(hits).toEqual([`${MIGRATION_PATH}:security-definer-no-authz`]);
  });
});
