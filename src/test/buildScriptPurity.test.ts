/**
 * Обикновеният build е ЧИСТ: строи файлове и проверява резултата, без да
 * съобщава нищо на трети страни. Известяването на търсачките е отделна,
 * изрично наименувана команда, която се пуска само след одобрено публикуване.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

/** Скриптове, които правят мрежово известяване и не бива да са в build. */
const NOTIFY_SCRIPTS = ["indexnow-ping.ts"];

describe("build без мрежови известявания", () => {
  it("build не пинга търсачки", () => {
    for (const script of NOTIFY_SCRIPTS) {
      expect(pkg.scripts.build, `build не бива да вика ${script}`).not.toContain(script);
    }
  });

  it("нито един build вариант не вика известяване", () => {
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      if (!name.startsWith("build")) continue;
      for (const script of NOTIFY_SCRIPTS) {
        expect(cmd, `${name} не бива да вика ${script}`).not.toContain(script);
      }
    }
  });

  it("известяването съществува като отделна изрична команда", () => {
    expect(pkg.scripts["notify:search-engines"]).toBe("bun run scripts/indexnow-ping.ts");
  });

  it("build съдържа само познатите стъпки за строене и проверка", () => {
    expect(pkg.scripts.build).toBe(
      "bun scripts/generate-blog-meta.ts && bun scripts/generate-footer-anchors.ts" +
        " && bun run scripts/build-sitemap.ts && vite build && bun run scripts/prerender.ts" +
        " && bun run scripts/verify-build.ts && bun run scripts/verify-seo-urls.ts",
    );
  });
});
