import { describe, expect, it } from "vitest";
import { redactStack, redactText, redactValue } from "@/lib/redact";

describe("redact", () => {
  it("маскира имейли, телефони, ЕГН и IBAN", () => {
    const out = redactText("ivan@example.com, 0888123456, 8001011234, BG18RZBB91550123456789");
    expect(out).not.toMatch(/ivan@example\.com/);
    expect(out).not.toMatch(/8001011234/);
    expect(out).not.toMatch(/RZBB91550123456789/);
  });

  it("маскира токени и headers, но пази името на полето", () => {
    const out = redactText(
      'Authorization: Bearer eyJhbGciOi.abcdefghij.klmnopqrst\napikey=sb_secret_abcdefghijklmnopqrst',
    );
    expect(out).toMatch(/Authorization/i);
    expect(out).not.toMatch(/eyJhbGciOi\.abcdefghij/);
    expect(out).not.toMatch(/sb_secret_abcdefghijklmnopqrst/);
  });

  it("маскира стойности на чувствителни JSON полета, но пази ключовете", () => {
    const out = redactValue({ email: "a@b.bg", password: "hunter2", status: 500 });
    expect(out).toMatch(/"password"/);
    expect(out).not.toMatch(/hunter2/);
    expect(out).toMatch(/500/);
  });

  it("пази файл:ред в stack trace и чисти query токени", () => {
    const stack = [
      "Error: boom",
      "    at run (https://app.example.com/assets/index-abc.js:42:11?token=supersecret)",
      "    at tick (https://app.example.com/assets/index-abc.js:99:3)",
    ].join("\n");
    const out = redactStack(stack);
    expect(out).toMatch(/at run/);
    expect(out).toMatch(/42:11|index-abc\.js/);
    expect(out).not.toMatch(/supersecret/);
  });

  it("ограничава броя кадри", () => {
    const stack = ["Error: x", ...Array.from({ length: 40 }, (_, i) => `    at f${i} (a/b.js:${i}:1)`)].join("\n");
    const out = redactStack(stack, 5);
    expect(out).toMatch(/кадрите след 5/);
  });
});
