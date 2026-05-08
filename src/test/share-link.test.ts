import { describe, it, expect } from "vitest";

// Simple share-link token generator used by edge function (32 random bytes hex).
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

describe("share link", () => {
  it("generates 64-char hex token", () => {
    const t = generateToken();
    expect(t).toHaveLength(64);
    expect(t).toMatch(/^[0-9a-f]+$/);
  });
  it("two tokens differ", () => {
    expect(generateToken()).not.toEqual(generateToken());
  });
  it("detects expired link", () => {
    expect(isExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
    expect(isExpired(new Date(Date.now() + 86_400_000).toISOString())).toBe(false);
  });
});
