/**
 * DTrust sandbox доставчик.
 *
 * Детерминиран, без външни заявки — служи за (1) демонстрация на целия поток
 * пред Borica преди договор и (2) тестове. Реалният B-Trust адаптер ще
 * имплементира същия `SignatureProvider` интерфейс.
 */

import {
  DTRUST_LEVEL_LABEL,
  isValidDocumentHash,
  type DtrustInitInput,
  type DtrustIssueInput,
  type DtrustIssueResult,
  type DtrustSignatureResult,
  type DtrustSigner,
  type DtrustVerifyResult,
  type SignatureProvider,
} from "./types";

interface SandboxRecord {
  input: DtrustInitInput;
  result: DtrustSignatureResult;
  /** Брой извиквания на status — първото връща "чака авторизация". */
  polls: number;
}

function b64(text: string): string {
  if (typeof btoa === "function") return btoa(text);
  // Node/edge среда
  return Buffer.from(text, "utf-8").toString("base64");
}

export class SandboxSignatureProvider implements SignatureProvider {
  readonly id = "dtrust-sandbox";
  readonly displayName = "DTrust Sandbox";
  readonly levels = ["basic", "verified", "qualified"] as const;

  private store = new Map<string, SandboxRecord>();
  private seq = 0;

  /** Ключ за демонстрационна персистенция в браузъра (не се ползва в тестове). */
  private readonly storageKey = "dtrust_sandbox_v1";

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = globalThis.localStorage?.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, SandboxRecord>;
      for (const [k, v] of Object.entries(parsed)) this.store.set(k, v);
      this.seq = this.store.size;
    } catch {
      /* демонстрационната персистенция е best-effort */
    }
  }

  private persist() {
    try {
      if (!globalThis.localStorage) return;
      globalThis.localStorage.setItem(
        this.storageKey,
        JSON.stringify(Object.fromEntries(this.store)),
      );
    } catch {
      /* без значение за логиката */
    }
  }

  /** Подписващи с този домейн симулират „вече има сертификат“. */
  private readonly certifiedHint = "certified";

  async init(input: DtrustInitInput): Promise<DtrustSignatureResult> {
    if (!isValidDocumentHash(input.documentHash)) {
      return {
        providerRequestId: "",
        status: "failed",
        message: "Невалиден отпечатък на документа (очаква се SHA-256).",
      };
    }
    if (!this.levels.includes(input.level)) {
      return { providerRequestId: "", status: "failed", message: "Неподдържано ниво на подпис." };
    }

    const providerRequestId = `sbx_${++this.seq}_${input.correlationId}`;
    const result: DtrustSignatureResult = {
      providerRequestId,
      status: input.level === "qualified" ? "awaiting_authorization" : "pending",
      certificateSubject:
        input.level === "qualified" ? `CN=${input.signer.name}, O=DTrust Sandbox` : undefined,
    };
    this.store.set(providerRequestId, { input, result, polls: 0 });
    this.persist();
    return result;
  }

  async status(providerRequestId: string): Promise<DtrustSignatureResult> {
    const rec = this.store.get(providerRequestId);
    if (!rec) {
      return { providerRequestId, status: "failed", message: "Непозната заявка." };
    }
    rec.polls += 1;
    // Второто запитване „приключва“ подписа — симулира авторизация в приложението.
    if (rec.polls >= 2 && rec.result.status !== "signed") {
      const signedAt = new Date().toISOString();
      rec.result = {
        ...rec.result,
        status: "signed",
        signedAt,
        signatureB64: b64(`PAdES:${rec.input.documentHash}:${signedAt}`),
        timestampB64: b64(`TSA:${signedAt}`),
      };
      this.persist();
    }
    return rec.result;
  }

  async verify(providerRequestId: string, documentHash: string): Promise<DtrustVerifyResult> {
    const rec = this.store.get(providerRequestId);
    const problems: string[] = [];
    if (!rec) {
      return {
        valid: false,
        level: "basic",
        hashMatches: false,
        problems: ["Заявката не е намерена."],
      };
    }
    const hashMatches = rec.input.documentHash.toLowerCase() === documentHash.toLowerCase();
    if (!hashMatches) problems.push("Отпечатъкът на документа не съвпада с подписания.");
    if (rec.result.status !== "signed") problems.push("Документът не е подписан.");
    return {
      valid: problems.length === 0,
      level: rec.input.level,
      hashMatches,
      certificateSubject: rec.result.certificateSubject,
      signedAt: rec.result.signedAt,
      timestampedAt: rec.result.signedAt,
      problems,
    };
  }

  async issue(input: DtrustIssueInput): Promise<DtrustIssueResult> {
    if (!input.signer.name?.trim()) {
      return {
        providerCertificateId: "",
        status: "rejected",
        message: "Липсва име на титуляря.",
      };
    }
    const months = input.validity === "single_use" ? 0 : input.validity;
    const expiresAt =
      input.validity === "single_use"
        ? new Date(Date.now() + 24 * 3600 * 1000).toISOString()
        : new Date(Date.now() + months * 30 * 24 * 3600 * 1000).toISOString();
    return {
      providerCertificateId: `sbxcert_${input.correlationId}`,
      status: "issued",
      certificateSubject: `CN=${input.signer.name}, O=DTrust Sandbox`,
      expiresAt,
    };
  }

  async hasCertificate(signer: DtrustSigner): Promise<boolean> {
    return !!signer.email?.includes(this.certifiedHint);
  }
}

export const sandboxProvider = new SandboxSignatureProvider();
export { DTRUST_LEVEL_LABEL };
