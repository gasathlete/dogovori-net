import { describe, expect, it } from "vitest";
import { SandboxSignatureProvider, isValidDocumentHash } from "@/lib/dtrust";

const HASH = "a".repeat(64);

describe("DTrust sandbox provider", () => {
  it("отхвърля невалиден отпечатък", async () => {
    const p = new SandboxSignatureProvider();
    const r = await p.init({
      documentHash: "not-a-hash",
      documentTitle: "Договор",
      level: "qualified",
      signer: { name: "Иван Иванов" },
      correlationId: "c1",
    });
    expect(r.status).toBe("failed");
  });

  it("квалифицираният подпис чака авторизация, после е подписан", async () => {
    const p = new SandboxSignatureProvider();
    const init = await p.init({
      documentHash: HASH,
      documentTitle: "Договор",
      level: "qualified",
      signer: { name: "Иван Иванов" },
      correlationId: "c2",
    });
    expect(init.status).toBe("awaiting_authorization");
    await p.status(init.providerRequestId);
    const done = await p.status(init.providerRequestId);
    expect(done.status).toBe("signed");
    expect(done.signatureB64).toBeTruthy();
    expect(done.timestampB64).toBeTruthy();
  });

  it("верификацията хваща подменен документ", async () => {
    const p = new SandboxSignatureProvider();
    const init = await p.init({
      documentHash: HASH,
      documentTitle: "Договор",
      level: "qualified",
      signer: { name: "Иван Иванов" },
      correlationId: "c3",
    });
    await p.status(init.providerRequestId);
    await p.status(init.providerRequestId);
    const ok = await p.verify(init.providerRequestId, HASH);
    expect(ok.valid).toBe(true);
    const bad = await p.verify(init.providerRequestId, "b".repeat(64));
    expect(bad.valid).toBe(false);
    expect(bad.hashMatches).toBe(false);
  });

  it("издава сертификат и разпознава наличен такъв", async () => {
    const p = new SandboxSignatureProvider();
    const issued = await p.issue({
      signer: { name: "Иван Иванов" },
      validity: 12,
      correlationId: "c4",
    });
    expect(issued.status).toBe("issued");
    expect(await p.hasCertificate({ name: "X", email: "certified@example.com" })).toBe(true);
    expect(await p.hasCertificate({ name: "X", email: "new@example.com" })).toBe(false);
  });

  it("валидира формата на отпечатъка", () => {
    expect(isValidDocumentHash(HASH)).toBe(true);
    expect(isValidDocumentHash("abc")).toBe(false);
  });
});
