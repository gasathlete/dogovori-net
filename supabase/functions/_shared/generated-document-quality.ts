// Q4a — ЕДИНЕН договор за качеството на СОБСТВЕНО генерираните документи.
//
// Цел (бизнес): документ, създаден от Договори.нет, не трябва веднага да критикува
// СВОИТЕ СОБСТВЕНИ умишлени решения при съставянето (плейсхолдъри за лични данни,
// локално попълване, опционални приложения, избран набор клаузи според режима).
// В същото време реалните правни дефекти НИКОГА не се крият само защото
// документът е генериран от нас.
//
// Този модул е ЧИСТ: без мрежа, без база, без AI, без PII.
//   - манифест за качество (версиониран, БЕЗ суров текст и без идентификатори),
//     ПОДПИСАН с HMAC-SHA-256 от сървърен ключ — клиент НЕ може да го подправи;
//   - детерминиран отпечатък на съдържанието (SHA-256), който ПАЗИ регистъра;
//   - детерминирана „консистентна проверка" на risk анализа (gate), която потиска
//     умишлени решения САМО при ДОВЕРЕН подписан манифест (fail closed).
//
// Отпечатъкът НЕ е доказателство за правна правилност. Той доказва единствено
// „това е точно този генериран от нас документ" — нищо повече.
//
// ОГРАНИЧЕНИЕ (осъзнато и тествано): `context_fingerprint` е ЕДНОПОСОЧЕН и
// пази поверителност — от него НЕ могат да се възстановят конкретните
// потребителски стойности (срок, сума, валута, роли). Затова Q4a може да
// запази „несъответствие със заявеното" САМО когато има доказателство от
// ТЕКУЩИЯ документ (дословен цитат или детерминирано правило) И изрично
// твърдение за несъответствие. Хешът сам по себе си НЕ доказва каква е била
// желаната стойност. По-дълбоко типизирано сравнение на намерението е задача
// на следващия етап (каноничен контекст), не на този модул.


import { sha256Hex } from "./normalize.ts";

export const GENERATED_QUALITY_SCHEMA_VERSION = 1 as const;
export const GENERATED_QUALITY_POLICY_VERSION = "q4a-generated-quality-2" as const;
export const GENERATED_QUALITY_SIGNATURE_VERSION = 1 as const;
export const GENERATED_QUALITY_SIGNATURE_ALG = "HMAC-SHA-256" as const;

/** Домейнова сепарация — ключът за подпис НИКОГА не е самият сървърен секрет. */
const SIGNING_KEY_DOMAIN = "dogovori.net/q4a-generated-quality-manifest/v1";

const HEX64 = /^[0-9a-f]{64}$/;

export type QualityOrigin =
  | "generate-contract"
  | "build-custom-contract"
  | "apply-corrections"
  | "refine-contract";

const ORIGINS: readonly QualityOrigin[] = [
  "generate-contract",
  "build-custom-contract",
  "apply-corrections",
  "refine-contract",
];

/**
 * ЗАТВОРЕН списък от умишлени решения при съставянето. Само идентификатори —
 * никакъв свободен текст от потребителя, за да не изтича PII в манифеста.
 */
export const INTENTIONAL_DECISION_IDS = [
  /** Личните данни са плейсхолдъри — попълват се локално след сваляне. */
  "placeholders_for_personal_data",
  /** Локално попълване на идентичност/контакт е част от дизайна. */
  "local_completion_of_personal_data",
  /** Приложенията/детайлите са опционални за този вид документ. */
  "optional_annex_details",
  /** Стандартен набор клаузи за вида документ. */
  "standard_clause_set",
  /** Съзнателно кратък набор клаузи (бърз режим). */
  "brief_clause_set",
  /** Съзнателно изчерпателен набор клаузи (стриктен режим). */
  "exhaustive_clause_set",
  /** Двуезичен паралелен текст. */
  "bilingual_parallel_text",
] as const;

export type IntentionalDecisionId = typeof INTENTIONAL_DECISION_IDS[number];

export interface QualityManifestSignature {
  v: typeof GENERATED_QUALITY_SIGNATURE_VERSION;
  alg: typeof GENERATED_QUALITY_SIGNATURE_ALG;
  /** HMAC-SHA-256 (hex) върху каноничната серизация на claims-ите. */
  value: string;
}

/** Твърденията на манифеста — точно това, което се подписва. */
export interface QualityManifestClaims {
  version: typeof GENERATED_QUALITY_SCHEMA_VERSION;
  policy_version: typeof GENERATED_QUALITY_POLICY_VERSION;
  origin: QualityOrigin;
  /** Вид документ (техническо име/slug), ако е известен. Никога име на страна. */
  document_type: string | null;
  /** Режим на съставяне ("fast"|"working"|"strict"), ако е приложим. */
  build_mode: string | null;
  /** Отпечатък на НЕ-PII контекста (само ключове/флагове, никакви отговори). */
  context_fingerprint: string | null;
  /** SHA-256 на нормализираното съдържание на документа (регистърът се пази). */
  content_fingerprint: string;
  /**
   * SHA-256 на КАНОНИЧНИЯ четим текст на документа (същият, който фронтендът
   * подава за ревизия). Нужен е, защото ревизията вижда чист текст, а не
   * структурата на договора. Не заменя `content_fingerprint`.
   */
  plaintext_fingerprint: string | null;
  /** Умишлени решения при съставянето — само от затворения списък. */
  decisions: IntentionalDecisionId[];
}

