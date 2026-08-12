/**
 * DTrust — типове за слоя за електронно подписване.
 *
 * DTrust е нашата абстракция над доставчиците на подпис. Първата реална
 * имплементация е B-Trust (Borica) за квалифициран подпис (QES); до сключване
 * на договор потокът работи със sandbox адаптер.
 *
 * Принципи:
 *  - към доставчика се изпраща само SHA-256 отпечатък на документа, не съдържание;
 *  - ключов материал никога не преминава през платформата;
 *  - всяко състояние е проследимо и се записва в одитна следа.
 */

/** Ниво на подпис с ясна правна тежест. */
export type DtrustLevel = "basic" | "verified" | "qualified";

/** Състояние на заявка за подпис при доставчика. */
export type DtrustStatus =
  | "pending" // създадена, чака действие от подписващия
  | "awaiting_authorization" // чака авторизация в приложението на доставчика
  | "signed"
  | "declined"
  | "expired"
  | "failed";

export interface DtrustSigner {
  name: string;
  email?: string;
  /** Национален идентификатор, когато доставчикът го изисква за QES. */
  nationalId?: string;
  phone?: string;
}

export interface DtrustInitInput {
  /** SHA-256 отпечатък (hex) на финалния PDF. */
  documentHash: string;
  documentTitle: string;
  level: DtrustLevel;
  signer: DtrustSigner;
  /** Наш вътрешен идентификатор на заявката за корелация в одита. */
  correlationId: string;
}

export interface DtrustSignatureResult {
  /** Идентификатор на заявката при доставчика. */
  providerRequestId: string;
  status: DtrustStatus;
  /** PAdES/CAdES структура (base64), налична при status === "signed". */
  signatureB64?: string;
  /** RFC 3161 времеви печат (base64). */
  timestampB64?: string;
  /** Кратък подпис на сертификата на титуляря за показване в UI. */
  certificateSubject?: string;
  signedAt?: string;
  /** Съобщение при declined/failed — показваемо на потребителя. */
  message?: string;
}

export interface DtrustVerifyResult {
  valid: boolean;
  level: DtrustLevel;
  /** Дали отпечатъкът на документа съвпада с подписания. */
  hashMatches: boolean;
  certificateSubject?: string;
  signedAt?: string;
  timestampedAt?: string;
  /** Причини за невалидност — за показване на страницата за проверка. */
  problems: string[];
}

export interface DtrustIssueInput {
  signer: DtrustSigner;
  /** Срок на сертификата в месеци (напр. 12) или "single_use". */
  validity: number | "single_use";
  correlationId: string;
}

export interface DtrustIssueResult {
  providerCertificateId: string;
  status: "requested" | "issued" | "rejected";
  certificateSubject?: string;
  expiresAt?: string;
  message?: string;
}

/**
 * Интерфейс на доставчик на подпис. B-Trust, както и всеки бъдещ втори
 * квалифициран доставчик, се имплементира зад него — UI-ът не се променя.
 */
export interface SignatureProvider {
  readonly id: string;
  readonly displayName: string;
  /** Нива, които доставчикът поддържа. */
  readonly levels: readonly DtrustLevel[];

  /** Стартира подписване. */
  init(input: DtrustInitInput): Promise<DtrustSignatureResult>;
  /** Проверява текущото състояние на заявка. */
  status(providerRequestId: string): Promise<DtrustSignatureResult>;
  /** Валидира подпис срещу отпечатък на документ. */
  verify(providerRequestId: string, documentHash: string): Promise<DtrustVerifyResult>;
  /** Реселърска заявка за издаване на нов сертификат. */
  issue(input: DtrustIssueInput): Promise<DtrustIssueResult>;
  /** Има ли подписващият активен сертификат при доставчика. */
  hasCertificate(signer: DtrustSigner): Promise<boolean>;
}

export function isValidDocumentHash(hash: string): boolean {
  return /^[0-9a-f]{64}$/i.test(hash);
}

/** Кратко описание на правната тежест — използва се в UI и в печата на документа. */
export const DTRUST_LEVEL_LABEL: Record<DtrustLevel, { name: string; legal: string }> = {
  basic: { name: "DTrust Basic", legal: "Прост електронен подпис (SES)" },
  verified: { name: "DTrust Verified", legal: "Усъвършенстван електронен подпис (AdES)" },
  qualified: { name: "DTrust Qualified", legal: "Квалифициран електронен подпис (QES) по eIDAS" },
};
