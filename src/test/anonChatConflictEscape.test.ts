/**
 * Регресия върху UX при доказан сблъсък на идентификатора в анонимния чат:
 * освобождава се САМО локалният ключ, историята и въпросът се възстановяват,
 * а следващото изпращане е ИЗРИЧНО действие на човека (нов идентификатор).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("src/components/DogovAIBubble.tsx", "utf8");

describe("анонимен чат — изход при сблъсък", () => {
  it("сблъсъкът и изтеклият отговор освобождават ключа", () => {
    const block = src.slice(src.indexOf("CONFLICT_ESCAPE"));
    for (const code of [
      "request_binding_conflict",
      "binding_conflict",
      "idempotency_key_conflict",
      "response_expired",
      "new_request_required",
    ]) {
      expect(block).toContain(code);
    }
    const escape = src.slice(
      src.indexOf("CONFLICT_ESCAPE.has(code)"),
      src.indexOf("Повтаряеми състояния"),
    );
    expect(escape).toContain("releaseStableOpKey(scope)");
    expect(escape).toContain("Сесията/мрежата се промени. Изпратете отново.");
  });

  it("повтаряемите състояния ЗАПАЗВАТ същия ключ", () => {
    const retry = src.slice(
      src.indexOf("const retryNotice"),
      src.indexOf("Неповтаряема грешка"),
    );
    for (const code of [
      "operation_in_progress",
      "reconciliation_required",
      "entitlement_unavailable",
    ]) {
      expect(retry).toContain(code);
    }
    expect(retry).not.toContain("releaseStableOpKey");
    // сблъсъкът вече не е в повтаряемите състояния
    expect(retry).not.toContain("request_binding_conflict");
  });

  it("няма автоматично повторно изпращане", () => {
    expect(src).not.toMatch(/setTimeout\([^)]*send\s*\(/);
    // повторният опит минава само през възстановяване на входа
    expect(src).toContain("restoreForRetry");
  });
});
