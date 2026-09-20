import { describe, expect, it, beforeEach } from "vitest";
import {
  clearTurnOperation,
  clearTurnOperationsForOtherUsers,
  getOrCreateTurnOperationId,
  turnScopeHash,
} from "@/lib/assistantTurnKey";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const scopeArgs = {
  userId: USER_A,
  threadId: null,
  message: "Какъв е срокът?",
  contextKind: null,
  contextEntityId: null,
  path: "/assistant",
};

describe("устойчив ключ на хода към асистента", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("обхватът е непрозрачен отпечатък, чувствителен към всяка съставка", async () => {
    const a = await turnScopeHash(scopeArgs);
    expect(a).toHaveLength(64);
    expect(await turnScopeHash(scopeArgs)).toBe(a);
    expect(await turnScopeHash({ ...scopeArgs, message: "друго" })).not.toBe(a);
    expect(await turnScopeHash({ ...scopeArgs, threadId: "t1" })).not.toBe(a);
    expect(await turnScopeHash({ ...scopeArgs, path: "/catalog" })).not.toBe(a);
    expect(await turnScopeHash({ ...scopeArgs, userId: USER_B })).not.toBe(a);
  });

  it("същият обхват връща същия идентификатор и след презареждане", async () => {
    const scope = await turnScopeHash(scopeArgs);
    const first = getOrCreateTurnOperationId(USER_A, scope);
    expect(getOrCreateTurnOperationId(USER_A, scope)).toBe(first);

    // Ново „презареждане“: четем от хранилището, не от паметта.
    const raw = localStorage.getItem("dogovari.assistant.turn.v1");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain(scopeArgs.message);
    expect(getOrCreateTurnOperationId(USER_A, scope)).toBe(first);
  });

  it("различен потребител никога не наследява ключ", async () => {
    const scope = await turnScopeHash(scopeArgs);
    const a = getOrCreateTurnOperationId(USER_A, scope);
    const b = getOrCreateTurnOperationId(USER_B, scope);
    expect(b).not.toBe(a);

    clearTurnOperationsForOtherUsers(USER_B);
    expect(getOrCreateTurnOperationId(USER_B, scope)).toBe(b);
    expect(getOrCreateTurnOperationId(USER_A, scope)).not.toBe(a);
  });

  it("изчистване само при потвърден изход", async () => {
    const scope = await turnScopeHash(scopeArgs);
    const first = getOrCreateTurnOperationId(USER_A, scope);
    clearTurnOperation(USER_A, scope);
    expect(getOrCreateTurnOperationId(USER_A, scope)).not.toBe(first);
  });

  it("записите изтичат след 24 часа", async () => {
    const scope = await turnScopeHash(scopeArgs);
    const first = getOrCreateTurnOperationId(USER_A, scope);
    const rows = JSON.parse(localStorage.getItem("dogovari.assistant.turn.v1")!);
    rows[0].createdAt = Date.now() - 25 * 60 * 60 * 1000;
    localStorage.setItem("dogovari.assistant.turn.v1", JSON.stringify(rows));
    expect(getOrCreateTurnOperationId(USER_A, scope)).not.toBe(first);
  });

  it("изходът изчиства всичко", async () => {
    const scope = await turnScopeHash(scopeArgs);
    getOrCreateTurnOperationId(USER_A, scope);
    clearTurnOperationsForOtherUsers(null);
    expect(localStorage.getItem("dogovari.assistant.turn.v1")).toBe("[]");
  });
});