export interface QualityManifest extends QualityManifestClaims {
  signature: QualityManifestSignature;
}

// ---------------------------------------------------------------------------
// Нормализация и отпечатък на съдържанието
// ---------------------------------------------------------------------------

interface ClauseLike {
  number?: unknown;
  title?: unknown;
  body?: unknown;
  title_en?: unknown;
  body_en?: unknown;
}

export interface GeneratedContractLike {
  title?: unknown;
  title_en?: unknown;
  preamble?: unknown;
  preamble_en?: unknown;
  clauses?: unknown;
  closing?: unknown;
  closing_en?: unknown;
  bilingual?: unknown;
}

const asText = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Детерминирано „изравняване" на генерирания договор до чист текст — обхваща
 * ВСИЧКИ рендерирани езикови полета в ФИКСИРАН ред, включително английските.
 * Празните полета се записват като празен ред, за да не може разместване или
 * изтриване на поле да даде същия отпечатък.
 */
export function flattenGeneratedContract(contract: unknown): string {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return "";
  const c = contract as GeneratedContractLike;
  const parts: string[] = [
    `bilingual:${c.bilingual === true ? "1" : "0"}`,
    `title:${asText(c.title)}`,
    `title_en:${asText(c.title_en)}`,
    `preamble:${asText(c.preamble)}`,
    `preamble_en:${asText(c.preamble_en)}`,
  ];
  if (Array.isArray(c.clauses)) {
    c.clauses.forEach((raw, idx) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        parts.push(`clause:${idx}:invalid`);
        return;
      }
      const cl = raw as ClauseLike;
      parts.push(
        `clause:${idx}:number:${asText(cl.number)}`,
        `clause:${idx}:title:${asText(cl.title)}`,
        `clause:${idx}:title_en:${asText(cl.title_en)}`,
        `clause:${idx}:body:${asText(cl.body)}`,
        `clause:${idx}:body_en:${asText(cl.body_en)}`,
      );
    });
  }
  parts.push(`closing:${asText(c.closing)}`, `closing_en:${asText(c.closing_en)}`);
  return parts.join("\n");
}

/**
 * КАНОНИЧЕН четим текст — ТОЧНО същият ред и състав, който фронтендът праща
 * за ревизия (`contractToPlainText`). Включва и АНГЛИЙСКИТЕ рендерирани полета,
 * за да вижда ревизията реално целия двуезичен текст и промяна само в
 * английската част да обезсилва подадения манифест. Паритетът се пази чрез
 * златни тестове от двете страни.
 *
 * Ред: title, title_en, preamble, preamble_en, за всяка клауза
 * (number+title, body, number+title_en, body_en), closing, closing_en.
 */
export function renderCanonicalPlainText(contract: unknown): string {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return "";
  const c = contract as GeneratedContractLike;
  const parts: string[] = [];
  if (asText(c.title)) parts.push(asText(c.title));
  if (asText(c.title_en)) parts.push(asText(c.title_en));
  if (asText(c.preamble)) parts.push(asText(c.preamble));
  if (asText(c.preamble_en)) parts.push(asText(c.preamble_en));
  if (Array.isArray(c.clauses)) {
    for (const raw of c.clauses) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const cl = raw as ClauseLike;
      parts.push([asText(cl.number), asText(cl.title)].filter(Boolean).join(" ").trim());
      if (asText(cl.body)) parts.push(asText(cl.body));
      if (asText(cl.title_en)) {
        parts.push([asText(cl.number), asText(cl.title_en)].filter(Boolean).join(" ").trim());
      }
      if (asText(cl.body_en)) parts.push(asText(cl.body_en));
    }
  }
  if (asText(c.closing)) parts.push(asText(c.closing));
  if (asText(c.closing_en)) parts.push(asText(c.closing_en));
  return parts.filter(Boolean).join("\n\n");
}


/**
 * Нормализация за отпечатък: САМО CRLF и незначимо празно място. НИКАКВО
 * снижаване на регистъра — смяна на главна/малка буква е промяна в съдържанието
 * и ТРЯБВА да обезсили доверието.
 */
