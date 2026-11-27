import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface DependencyLock {
  lockfileVersion: number;
  overrides: Record<string, string | Record<string, string>>;
  packages: Record<string, [string, ...unknown[]]>;
}

const lock = JSON.parse(
  readFileSync("bun.lock", "utf8").replace(/,\s*([}\]])/g, "$1"),
) as DependencyLock;
const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
  overrides: DependencyLock["overrides"];
};

describe("CI dependency lock invariants", () => {
  it("preserves the Bun v3 lock schema", () => {
    expect(lock.lockfileVersion).toBe(3);
  });

  it("retains every manifest override including scoped compatibility overrides", () => {
    const expected = Object.fromEntries(
      Object.entries(manifest.overrides).map(([name, value]) => [
        name,
        value === "$vite"
          ? (JSON.parse(readFileSync("package.json", "utf8")) as {
              devDependencies: { vite: string };
            }).devDependencies.vite
          : value,
      ]),
    );
    expect(lock.overrides).toEqual(expected);
    expect(lock.overrides["@lovable.dev/mcp-js"]).toEqual({ esbuild: "^0.28.2" });
    expect(lock.overrides.docx).toEqual({ nanoid: "^5.1.16" });
    expect(lock.overrides.postcss).toEqual({ nanoid: "^3.3.19" });
  });

  it("resolves all MCP SDK instances to the version pinned by package.json overrides (1.32.1)", () => {
    const instances = Object.entries(lock.packages).filter(
      ([name]) => name === "@modelcontextprotocol/sdk" || name.endsWith("/@modelcontextprotocol/sdk"),
    );
    expect(instances.length).toBeGreaterThan(0);
    for (const [, [version]] of instances) {
      expect(version).toBe("@modelcontextprotocol/sdk@1.32.1");
    }
  });
});