export function normalizeForFingerprint(text: string): string {
  return (text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Отделна нормализация за СРАВНЕНИЕ на текст (доказателственост) — без регистър. */
function normalizeForMatch(text: string): string {
  return normalizeForFingerprint(text).toLowerCase();
}

export async function computeContentFingerprint(contract: unknown): Promise<string> {
  const text = typeof contract === "string" ? contract : flattenGeneratedContract(contract);
  return await sha256Hex(
    [GENERATED_QUALITY_POLICY_VERSION, normalizeForFingerprint(text)].join("|"),
  );
}

/**
 * Отпечатък на контекста БЕЗ PII: приема САМО безопасни части (ключове на
 * отговори, флагове, вид/режим). Никакви стойности от потребителски отговори.
 */
/** Отпечатък на каноничния четим текст (за ревизия по чист текст). */
export async function computePlaintextFingerprint(contract: unknown): Promise<string> {
  return await sha256Hex(
    [
      GENERATED_QUALITY_POLICY_VERSION,
      "plaintext",
      normalizeForFingerprint(renderCanonicalPlainText(contract)),
    ].join("|"),
  );
}

export async function computeContextFingerprint(parts: readonly string[]): Promise<string> {
  const safe = parts.map((p) => (typeof p === "string" ? p.trim().toLowerCase() : "")).sort();
  return await sha256Hex([GENERATED_QUALITY_POLICY_VERSION, ...safe].join("|"));
}

// ---------------------------------------------------------------------------
// Подпис (HMAC-SHA-256 със сървърен, домейново разделен ключ)
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/**
 * Извежда ключа за подпис от сървърния секрет с домейнова сепарация. Самият
 * секрет НИКОГА не се връща, не се логва и не излиза в отговор.
 */
async function deriveSigningKey(serverSecret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(serverSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const material = await crypto.subtle.sign("HMAC", base, enc.encode(SIGNING_KEY_DOMAIN));
  return await crypto.subtle.importKey(
    "raw",
    material,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** Канонична серизация на подписваните твърдения — фиксиран ред, без празноти. */
export function canonicalizeQualityClaims(claims: QualityManifestClaims): string {
  return [
    `v:${claims.version}`,
    `policy:${claims.policy_version}`,
    `sigv:${GENERATED_QUALITY_SIGNATURE_VERSION}`,
    `alg:${GENERATED_QUALITY_SIGNATURE_ALG}`,
    `origin:${claims.origin}`,
    `document_type:${claims.document_type ?? ""}`,
    `build_mode:${claims.build_mode ?? ""}`,
    `context:${claims.context_fingerprint ?? ""}`,
    `content:${claims.content_fingerprint}`,
    `plaintext:${claims.plaintext_fingerprint ?? ""}`,
    `decisions:${[...claims.decisions].sort().join(",")}`,
  ].join("\n");
}

async function signClaims(claims: QualityManifestClaims, serverSecret: string): Promise<string> {
  const key = await deriveSigningKey(serverSecret);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(canonicalizeQualityClaims(claims))));
}

/** Сравнение с постоянно време върху hex низове с еднаква дължина. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Сървърният секрет за подпис. Наличен е във ВСЯКА Edge Function среда.
 * Стойността НИКОГА не се връща на клиента и не се логва.
 */
export function qualitySigningSecretFromEnv(): string | null {
  try {
    const v = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env
      .get("SUPABASE_SERVICE_ROLE_KEY");
    return typeof v === "string" && v.length >= 16 ? v : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Манифест
// ---------------------------------------------------------------------------

const clip = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
};

const dedupeDecisions = (v: unknown): IntentionalDecisionId[] => {
  if (!Array.isArray(v)) return [];
  const out: IntentionalDecisionId[] = [];
  for (const raw of v) {
    if (typeof raw !== "string") continue;
    const id = raw as IntentionalDecisionId;
    if (!INTENTIONAL_DECISION_IDS.includes(id)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
};

/**
 * Съставя ПОДПИСАН манифест. Ключът за подпис е ЗАДЪЛЖИТЕЛЕН — без него няма
 * манифест (fail closed), защото неподписан манифест е подправим от клиента.
 */
export async function buildQualityManifest(input: {
  origin: QualityOrigin;
  contract: unknown;
  signingSecret: string;
  documentType?: unknown;
  buildMode?: unknown;
  contextFingerprint?: string | null;
  decisions?: readonly string[];
}): Promise<QualityManifest> {
  if (typeof input.signingSecret !== "string" || input.signingSecret.length < 16) {
    throw new Error("quality_manifest_signing_key_missing");
  }
  const claims: QualityManifestClaims = {
    version: GENERATED_QUALITY_SCHEMA_VERSION,
    policy_version: GENERATED_QUALITY_POLICY_VERSION,
    origin: input.origin,
    document_type: clip(input.documentType, 200),
    build_mode: clip(input.buildMode, 40),
    context_fingerprint:
      typeof input.contextFingerprint === "string" && HEX64.test(input.contextFingerprint)
        ? input.contextFingerprint
        : null,
    content_fingerprint: await computeContentFingerprint(input.contract),
    plaintext_fingerprint: await computePlaintextFingerprint(input.contract),
    decisions: dedupeDecisions(input.decisions ?? []),
  };
  return {
    ...claims,
    signature: {
      v: GENERATED_QUALITY_SIGNATURE_VERSION,
      alg: GENERATED_QUALITY_SIGNATURE_ALG,
      value: await signClaims(claims, input.signingSecret),
    },
  };
}

/** Строга валидация на СХЕМАТА (без подпис) — при повреда връща `null`. */
export function validateQualityManifest(value: unknown): QualityManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== GENERATED_QUALITY_SCHEMA_VERSION) return null;
  if (v.policy_version !== GENERATED_QUALITY_POLICY_VERSION) return null;
  if (typeof v.origin !== "string" || !ORIGINS.includes(v.origin as QualityOrigin)) return null;
  if (typeof v.content_fingerprint !== "string" || !HEX64.test(v.content_fingerprint)) return null;
  const pf = v.plaintext_fingerprint;
  if (pf !== null && pf !== undefined && (typeof pf !== "string" || !HEX64.test(pf))) return null;
  const ctx = v.context_fingerprint;
  if (ctx !== null && (typeof ctx !== "string" || !HEX64.test(ctx))) return null;
  const dt = v.document_type;
  if (dt !== null && typeof dt !== "string") return null;
  const bm = v.build_mode;
  if (bm !== null && typeof bm !== "string") return null;
  if (!Array.isArray(v.decisions)) return null;
  if (
    v.decisions.some(
      (d) => typeof d !== "string" || !INTENTIONAL_DECISION_IDS.includes(d as IntentionalDecisionId),
    )
  ) {
    return null;
  }
  const sig = v.signature;
  if (!sig || typeof sig !== "object" || Array.isArray(sig)) return null;
  const s = sig as Record<string, unknown>;
  if (s.v !== GENERATED_QUALITY_SIGNATURE_VERSION) return null;
  if (s.alg !== GENERATED_QUALITY_SIGNATURE_ALG) return null;
  if (typeof s.value !== "string" || !HEX64.test(s.value)) return null;
  return {
    version: GENERATED_QUALITY_SCHEMA_VERSION,
    policy_version: GENERATED_QUALITY_POLICY_VERSION,
    origin: v.origin as QualityOrigin,
    document_type: typeof dt === "string" ? dt : null,
    build_mode: typeof bm === "string" ? bm : null,
    context_fingerprint: typeof ctx === "string" ? ctx : null,
    content_fingerprint: v.content_fingerprint,
    plaintext_fingerprint: typeof pf === "string" ? pf : null,
    decisions: dedupeDecisions(v.decisions),
    signature: {
      v: GENERATED_QUALITY_SIGNATURE_VERSION,
      alg: GENERATED_QUALITY_SIGNATURE_ALG,
      value: s.value,
    },
  };
}

export type ManifestTrustReason =
  | "absent"
  | "invalid"
  | "signing_key_missing"
  | "signature_mismatch"
  | "content_mismatch";

export type ManifestTrust =
  | { trusted: true; manifest: QualityManifest }
  | { trusted: false; manifest: null; reason: ManifestTrustReason };

/**
 * Доверие САМО при:
 *   1) валидна схема, И
 *   2) валиден HMAC подпис от НАШИЯ сървърен ключ (сравнен с постоянно време), И
 *   3) отпечатък на съдържанието, който СЪВПАДА с реално обработеното съдържание.
 * Иначе документът е ВЪНШЕН/недоверен и НИЩО не се потиска.
 */
export async function verifyQualityManifest(input: {
  manifest: unknown;
  content: unknown;
  signingSecret: string | null;
  /**
   * true за потоци, които виждат САМО каноничния четим текст (ревизия). Тогава
   * съвпадение с `plaintext_fingerprint` също е точно обвързване. Регистърът
   * се пази и тук — всяка промяна в текста разваля доверието.
   */
  allowPlaintextMatch?: boolean;
}): Promise<ManifestTrust> {
  if (input.manifest === undefined || input.manifest === null) {
    return { trusted: false, manifest: null, reason: "absent" };
  }
  const manifest = validateQualityManifest(input.manifest);
  if (!manifest) return { trusted: false, manifest: null, reason: "invalid" };
  const secret = input.signingSecret;
  if (typeof secret !== "string" || secret.length < 16) {
    return { trusted: false, manifest: null, reason: "signing_key_missing" };
  }
  const expected = await signClaims(manifest, secret);
  if (!constantTimeEqualHex(expected, manifest.signature.value)) {
    return { trusted: false, manifest: null, reason: "signature_mismatch" };
  }
  const actual = await computeContentFingerprint(input.content);
  let bound = constantTimeEqualHex(actual, manifest.content_fingerprint);
  if (!bound && input.allowPlaintextMatch === true && manifest.plaintext_fingerprint) {
    const plain = await sha256Hex(
      [
        GENERATED_QUALITY_POLICY_VERSION,
        "plaintext",
        normalizeForFingerprint(typeof input.content === "string" ? input.content : ""),
      ].join("|"),
    );
    bound = constantTimeEqualHex(plain, manifest.plaintext_fingerprint);
  }
  if (!bound) {
    return { trusted: false, manifest: null, reason: "content_mismatch" };
  }
  return { trusted: true, manifest };
}

/**
 * БЕЗОПАСНА идентичност на доверието — за обвързване на кеша. Включва само
 * не-PII твърдения; при недоверен манифест — причината. Така анализ, направен
 * при различен контекст на доверие/решения, НЕ може да бъде преизползван.
 */
export async function computeManifestTrustIdentity(trust: ManifestTrust): Promise<string> {
  const parts = trust.trusted
    ? [
      "trusted",
      canonicalizeQualityClaims(trust.manifest),
    ]
    : ["untrusted", trust.reason];
  return await sha256Hex([GENERATED_QUALITY_POLICY_VERSION, ...parts].join("|"));
}

// ---------------------------------------------------------------------------
// Детерминиран gate за консистентност на risk анализа
// ---------------------------------------------------------------------------

export interface RiskIssueLike {
  severity?: unknown;
  title?: unknown;
  detail?: unknown;
  clause?: unknown;
  quote?: unknown;
}

export interface GatedRiskIssue {
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
}

export interface GatedRisk {
  level: "low" | "medium" | "high";
  score: number;
  summary: string;
  issues: GatedRiskIssue[];
  recommendations: string[];
  strengths: string[];
}

export interface QualityGateReport {
  version: typeof GENERATED_QUALITY_SCHEMA_VERSION;
  policy_version: typeof GENERATED_QUALITY_POLICY_VERSION;
  origin: QualityOrigin;
  trusted_manifest: boolean;
  content_fingerprint: string | null;
  context_fingerprint: string | null;
  kept_issues: number;
  removed_issues: number;
  downgraded_issues: number;
  kept_strengths: number;
  removed_strengths: number;
  reason_codes: string[];
}

/**
 * Модели на реални правни дефекти. ВАЖНО: съвпадението тук НЕ е доказателство —
 * то само указва, че бележката не бива да се третира като стилистична. Дефектът
 * се ЗАПАЗВА единствено при дословен цитат от текста ИЛИ детерминирано правило.
 */
const LEGAL_DEFECT_PATTERNS: RegExp[] = [
  /противоречи|противоречие|разминаване между клауз/i,
  /нищожн|недействителн/i,
  /незаконн|противозаконн|заобикаля(не)? на закон|императивн/i,
  /прекомерн|непропорционалн|неограничен[аи]?\s+(неустойк|отговорност)/i,
  /задължителн[аи]?\s+(писмена\s+)?форма|нотариалн|вписване в\s+(търговск|имотн)/i,
  /отказ от\s+(законов|съдебн)/i,
  /липсва\s+(предмет|цена|страни|съществен)/i,
  /не съответства на\s+(избран|заявен|посочен)|противоречи на заявеното|различн[аи]\s+(срок|сум|валут)/i,
  /едностранн[оа]\s+(изменение|прекратяване)\s+без/i,
];

/**
 * Стилистични/форматни бележки — НИКОГА дефект, но и не се крият: винаги стават
 * ОПЦИОНАЛНА препоръка. Това не е „потискане" и не зависи от манифест.
 */
const STYLE_PATTERNS: RegExp[] = [
  /стил(ът|а)?\s+(на\s+)?(текста|документа)/i,
  /(езикът|формулировките)\s+(е|са)\s+(твърде\s+)?(официал|сух|тежк)/i,
  /(шрифт|форматиране|оформление|типограф)/i,
  /(твърде|прекалено)\s+(дълг|кратк)\s+(изречени|абзац)/i,
];

/**
 * Решение → модели, които при ДОВЕРЕН ПОДПИСАН манифест не са дефект. Само
 * решенията, реално изброени в манифеста, дават потискане.
 */
const DECISION_PATTERNS: Record<IntentionalDecisionId, RegExp[]> = {
  placeholders_for_personal_data: [
    /плейсхолдър|placeholder|квадратни скоби|\[\s*име\s*\]|попълн(ете|и|яне) (на )?(личн|данни|полет)/i,
    /непопълнен|незапълнен|празн[оои]\s+(полет|стойност)/i,
    /липсват\s+(конкретни\s+)?(лични\s+)?данни (за|на) страните|имена?, ег[нч]|егн\/еик|iban|банкова сметка не е попълнен/i,
  ],
  local_completion_of_personal_data: [
    /плейсхолдър|placeholder|квадратни скоби|попълн(ете|и|яне) (на )?(личн|данни|полет)/i,
    /непопълнен|незапълнен|празн[оои]\s+(полет|стойност)/i,
    /липсват\s+(конкретни\s+)?(лични\s+)?данни (за|на) страните|егн\/еик|iban/i,
  ],
  optional_annex_details: [
    /(опционалн|незадължителн)|(липсва|няма)\s+приложени[ея]|детайлизаци|може да бъде (разширен|допълнен)|препоръчително е да се добави приложение/i,
    /приложение|анекс|спецификаци/i,
  ],
  standard_clause_set: [/(липсват|няма)\s+дефиниции/i],
  brief_clause_set: [
    /кратък набор|малко клаузи|липсват (допълнителни|разширени) клаузи/i,
    /(липсват|няма)\s+дефиниции/i,
  ],
  exhaustive_clause_set: [/(твърде|прекалено)\s+(подробн|дълг)\s+(набор|документ)/i],
  bilingual_parallel_text: [/двуезич|английск(ия|и) текст/i],
};

const sevOf = (v: unknown): "low" | "medium" | "high" | null =>
  v === "low" || v === "medium" || v === "high" ? v : null;

const SIGNIFICANT_TOKEN = /[\p{L}]{6,}/gu;

/** Общи правни думи — не носят доказателствена стойност сами по себе си. */
const GENERIC_TOKENS = new Set([
  "клауза",
  "клаузата",
  "клаузи",
  "клаузите",
  "договор",
  "договора",
  "договорът",
  "договорни",
  "страните",
  "страна",
  "страната",
  "документ",
  "документа",
  "документът",
  "разпоредба",
  "разпоредбата",
  "съгласно",
  "настоящия",
  "настоящият",
  "настоящото",
  "възможно",
  "текстът",
  "текста",
  "правни",
  "правна",
  "правно",
  "условия",
  "условията",
]);

function significantTokens(text: string): string[] {
  return (normalizeForMatch(text).match(SIGNIFICANT_TOKEN) ?? [])
    .filter((t) => !GENERIC_TOKENS.has(t))
    .slice(0, 24);
}

/**
 * Детерминирано правило от ТЕКУЩИЯ документ: бележка за липсващ съществен
 * елемент е доказана, когато елементът наистина ОТСЪСТВА от документа.
 */
const ESSENTIAL_ELEMENT_RULES: { claim: RegExp; presence: RegExp }[] = [
  { claim: /липсва\s+предмет|няма\s+предмет/i, presence: /предмет/i },
  { claim: /липсва\s+цена|няма\s+(цена|възнаграждение)/i, presence: /цена|възнагражден/i },
  { claim: /липсва\s+срок|няма\s+срок/i, presence: /срок/i },
  { claim: /липсват?\s+страни|няма\s+страни/i, presence: /страни/i },
  { claim: /липсва\s+подпис|няма\s+подпис/i, presence: /подпис/i },
];

function isRuleBacked(text: string, normalizedDocLower: string): boolean {
  for (const rule of ESSENTIAL_ELEMENT_RULES) {
    if (rule.claim.test(text) && !rule.presence.test(normalizedDocLower)) return true;
  }
  return false;
}

/**
 * Доказателственост: дословен цитат от ТЕКУЩИЯ документ, детерминирано правило,
 * или ≥3 РАЗЛИЧНИ значими (не-общи) думи, намерени в документа. Само етикет
 * („нищожна клауза") НИКОГА не е доказателство.
 */
function isEvidenceBacked(issue: RiskIssueLike, normalizedDocLower: string): boolean {
  const quote = asText(issue.clause) || asText(issue.quote);
  const nq = normalizeForMatch(quote);
  if (nq.length >= 20 && normalizedDocLower.includes(nq)) return true;
  const text = `${asText(issue.title)} ${asText(issue.detail)}`;
  if (isRuleBacked(text, normalizedDocLower)) return true;
  const tokens = significantTokens(text);
  let hits = 0;
  const seen = new Set<string>();
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (normalizedDocLower.includes(t)) hits++;
    if (hits >= 3) return true;
  }
  return false;
}

/**
 * Робустно доказателство за СВОБОДЕН текст (силни страни, където схемата не
 * поддържа цитат): дословен откъс от документа ИЛИ ≥3 РАЗЛИЧНИ значими
 * (не-общи) думи, реално намерени в документа.
 */
function hasRobustTextEvidence(text: string, normalizedDocLower: string): boolean {
  const n = normalizeForMatch(text);
  if (n.length >= 20 && normalizedDocLower.includes(n)) return true;
  const seen = new Set<string>();
  let hits = 0;
  for (const t of significantTokens(text)) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (normalizedDocLower.includes(t)) hits++;
    if (hits >= 3) return true;
  }
  return false;
}

const matchesAny = (text: string, patterns: RegExp[]) => patterns.some((rx) => rx.test(text));


/** Модели за потискане — САМО от решенията в ДОВЕРЕН подписан манифест. */
function intentionalPatterns(manifest: QualityManifest | null): RegExp[] {
  if (!manifest) return [];
  const out: RegExp[] = [];
  for (const d of manifest.decisions) out.push(...(DECISION_PATTERNS[d] ?? []));
  return out;
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

/**
 * Детерминиран gate: маха/сваля само НЕДОКАЗАНИ бележки; потиска умишлени
 * решения САМО при доверен подписан манифест и само за изброените решения;
 * запазва доказаните дефекти и преизчислява консервативно ниво/оценка.
 */
export function applyRiskConsistencyGate(input: {
  risk: unknown;
  documentText: string;
  origin: QualityOrigin;
  manifest?: QualityManifest | null;
  trustedManifest?: boolean;
}): { risk: GatedRisk; quality: QualityGateReport } {
  const trusted = input.trustedManifest === true && !!input.manifest;
  const manifest = trusted ? input.manifest ?? null : null;
  const raw = (input.risk && typeof input.risk === "object" && !Array.isArray(input.risk)
    ? input.risk
    : {}) as Record<string, unknown>;

  const normalizedDocLower = normalizeForMatch(input.documentText ?? "");
  const intentional = intentionalPatterns(manifest);

  const originalIssues: RiskIssueLike[] = Array.isArray(raw.issues)
    ? (raw.issues.filter((i) => !!i && typeof i === "object" && !Array.isArray(i)) as RiskIssueLike[])
    : [];

  const kept: GatedRiskIssue[] = [];
  const downgraded: string[] = [];
  const reasons = new Set<string>();
  let removed = 0;

  const downgrade = (title: string, detail: string, code: string) => {
    if (detail.length >= 30 || title.length >= 12) {
      downgraded.push(detail ? `Опционално: ${title} — ${detail}` : `Опционално: ${title}`);
      reasons.add(code);
    } else {
      removed++;
      reasons.add("issue_unsupported_removed");
    }
  };

  for (const issue of originalIssues) {
    const severity = sevOf(issue.severity);
    const title = asText(issue.title).trim();
    const detail = asText(issue.detail).trim();
    const text = `${title} ${detail}`.trim();
    if (!severity || !title || !text) {
      removed++;
      reasons.add("issue_incomplete");
      continue;
    }

    // 1) Доказателственост се смята ПЪРВО — от текущия документ.
    const evidenceBacked = isEvidenceBacked(issue, normalizedDocLower);
    // 2) Съществено правно твърдение (противоречие, нищожност, императивна
    //    форма, прекомерна неустойка, несъответствие със заявеното...).
    const substantive = matchesAny(text, LEGAL_DEFECT_PATTERNS);

    // 3) ДОКАЗАН съществен дефект се ЗАПАЗВА ПРЕДИ всяко потискане. Така
    //    цитирано реално противоречие НЕ се крие само защото формулировката
    //    му споменава приложение, плейсхолдър или лични данни.
    if (evidenceBacked && substantive) {
      reasons.add("substantive_defect_preserved");
      kept.push({ severity, title, detail });
      continue;
    }

    // Стилистичните бележки не са дефект, но и не се крият.
    if (matchesAny(text, STYLE_PATTERNS)) {
      downgrade(title, detail, "style_note_downgraded");
      continue;
    }

    // Потискане на умишлено решение — само при ДОВЕРЕН подписан манифест и
    // само за НЕсъществена самокритика (същественото вече е запазено горе).
    if (intentional.length > 0 && matchesAny(text, intentional)) {
      removed++;
      reasons.add("intentional_drafting_decision");
      continue;
    }

    // Доказателственост е задължителна и за правните дефекти — етикет не стига.
    if (!evidenceBacked) {
      downgrade(title, detail, substantive ? "legal_label_unsupported" : "issue_downgraded_to_recommendation");
      continue;
    }
    kept.push({ severity, title, detail });
  }

  // Силните страни изискват РОБУСТНО доказателство срещу реалния текст:
  // дословен откъс ИЛИ ≥3 РАЗЛИЧНИ значими (не-общи) думи от документа.
  // Една случайна дума НЕ е доказателство.
  const rawStrengths = asStringArray(raw.strengths);
  const keptStrengths: string[] = [];
  for (const s of rawStrengths) {
    if (!hasRobustTextEvidence(s, normalizedDocLower)) continue;
    if (!keptStrengths.some((k) => k.toLowerCase() === s.toLowerCase())) keptStrengths.push(s);
  }
  const removedStrengths = rawStrengths.length - keptStrengths.length;
  if (removedStrengths > 0) reasons.add("strength_unsupported_removed");


  const recommendations = [...asStringArray(raw.recommendations), ...downgraded];

  // Консервативно ниво/оценка от РЕАЛНО оставените бележки.
  const hasHigh = kept.some((i) => i.severity === "high");
  const hasMedium = kept.some((i) => i.severity === "medium");
  const level: GatedRisk["level"] = hasHigh ? "high" : hasMedium ? "medium" : "low";
  const weight = (s: string) => (s === "high" ? 30 : s === "medium" ? 15 : 5);
  const computed = kept.reduce((sum, i) => sum + weight(i.severity), 0);
  const given = typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : computed;
  const cap = hasHigh ? 100 : hasMedium ? 60 : kept.length > 0 ? 25 : 0;
  const score = Math.max(0, Math.min(cap, Math.round(Math.max(given, computed))));

  return {
    risk: {
      level,
      score,
      summary: asText(raw.summary),
      issues: kept,
      recommendations,
      strengths: keptStrengths,
    },
    quality: {
      version: GENERATED_QUALITY_SCHEMA_VERSION,
      policy_version: GENERATED_QUALITY_POLICY_VERSION,
      origin: input.origin,
      trusted_manifest: trusted,
      content_fingerprint: manifest?.content_fingerprint ?? null,
      context_fingerprint: manifest?.context_fingerprint ?? null,
      kept_issues: kept.length,
      removed_issues: removed,
      downgraded_issues: downgraded.length,
      kept_strengths: keptStrengths.length,
      removed_strengths: Math.max(0, removedStrengths),
      reason_codes: [...reasons].sort(),
    },
  };
}

// ---------------------------------------------------------------------------
// Q4a — ЕДИНЕН fail-closed филтър за находките на ПО-КЪСНИЯ анализ/ревизия
// ---------------------------------------------------------------------------
//
// Проблемът, който този филтър затваря: първичният анализатор/ревизор четеше
// САМО решенията за лични данни. Затова умишлено опционалните приложения и
// съзнателно избраният набор клаузи (кратък/стандартен/изчерпателен) можеха да
// бъдат критикувани като „дефект" в собствен наш документ.
//
// Правилата са НЕПРОМЕНЛИВИ и fail-closed:
//   1. Без ДОВЕРЕН ПОДПИСАН манифест НИЩО не се потиска и не се сваля.
//   2. Потискане е допустимо САМО за решение, изрично изброено в манифеста.
//   3. Доказан съществен дефект (противоречие, нищожност, императивна форма,
//      прекомерна неустойка, несъответствие със заявеното) СЕ ЗАПАЗВА дори
//      когато формулировката му споменава приложение/плейсхолдър.
//   4. Личните плейсхолдъри остават „за попълване преди използване" там,
//      където такъв е съществуващият UX; опционалните приложения/детайли и
//      избраният набор клаузи стават ОПЦИОНАЛНА ПРЕПОРЪКА и не се броят като
//      дефект — те никога не са провал.
//
// ИЗВЪН ОБХВАТ (документирано): сравнение на КОНКРЕТНИ типизирани стойности на
// потребителското намерение (срок, сума, валута). `context_fingerprint` е
// еднопосочен и не разкрива стойности; това е задача на следващия етап.

/** Решенията, които описват отложено ЛОКАЛНО попълване на лични данни. */
export const PERSONAL_DATA_DECISIONS: readonly IntentionalDecisionId[] = [
  "placeholders_for_personal_data",
  "local_completion_of_personal_data",
];

export type LaterFindingAction = "keep" | "personal_warn" | "optional_recommendation";

export type LaterFindingReason =
  | "untrusted_manifest"
  | "substantive_defect_preserved"
  | "not_intentional"
  | "intentional_personal_placeholder"
  | "intentional_optional_detail";

export interface LaterFindingDisposition {
  action: LaterFindingAction;
  reason: LaterFindingReason;
  /** Решението от манифеста, което е дало основанието (иначе `null`). */
  decision: IntentionalDecisionId | null;
}

/**
 * Единственият предикат, през който по-късните находки минават. Чист, без
 * мрежа/база/PII. Не отслабва проверката по цитат — тя се прави ПРЕДИ него.
 */
export function classifyLaterFinding(input: {
  /** Целият четим текст на находката (заглавие + обяснение). */
  text: string;
  /** Дословният цитат, ако схемата на находката го поддържа. */
  quote?: unknown;
  /** ТЕКУЩИЯТ текст на документа — единственият източник на доказателство. */
  documentText: string;
  trust?: ManifestTrust | null;
}): LaterFindingDisposition {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const trust = input.trust;
  if (!trust || trust.trusted !== true) {
    return { action: "keep", reason: "untrusted_manifest", decision: null };
  }
  if (!text) return { action: "keep", reason: "not_intentional", decision: null };

  const doc = normalizeForMatch(input.documentText ?? "");

  // Доказан СЪЩЕСТВЕН дефект се запазва ПРЕДИ всяко потискане.
  const evidenceBacked = isEvidenceBacked({ title: text, quote: input.quote }, doc);
  if (evidenceBacked && matchesAny(text, LEGAL_DEFECT_PATTERNS)) {
    return { action: "keep", reason: "substantive_defect_preserved", decision: null };
  }

  for (const decision of trust.manifest.decisions) {
    const patterns = DECISION_PATTERNS[decision] ?? [];
    if (!matchesAny(text, patterns)) continue;
    if (PERSONAL_DATA_DECISIONS.includes(decision)) {
      return { action: "personal_warn", reason: "intentional_personal_placeholder", decision };
    }
    return { action: "optional_recommendation", reason: "intentional_optional_detail", decision };
  }

  return { action: "keep", reason: "not_intentional", decision: null };
}

export interface LaterFindingsPartition<T> {
  /** Находки, които остават дефекти/констатации. */
  kept: T[];
  /** Находки за локално попълване на лични данни (UX: „за попълване"). */
  personal: T[];
  /** Умишлено опционални — стават препоръка, не се броят като дефект. */
  optional: T[];
  reason_codes: string[];
}

/** Прилага предиката върху списък находки, без да пипа реда на оставените. */
export function partitionLaterFindings<T>(
  items: readonly T[],
  opts: {
    textOf: (item: T) => string;
    quoteOf?: (item: T) => unknown;
    documentText: string;
    trust?: ManifestTrust | null;
  },
): LaterFindingsPartition<T> {
  const kept: T[] = [];
  const personal: T[] = [];
  const optional: T[] = [];
  const reasons = new Set<string>();
  for (const item of items ?? []) {
    const d = classifyLaterFinding({
      text: opts.textOf(item),
      quote: opts.quoteOf ? opts.quoteOf(item) : undefined,
      documentText: opts.documentText,
      trust: opts.trust,
    });
    reasons.add(d.reason);
    if (d.action === "personal_warn") personal.push(item);
    else if (d.action === "optional_recommendation") optional.push(item);
    else kept.push(item);
  }
  return { kept, personal, optional, reason_codes: [...reasons].sort() };
}
