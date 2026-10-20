// N0 — затворен, code-owned регистър на ОФИЦИАЛНИ нормативни източници.
//
// Правила, които този модул налага:
//   * Никакъв URL от потребител. Само точно тези HTTPS origin-и и пътища.
//   * Lex.bg НЕ е официален наблюдаван източник. Съществуващите Lex URL-и в
//     public.legal_sources са ЛЕГАСИ метаданни на корпуса и остават както са —
//     този регистър не ги преозначава като официални.
//   * Ако точен официален endpoint не е проверен, източникът се регистрира
//     `enabled: false` + `reviewStatus: "needs_access_review"`. Никога не се
//     измисля URL.
//   * Никакво обхождане на публични коментари, профили или прикачени файлове
//     извън изрично разрешените пътища. Никакво заобикаляне на auth/CAPTCHA/paywall.

export type Jurisdiction = "BG" | "EU";

/**
 * Авторитетът е ЧЕСТЕН и не се преувеличава:
 *   * `official_promulgation` — САМО автентично обнародване (Държавен вестник).
 *   * `official_eu_publication` — САМО автентичният електронен OJ на ЕС.
 *   * `official_administrative_consolidation` — официална административна
 *     консолидация, поддържана от държавен орган (Министерство на правосъдието,
 *     КЗП, Агенция по вписванията). Това е официален, но НЕавтентичен текст:
 *     той НИКОГА не се представя като обнародване.
 */
export type AuthorityTier =
  | "official_promulgation"
  | "official_administrative_consolidation"
  | "official_legislative_process"
  | "official_consultation"
  | "official_eu_publication"
  | "official_eu_consolidated_helper";

export type AccessMethod = "rss" | "html_index" | "json_api" | "sparql" | "file_export";

export type ReviewStatus = "approved" | "needs_access_review" | "rejected";

export type ExpectedCadence = "hourly" | "daily" | "weekly" | "monthly" | "irregular";

export type AdapterId =
  | "bg_state_gazette_index"
  | "bg_national_assembly_index"
  | "bg_strategy_consultations_rss"
  | "eu_eurlex_oj_index"
  | "eu_cellar_sparql"
  | "bg_mj_normdoc_html"
  | "bg_official_docx"
  | "bg_official_pdf"
  | "bg_constcourt_html"
  | "eu_eli_oj_html"
  | "eu_official_pdf";


/** Формат на документа за точния endpoint на закон. */
export type LawDocumentFormat = "html" | "docx" | "pdf";

/**
 * Обвързване на точен endpoint с точен закон. Наличието му прави източника
 * годен за поглъщане през `ingest-official-law`; липсата му го изключва.
 */
export interface LawBinding {
  readonly shortCode: string;
  readonly title: string;
  readonly sourceType: "act" | "code" | "regulation" | "constitution";
  readonly issuer: string;
  readonly format: LawDocumentFormat;
  /** Дата на влизане в сила на самия акт (ISO). Не се измисля от модел. */
  readonly effectiveFrom: string;
  /**
   * Точни низове, които ЗАДЪЛЖИТЕЛНО присъстват в извлечения текст (обнародване
   * и последно отразено изменение/решение). Изведени от успешната проба.
   */
  readonly requiredTextMarkers?: readonly string[];
  /**
   * Минимален брой разпознати ПЪРВИЧНИ члена, под който поглъщането се отказва.
   * Прагът се извежда от действителната проверка на файла, не се избира произволно,
   * и НЕ брои членове, цитирани от изменяни актове.
   */
  readonly minArticles: number;
  /**
   * Кой разчитач се използва. `bg_act` е българският акт („Чл. N.“), а
   * `eu_regulation` — регламент на ЕС („Член N“ + съображения).
   */
  readonly chunker?: "bg_act" | "eu_regulation";
  /**
   * Последният ПЪРВИЧЕН член на акта. Всичко след него в преходните и
   * заключителните разпоредби е ДОСЛОВЕН цитат от изменян акт и не се записва
   * като норма на този закон. Липсата му в текста е провал (непълно извличане).
   */
  readonly lastPrimaryArticle?: string;
  /** Минимален брой съображения (само за актове на ЕС, които имат преамбюл). */
  readonly minRecitals?: number;
  /**
   * Има ли документът преамбюл със съображения. Стойността се декларира тук, а
   * НЕ се отгатва от текста: официалната консолидация на Службата за публикации
   * съдържа само разпоредителната част, докато автентичната публикация в ОВ има
   * преамбюл. Липсващ преамбюл там, където се очаква, остава провал.
   */
  readonly hasPreamble?: boolean;
}


export interface LegalSourceEntry {
  readonly sourceKey: string;
  readonly title: string;
  readonly jurisdiction: Jurisdiction;
  readonly authorityTier: AuthorityTier;
  /** Точен HTTPS origin. Fetch извън него се отказва. */
  readonly origin: string;
  /** Основен вход за проверка (винаги започва с "/"). */
  readonly entryPath: string;
  /** Разрешени префикси на пътища за този адаптер (entryPath включително). */
  readonly allowedPathPrefixes: readonly string[];
  readonly accessMethod: AccessMethod;
  readonly adapterId: AdapterId;
  /**
   * Върху какво се смята отпечатъкът на документа. По подразбиране суровите
   * байтове; "extracted_text" е за официални HTML страници, чиято презентационна
   * обвивка се променя при всяко извикване, без правният текст да се променя.
   */
  readonly checksumBasis?: "raw_bytes" | "extracted_text";
  readonly enabled: boolean;
  /** true → източникът е само за наблюдение/предложения, никога „действащо право“. */
  readonly watchOnly: boolean;
  readonly reviewStatus: ReviewStatus;
  readonly owner: string;
  readonly reviewNotes: string;
  readonly expectedCadence: ExpectedCadence;
  readonly parserVersion: string;
  readonly allowedContentTypes: readonly string[];
  /** Максимален размер на отговора в байтове за този източник. */
  readonly maxBytes: number;
  readonly timeoutMs: number;
  /** Само за endpoint-и, които СА точен текст на закон. */
  readonly lawBinding?: LawBinding;
}

const HTML_TYPES = ["text/html", "application/xhtml+xml"] as const;
const XML_TYPES = ["application/rss+xml", "application/xml", "text/xml", "application/atom+xml"] as const;
const DOCX_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
const PDF_TYPES = ["application/pdf"] as const;

export const LEGAL_SOURCE_REGISTRY: readonly LegalSourceEntry[] = Object.freeze([
  {
    sourceKey: "bg_mj_zzd",
    title: "Закон за задълженията и договорите — официална консолидация на МП",
    jurisdiction: "BG",
    authorityTier: "official_administrative_consolidation",
    origin: "https://justice.government.bg",
    entryPath: "/home/normdoc/2121934337",
    allowedPathPrefixes: ["/home/normdoc/2121934337"],
    accessMethod: "html_index",
    adapterId: "bg_mj_normdoc_html",
    enabled: true,
    watchOnly: false,
    reviewStatus: "approved",
    owner: "legal-ops",
    reviewNotes:
      "Точен endpoint на Министерството на правосъдието за ЗЗД. Официална административна консолидация, НЕ обнародване: автентичен остава текстът в Държавен вестник.",
    expectedCadence: "monthly",
    parserVersion: "law-html-v1",
    allowedContentTypes: [...HTML_TYPES],
    maxBytes: 6_000_000,
    timeoutMs: 30_000,
    lawBinding: {
      shortCode: "ЗЗД",
      title: "Закон за задълженията и договорите",
      sourceType: "act",
      issuer: "Народно събрание",
      format: "html",
      effectiveFrom: "1951-01-01",
      minArticles: 200,
    },
  },
  {
    sourceKey: "bg_mj_labour_code",
    title: "Кодекс на труда — официална консолидация на МП",
    jurisdiction: "BG",
    authorityTier: "official_administrative_consolidation",
    origin: "https://www.justice.government.bg",
    entryPath: "/home/normdoc/1594373121",
    allowedPathPrefixes: ["/home/normdoc/1594373121"],
    accessMethod: "html_index",
    adapterId: "bg_mj_normdoc_html",
    enabled: false,
    watchOnly: false,
    reviewStatus: "needs_access_review",
    owner: "legal-ops",
    reviewNotes:
      "ИСТОРИЧЕСКИ ПРОВАЛ, заменен от bg_nra_labour_code. Точен endpoint на Министерството на правосъдието за Кодекса на труда. Сървърът поднася непълна верига от сертификати (липсва междинен сертификат), затова строгата TLS проверка се проваля и източникът е изключен. Заобикаляне на TLS и огледала не се допускат; записите за провалени изпълнения се пазят като одитно доказателство.",
    expectedCadence: "monthly",
    parserVersion: "law-html-v1",
    allowedContentTypes: [...HTML_TYPES],
    maxBytes: 12_000_000,
    timeoutMs: 30_000,
    lawBinding: {
      shortCode: "КТ",
      title: "Кодекс на труда",
      sourceType: "code",
      issuer: "Народно събрание",
      format: "html",
      effectiveFrom: "1986-04-01",
      minArticles: 300,
    },
  },
  {
    sourceKey: "bg_nra_labour_code",
    title: "Кодекс на труда — официален файл на НАП (консолидация 08.2026)",
    jurisdiction: "BG",
    authorityTier: "official_administrative_consolidation",
    origin: "https://nra.bg",
    entryPath:
      "/wps/wcm/connect/nra.bg25863/63648ffc-3f9a-431c-86a1-3893043d2fbf/%D0%9A%D0%A2-082026.docx?CACHEID=ROOTWORKSPACE.Z18_PPGAHG8009LJC0QTR5C2HH30I6-63648ffc-3f9a-431c-86a1-3893043d2fbf-p.M6FQV&MOD=AJPERES",
    allowedPathPrefixes: [
      "/wps/wcm/connect/nra.bg25863/63648ffc-3f9a-431c-86a1-3893043d2fbf/",
    ],
    accessMethod: "file_export",
    adapterId: "bg_official_docx",
    enabled: true,
    watchOnly: false,
    reviewStatus: "approved",
    owner: "legal-ops",
    reviewNotes:
      "Официален DOCX на Националната агенция за приходите (страница „Законодателство“), публикуван 11.08.2026 г. Официална административна консолидация, НЕ обнародване: автентичен остава текстът в Държавен вестник. Проверено: HTTP 200 без пренасочване, application/vnd.openxmlformats-officedocument.wordprocessingml.document, 330 019 байта, заглавие „КОДЕКС НА ТРУДА“, последно отразено изменение ДВ бр.69 от 31 юли 2026 г., 512 разпознати члена. Query низът е част от точния ресурс и се фиксира.",
    expectedCadence: "monthly",
    parserVersion: "law-docx-v1",
    allowedContentTypes: [...DOCX_TYPES],
    maxBytes: 8_000_000,
    timeoutMs: 45_000,
    lawBinding: {
      shortCode: "КТ",
      title: "Кодекс на труда",
      sourceType: "code",
      issuer: "Народно събрание",
      format: "docx",
      effectiveFrom: "1987-01-01",
      minArticles: 300,
    },
  },

  {
    sourceKey: "bg_mi_commerce_act",
    title: "Търговски закон — официален файл на Министерство на икономиката (31.07.2026)",
    jurisdiction: "BG",
    authorityTier: "official_administrative_consolidation",
    origin: "https://www.mi.government.bg",
    entryPath: "/file/2011/08/targovski_zakon_31.07.2026.pdf",
    allowedPathPrefixes: ["/file/2011/08/targovski_zakon_31.07.2026.pdf"],
    accessMethod: "file_export",
    adapterId: "bg_official_pdf",
    enabled: false,
    watchOnly: true,
    reviewStatus: "rejected",
    owner: "legal-ops",
    reviewNotes:
      "КАРАНТИНИРАН на 23.09.2026 г. Файлът е хостнат от Министерство на икономиката, но самият документ е продуктова консолидация на информационна система АПИС: маркерът „Информационна система АПИС / https://web.apis.bg“ се среща в 245 от 1029 индексирани откъса, включително в текста на разпоредбите. Правилото „само официален произход, без Lex/Ciela/APIS“ се прилага според ПРОИЗВОДИТЕЛЯ на текста, не според домейна на хостинга — както при отхвърления ЗДДС файл със „Сиела“ маркери. Нищо не е изтрито: източникът, снимката и 1029 откъса остават в базата като неактивни (short_code „ТЗ-АПИС-ОТХВЪРЛЕН“). Предишна проверка: HTTP 200, application/pdf, 1 507 307 байта, SHA-256 6cc00b16ddf9b2b6cc7b107e588f32e91c80027aba1b457f6a822252555896d6, обн. ДВ бр. 48/18.06.1991 г., отразено изменение до ДВ бр. 69 от 31.07.2026 г. Път за затваряне: официална консолидация на ТЗ без издателски воден знак (напр. собствен консолидиран текст на държавен орган) или одитиран многоизточников модел върху обнародванията в Държавен вестник.",
    expectedCadence: "monthly",
    parserVersion: "law-pdf-v1",
    allowedContentTypes: [...PDF_TYPES],
    maxBytes: 12_000_000,
    timeoutMs: 60_000,
    lawBinding: {
      shortCode: "ТЗ",
      title: "Търговски закон",
      sourceType: "act",
      issuer: "Народно събрание",
      format: "pdf",
      effectiveFrom: "1991-07-01",
      // Консервативен праг, изведен от успешната проверка (~800 члена), не измислен.
      minArticles: 700,
    },
  },
  {
    // КАНДИДАТ, НЕ одобрен източник. Записан е само за да е проследим точният
    // адрес и отпечатъкът от пробата; не е свързан със закон (няма lawBinding),
    // затова не може да бъде поглъщан дори при случайна промяна на флаг.
    sourceKey: "bg_registryagency_commerce_act_candidate",
    title:
      "Търговски закон — КАНДИДАТ: PDF от нормативния указател на Агенция по вписванията (качен 01.08.2026)",
    jurisdiction: "BG",
    authorityTier: "official_administrative_consolidation",
    origin: "https://www.registryagency.bg",
    entryPath: "/media/filer_public/2026/08/01/trgovski_zakon.pdf",
    allowedPathPrefixes: ["/media/filer_public/2026/08/01/trgovski_zakon.pdf"],
    accessMethod: "file_export",
    adapterId: "bg_official_pdf",
    enabled: false,
    watchOnly: true,
    reviewStatus: "needs_access_review",
    owner: "legal-ops",
    reviewNotes:
      "КАНДИДАТ за замяна на карантинирания файл на Министерство на икономиката. НЕ Е ОДОБРЕН и НЕ Е ПОГЛЪЩАН: няма правно обвързване, няма запис в базата, карантината на bg_mi_commerce_act остава. Проба 23.09.2026: HTTP 200 без смяна на origin, application/pdf, 1 827 275 байта, SHA-256 6810010886838395079035db6780c4f76c74be3bc6b1f42f27741fca18dc0677, last-modified 01.08.2026 (дата на качване, НЕ дата на изменение), 358 страници, заглавие „ТЪРГОВСКИ ЗАКОН“, в сила от 01.07.1991 г., обн. ДВ бр. 48 от 18.06.1991 г., последно отразено изменение „изм. и доп. ДВ бр. 69 от 31 Юли 2026 г.“. Издателски маркери НЕ са открити: 0 съвпадения на „Сиела“, 0 на „web.apis.bg“; всички 8 съвпадения на низа „АПИС“ са вътре в думата „ЗАПИС“ (проверка по цяла дума → 0). НЕДОКАЗАНО: метаданните на файла са Title „Microsoft Word - Norms_-14917630_90“, Author „dimitar.kokinov“, Producer „Microsoft: Print To PDF“ — произходът на самата консолидация не се доказва от документа и изисква решение на правния отговорник. Текстът съдържа разпоредби с БЪДЕЩА дата на влизане в сила 02.03.2027 г. (ДВ бр. 69 от 2026 г.) — при евентуално поглъщане те се пазят с отметката и не се поднасят като действащи. Броят първични членове и последният първичен член НЕ се записват тук: те не са потвърдени през разчитача на поглъщането.",
    expectedCadence: "monthly",
    parserVersion: "law-pdf-v2",
    allowedContentTypes: [...PDF_TYPES],
    maxBytes: 12_000_000,
    timeoutMs: 60_000,
  },
  {
    sourceKey: "bg_constcourt_constitution",
    title: "Конституция на Република България — официална страница на Конституционния съд",
    jurisdiction: "BG",
    authorityTier: "official_administrative_consolidation",
    origin: "https://www.constcourt.bg",
    entryPath: "/bg/legal-info-92",
    allowedPathPrefixes: ["/bg/legal-info-92"],
    accessMethod: "html_index",
    adapterId: "bg_constcourt_html",
    checksumBasis: "extracted_text",
    enabled: true,
    watchOnly: false,
    reviewStatus: "approved",
    owner: "legal-ops",
    reviewNotes:
      "Официална страница на Конституционния съд на Република България с пълния текст на Конституцията. Официална административна КОНСОЛИДАЦИЯ с анотации, НЕ обнародване: автентичен остава текстът в Държавен вестник. Проверено: HTTP 200 без пренасочване, text/html; charset=UTF-8, 329 179 байта, SHA-256 f5f5b107862beec8c5a6ef250e4357afce71a2964b6216ccdb97a5cbb4207493, заглавие „КОНСТИТУЦИЯ НА РЕПУБЛИКА БЪЛГАРИЯ“, обн. ДВ бр. 56 от 13.07.1991 г., в сила от 13.07.1991 г., изм. и доп. до ДВ бр. 106 от 22.12.2023 г.; Решение № 13 на КС на РБ от 26.07.2024 г. — ДВ бр. 66 от 6.08.2024 г. Разпознати 175 члена. ВАЖНО: текстът съдържа анотации „обявен/обявена за противоконституционен/на“ (чл. 91б, чл. 126, чл. 129 ал. 4, чл. 149, чл. 150, чл. 151); те се съхраняват дословно в частите и такива разпоредби НЕ се поднасят като действащо правило без този статус. Конституцията е основополагащ контекст и НЕ замества ЗЗД, ОРЗД, ГПК или ЗДДС.",
    expectedCadence: "monthly",
    parserVersion: "law-html-v1",
    allowedContentTypes: ["text/html"],
    maxBytes: 4_000_000,
    timeoutMs: 45_000,
    lawBinding: {
      shortCode: "КРБ",
      title: "Конституция на Република България",
      sourceType: "constitution",
      issuer: "Велико Народно събрание",
      format: "html",
      effectiveFrom: "1991-07-13",
      // Консервативен праг от успешната проба (175 разпознати члена), не измислен.
      minArticles: 150,
      requiredTextMarkers: [
        "КОНСТИТУЦИЯ НА РЕПУБЛИКА БЪЛГАРИЯ",
        "бр. 56 от 13.07.1991 г.",
        "бр. 106 от 22.12.2023 г.",
        "Решение № 13 на КС на РБ от 26.07.2024 г.",
      ],
    },
  },

  {
    sourceKey: "bg_kzp_consumer_act",
    title: "Закон за защита на потребителите — официален файл на КЗП",
    jurisdiction: "BG",
    authorityTier: "official_administrative_consolidation",
    origin: "https://kzp.bg",
    entryPath: "/upload/171815/ZAKON_za_zashtita_na_potrebitelite%20%284%29.docx",
    allowedPathPrefixes: ["/upload/171815/"],
    accessMethod: "file_export",
    adapterId: "bg_official_docx",
    enabled: true,
    watchOnly: false,
    reviewStatus: "approved",
    owner: "legal-ops",
    reviewNotes:
      "Официален DOCX на Комисията за защита на потребителите. Официална административна консолидация, НЕ обнародване.",
    expectedCadence: "monthly",
    parserVersion: "law-docx-v1",
    allowedContentTypes: [...DOCX_TYPES],
    maxBytes: 8_000_000,
    timeoutMs: 30_000,
    lawBinding: {
      shortCode: "ЗЗП",
      title: "Закон за защита на потребителите",
      sourceType: "act",
      issuer: "Народно събрание",
      format: "docx",
      effectiveFrom: "2006-06-10",
      minArticles: 150,
    },
  },
  {
    sourceKey: "bg_registryagency_pdpa",
    title: "Закон за защита на личните данни — официален файл на Агенция по вписванията",
    jurisdiction: "BG",
    authorityTier: "official_administrative_consolidation",
    origin: "https://www.registryagency.bg",
    entryPath: "/media/filer_public/2026/08/01/zakon_za_zashchita_na_lichnite_danni.pdf",
    allowedPathPrefixes: ["/media/filer_public/2026/08/01/"],
    accessMethod: "file_export",
    adapterId: "bg_official_pdf",
    enabled: true,
    watchOnly: false,
    reviewStatus: "approved",
    owner: "legal-ops",
    reviewNotes:
      "Официален PDF на Агенция по вписванията, актуализиран до ДВ бр. 69/31.07.2026. Официална административна консолидация, НЕ обнародване.",
    expectedCadence: "monthly",
    parserVersion: "law-pdf-v1",
    allowedContentTypes: [...PDF_TYPES],
    maxBytes: 12_000_000,
    timeoutMs: 45_000,
    lawBinding: {
      shortCode: "ЗЗЛД",
      title: "Закон за защита на личните данни",
      sourceType: "act",
      issuer: "Народно събрание",
      format: "pdf",
      effectiveFrom: "2002-01-01",
      minArticles: 60,
    },
  },
  {
    sourceKey: "eu_gdpr_oj_bg",
    title: "Регламент (ЕС) 2016/679 (ОРЗД) — автентичен OJ на български",
    jurisdiction: "EU",
    authorityTier: "official_eu_publication",
    origin: "https://eur-lex.europa.eu",
    entryPath: "/eli/reg/2016/679/oj/bul",
    allowedPathPrefixes: ["/eli/reg/2016/679/"],
    accessMethod: "html_index",
    adapterId: "eu_eli_oj_html",
    enabled: false,
    watchOnly: false,
    reviewStatus: "needs_access_review",
    owner: "legal-ops",
    reviewNotes:
      "Автентична публикация в Официален вестник на ЕС. Endpoint-ът отговаря с HTTP 202 и защитна страница (WAF challenge) вместо текста, затова източникът остава изключен. Заобикаляне на защитата не се допуска и заместващо огледало не се използва.",
    expectedCadence: "monthly",
    parserVersion: "law-html-v1",
    allowedContentTypes: [...HTML_TYPES],
    maxBytes: 12_000_000,
    timeoutMs: 45_000,
    lawBinding: {
      shortCode: "ОРЗД",
      title: "Регламент (ЕС) 2016/679 (Общ регламент относно защитата на данните)",
      sourceType: "regulation",
      issuer: "Европейски парламент и Съвет",
      format: "html",
      effectiveFrom: "2018-05-25",
      minArticles: 90,
    },
  },
  {
    sourceKey: "bg_state_gazette",
    title: "Държавен вестник (dv.parliament.bg) — официално обнародване",
    jurisdiction: "BG",
    authorityTier: "official_promulgation",
    origin: "https://dv.parliament.bg",
    entryPath: "/",
    allowedPathPrefixes: ["/DVWeb/", "/"],
    accessMethod: "html_index",
    adapterId: "bg_state_gazette_index",
    enabled: false,
    watchOnly: false,
    reviewStatus: "needs_access_review",
    owner: "legal-ops",
    reviewNotes:
      "Единственият авторитетен източник за обнародване. Точният машинно четим index/RSS endpoint още не е проверен от нас, затова източникът е регистриран изключен до писмено потвърждение за условията за ползване и стабилен endpoint.",
    expectedCadence: "weekly",
    parserVersion: "v1",
    allowedContentTypes: [...HTML_TYPES, ...XML_TYPES],
    maxBytes: 2_000_000,
    timeoutMs: 15_000,
  },
  {
    sourceKey: "bg_national_assembly",
    title: "Народно събрание — официален законодателен процес",
    jurisdiction: "BG",
    authorityTier: "official_legislative_process",
    origin: "https://www.parliament.bg",
    entryPath: "/bg/laws",
    allowedPathPrefixes: ["/bg/laws", "/bg/bills"],
    accessMethod: "html_index",
    adapterId: "bg_national_assembly_index",
    enabled: false,
    watchOnly: true,
    reviewStatus: "needs_access_review",
    owner: "legal-ops",
    reviewNotes:
      "Приети/внесени законопроекти. Само наблюдение: приемането не е обнародване и никога не поражда „действащо право“ в системата.",
    expectedCadence: "weekly",
    parserVersion: "v1",
    allowedContentTypes: [...HTML_TYPES, ...XML_TYPES],
    maxBytes: 2_000_000,
    timeoutMs: 15_000,
  },
  {
    sourceKey: "bg_strategy_consultations",
    title: "Strategy.bg — обществени консултации (само watchlist)",
    jurisdiction: "BG",
    authorityTier: "official_consultation",
    origin: "https://www.strategy.bg",
    entryPath: "/PublicConsultations",
    allowedPathPrefixes: ["/PublicConsultations"],
    accessMethod: "rss",
    adapterId: "bg_strategy_consultations_rss",
    enabled: false,
    watchOnly: true,
    reviewStatus: "needs_access_review",
    owner: "legal-ops",
    reviewNotes:
      "Само проекти за нормативни актове. НИКОГА не се четат публични коментари, профили или прикачени файлове. Всеки елемент е lifecycle=proposed.",
    expectedCadence: "daily",
    parserVersion: "v1",
    allowedContentTypes: [...XML_TYPES, ...HTML_TYPES],
    maxBytes: 1_000_000,
    timeoutMs: 15_000,
  },
  {
    sourceKey: "eu_eurlex_oj",
    title: "EUR-Lex / Официален вестник на ЕС — автентична публикация",
    jurisdiction: "EU",
    authorityTier: "official_eu_publication",
    origin: "https://eur-lex.europa.eu",
    entryPath: "/oj/direct-access.html",
    allowedPathPrefixes: ["/oj/", "/legal-content/"],
    accessMethod: "html_index",
    adapterId: "eu_eurlex_oj_index",
    enabled: false,
    watchOnly: false,
    reviewStatus: "needs_access_review",
    owner: "legal-ops",
    reviewNotes:
      "Авторитетен е само електронният OJ. Консолидираните текстове са помощни и НЕ са автентични — те се маркират отделно (official_eu_consolidated_helper).",
    expectedCadence: "daily",
    parserVersion: "v1",
    allowedContentTypes: [...HTML_TYPES, ...XML_TYPES],
    maxBytes: 3_000_000,
    timeoutMs: 20_000,
  },
  {
    sourceKey: "eu_cellar_metadata",
    title: "CELLAR (publications.europa.eu) — официални метаданни/консолидации",
    jurisdiction: "EU",
    authorityTier: "official_eu_consolidated_helper",
    origin: "https://publications.europa.eu",
    entryPath: "/webapi/rdf/sparql",
    allowedPathPrefixes: ["/webapi/rdf/sparql", "/resource/cellar"],
    accessMethod: "sparql",
    adapterId: "eu_cellar_sparql",
    enabled: false,
    watchOnly: true,
    reviewStatus: "needs_access_review",
    owner: "legal-ops",
    reviewNotes:
      "Помощен източник за метаданни и консолидации. Консолидираният текст е НЕАВТЕНТИЧЕН; за автентичност винаги се сочи OJ.",
    expectedCadence: "daily",
    parserVersion: "v1",
    allowedContentTypes: ["application/sparql-results+json", "application/json", ...XML_TYPES],
    maxBytes: 3_000_000,
    timeoutMs: 20_000,
  },

  /* ---------------------------------------------------------------- */
  /* Агенция по вписванията — официален нормативен указател (01.08.2026) */
  /* ---------------------------------------------------------------- */
  {
    sourceKey: "bg_registryagency_zzd",
    title: "Закон за задълженията и договорите — официален файл на Агенция по вписванията",
    jurisdiction: "BG",
    authorityTier: "official_administrative_consolidation",
    origin: "https://www.registryagency.bg",
    entryPath: "/media/filer_public/2026/08/01/zakon_za_zadlzheniiata_i_dogovorite.pdf",
    allowedPathPrefixes: ["/media/filer_public/2026/08/01/zakon_za_zadlzheniiata_i_dogovorite.pdf"],
    accessMethod: "file_export",
    adapterId: "bg_official_pdf",
    enabled: true,
    watchOnly: false,
    reviewStatus: "approved",
    owner: "legal-ops",
    reviewNotes:
      "Официален PDF, посочен от нормативния указател на Агенция по вписванията (https://www.registryagency.bg/bg/za-agenciyata/normativna-uredba/). Официална административна КОНСОЛИДАЦИЯ, НЕ обнародване: автентичен остава текстът в Държавен вестник. Проверено 23.09.2026: HTTP 200 без пренасочване, строга TLS проверка (verify=0), application/pdf, 744 999 байта, SHA-256 c7f21935ec0557253a09b4440da4249bf2497d727e116091a23060129c0365df, last-modified 01.08.2026, 57 страници, заглавие „ЗАКОН ЗА ЗАДЪЛЖЕНИЯТА И ДОГОВОРИТЕ“, обн. ДВ бр. 275 от 22.11.1950 г., последно отразено изменение ДВ бр. 35 от 27.04.2021 г., 452 разпознати първични члена (до чл. 449). ВАЖНО: датата на качване 01.08.2026 НЕ е дата на изменение. ВНИМАНИЕ: в преходните разпоредби дословно са цитирани чл. 1001а-1001г от ОТМЕНЕНИЯ ГПК — те се пазят като цитат, а не като норми на ЗЗД. Отменените членове запазват отметката „(Отм. …)“.",
    expectedCadence: "monthly",
    parserVersion: "law-pdf-v1",
    allowedContentTypes: [...PDF_TYPES],
    maxBytes: 8_000_000,
    timeoutMs: 60_000,
    lawBinding: {
      shortCode: "ЗЗД",
      title: "Закон за задълженията и договорите",
      sourceType: "act",
      issuer: "Народно събрание",
      format: "pdf",
      effectiveFrom: "1951-01-01",
      chunker: "bg_act",
      lastPrimaryArticle: "449",
      // Консервативен праг под измерените 452 първични члена, не произволен.
      minArticles: 440,
      requiredTextMarkers: [
        "ЗАКОН ЗА ЗАДЪЛЖЕНИЯТА И ДОГОВОРИТЕ",
        "обн. ДВ. бр.275 от 22 Ноември 1950г.",
        "изм. ДВ. бр.35 от 27 Април 2021г.",
      ],
    },
  },
  {
    sourceKey: "bg_registryagency_gpk",
    title: "Граждански процесуален кодекс — официален файл на Агенция по вписванията",
    jurisdiction: "BG",
    authorityTier: "official_administrative_consolidation",
    origin: "https://www.registryagency.bg",
    entryPath: "/media/filer_public/2026/08/01/grazhdanski_protsesualen_kodeks.pdf",
    allowedPathPrefixes: ["/media/filer_public/2026/08/01/grazhdanski_protsesualen_kodeks.pdf"],
    accessMethod: "file_export",
    adapterId: "bg_official_pdf",
    enabled: true,
    watchOnly: false,
    reviewStatus: "approved",
    owner: "legal-ops",
    reviewNotes:
      "Официален PDF от нормативния указател на Агенция по вписванията. Официална административна КОНСОЛИДАЦИЯ, НЕ обнародване. Проверено 23.09.2026: HTTP 200, строга TLS проверка (verify=0), application/pdf, 1 482 360 байта, SHA-256 14591570e54cb824d2ee6b713fa697e42a77f12a1a6c8e9c0b85a760648ce6fd, last-modified 01.08.2026, 260 страници, заглавие „ГРАЖДАНСКИ ПРОЦЕСУАЛЕН КОДЕКС“, в сила от 01.03.2008 г., обн. ДВ бр. 59 от 20.07.2007 г., последно отразено изменение ДВ бр. 55 от 16.06.2026 г., 719 разпознати първични члена (до чл. 640). ВНИМАНИЕ: в заключителните разпоредби дословно са цитирани членове на ИЗМЕНЯНИ актове (напр. чл. 708 от Търговския закон, чл. 16/36/54/61 и чл. 22а-22н от други закони) — те се пазят като цитат, а не като норми на ГПК. Текстът съдържа и разпоредби с БЪДЕЩА дата на влизане в сила (напр. 01.07.2025 г. в чл. 417); те се пазят както са и не се поднасят като действащи без тази отметка.",
    expectedCadence: "monthly",
    parserVersion: "law-pdf-v1",
    allowedContentTypes: [...PDF_TYPES],
    maxBytes: 12_000_000,
    timeoutMs: 60_000,
    lawBinding: {
      shortCode: "ГПК",
      title: "Граждански процесуален кодекс",
      sourceType: "code",
      issuer: "Народно събрание",
      format: "pdf",
      effectiveFrom: "2008-03-01",
      chunker: "bg_act",
      lastPrimaryArticle: "640",
      // Консервативен праг под измерените 719 ПЪРВИЧНИ члена. Цитираните в
      // заключителните разпоредби членове НЕ се броят.
      minArticles: 700,
      requiredTextMarkers: [
        "ГРАЖДАНСКИ ПРОЦЕСУАЛЕН КОДЕКС",
        "В сила от 01.03.2008 г.",
        "Обн. ДВ. бр.59 от 20 Юли 2007г.",
        "изм. ДВ. бр.55 от 16 Юни 2026г.",
      ],
    },
  },
  {
    sourceKey: "bg_registryagency_gdpr",
    title:
      "Регламент (ЕС) 2016/679 (ОРЗД) — официално възпроизвеждане на Агенция по вписванията",
    jurisdiction: "EU",
    authorityTier: "official_administrative_consolidation",
    origin: "https://www.registryagency.bg",
    entryPath:
      "/media/filer_public/2026/08/01/reglament_es_2016_679_na_evropeiskiia_parlament_i_na_sveta_ot_27_april_2016_godina_otnosno_zashchitata_na_fizicheskite_litsa_vv_vrzka_s_obrabotvaneto_na_lichni_danni_i_otnosno_svobodnoto_dvizhenie_na_takiva_danni.pdf",
    allowedPathPrefixes: [
      "/media/filer_public/2026/08/01/reglament_es_2016_679_na_evropeiskiia_parlament_i_na_sveta_ot_27_april_2016_godina_otnosno_zashchitata_na_fizicheskite_litsa_vv_vrzka_s_obrabotvaneto_na_lichni_danni_i_otnosno_svobodnoto_dvizhenie_na_takiva_danni.pdf",
    ],
    accessMethod: "file_export",
    adapterId: "bg_official_pdf",
    enabled: false,
    watchOnly: true,
    reviewStatus: "rejected",
    owner: "legal-ops",
    reviewNotes:
      "КАРАНТИНИРАН НА 23.09.2026 — НЕ Е ДЕЙСТВАЩ ТЕКСТ. Файлът е официален PDF от нормативния указател на Агенция по вписванията (възпроизвеждане, НЕ автентична публикация в ОВ), но възпроизвежда ПЪРВОНАЧАЛНАТА редакция на ОВ L 119, 4.5.2016 г. БЕЗ официалната ПОПРАВКА (ОВ L 127, 23.5.2018 г., стр. 2; CELEX 32016R0679R(02)). Доказано: заглавието на чл. 14 е „Информация, предоставяна, когато личните данни ИДВАТ от субекта на данните“ (стр. 64), а чл. 80, параграф 2 препраща към надзорния орган по член 73 (стр. 127); поправката заменя тези текстове съответно с „не са получени от субекта на данните“ и препратка към член 77. Поправката засяга и съображение 71, чл. 37, 41, 42, 43, 57, 64, 65, 69, 70, 81, 83 и 86. Затова източникът е изключен (enabled:false, watchOnly, rejected) и заредените от него данни са деактивирани в базата без изтриване (снимките и историята се пазят). Действащата разпоредителна част се взема от eu_op_gdpr_consolidated. Предишна проба (23.09.2026): HTTP 200, строга TLS проверка (verify=0), application/pdf, 1 042 641 байта, SHA-256 f6063945b31f3f39155bec9d6a5bf4c16b28a877100ea3e52ff50164bc405e29, 140 страници, 99 члена и 173 съображения — успешното изтегляне НЕ доказва актуалност.",
    expectedCadence: "monthly",

    parserVersion: "law-pdf-v1",
    allowedContentTypes: [...PDF_TYPES],
    maxBytes: 8_000_000,
    timeoutMs: 60_000,
    lawBinding: {
      // Кратък код, РАЗЛИЧЕН от действащия „ОРЗД“: карантинираният текст не
      // може да заеме мястото на действащата разпоредителна част в базата.
      shortCode: "ОРЗД-АВ-БЕЗ-ПОПРАВКА",
      title:
        "Регламент (ЕС) 2016/679 (ОРЗД) — некоригирано възпроизвеждане (карантинирано)",
      sourceType: "regulation",
      issuer: "Европейски парламент и Съвет на ЕС",
      format: "pdf",
      effectiveFrom: "2018-05-25",
      chunker: "eu_regulation",
      // Регламентът има точно 99 члена: непълен текст е провал.
      minArticles: 99,
      minRecitals: 173,
      hasPreamble: true,
      requiredTextMarkers: [
        "Регламент (ЕС) 2016/679",
        "Celex номер: 32016R0679",
        "ОВ L 119, 4.5.2016 г. стр. 1-88",
        "Дата на влизане в сила: 25.5.2018 г.",
        "ПРИЕХА НАСТОЯЩИЯ РЕГЛАМЕНТ:",
      ],
    },
  },
  {
    sourceKey: "eu_op_gdpr_consolidated",
    title:
      "Регламент (ЕС) 2016/679 (ОРЗД) — официална консолидация на Службата за публикации на ЕС (CELEX 02016R0679-20160504)",
    jurisdiction: "EU",
    authorityTier: "official_eu_consolidated_helper",
    origin: "https://op.europa.eu",
    entryPath:
      "/o/opportal-service/download-handler?identifier=5f2552c2-cc45-11e6-ad7c-01aa75ed71a1&format=pdfa1a&language=bg",
    allowedPathPrefixes: ["/o/opportal-service/download-handler"],
    accessMethod: "file_export",
    adapterId: "eu_official_pdf",
    enabled: true,
    watchOnly: false,
    reviewStatus: "approved",
    owner: "legal-ops",
    reviewNotes:
      "ОФИЦИАЛНА КОНСОЛИДИРАНА версия на Службата за публикации на ЕС, изтеглена през обявената връзка за изтегляне на страницата на публикацията (op.europa.eu, publication 5f2552c2-cc45-11e6-ad7c-01aa75ed71a1, формат PDF/A, език BG) — без заобикаляне на достъп. Проба 23.09.2026: HTTP 200, строга TLS проверка (verify=0), application/pdf, 1 008 425 байта, PDF/A 1.4, 78 страници. ЧЕСТНО ОЗНАЧАВАНЕ: текстът НОСИ изричната уговорка „Този текст служи само за информационни цели и няма правно действие“ и НЕ е автентичната публикация в ОВ — затова нивото е official_eu_consolidated_helper, а не official_eu_publication, и не е обнародване. Автентичният текст остава ОВ L 119, 4.5.2016 г., стр. 1-88 (CELEX 32016R0679) с поправка ОВ L 127, 23.5.2018 г., стр. 2 (CELEX 32016R0679R(02)); прекият достъп до EUR-Lex (и двата маршрута) остава блокиран с HTTP 202 защитна страница, а cpdp.bg дава TLS грешка (ssl_verify_result 20) — записите за тези провали се пазят отделно и не са заобикаляни. ПОПРАВКАТА Е ОТРАЗЕНА: в текста има 13 блока с редакционна отметка ▼ C1 („Поправен със: ► C1 Поправка, ОВ L 127, 23.5.2018 г., стр. 2 (2016/679)“) по членове 14, 37, 41 (2), 42, 43, 57, 64 (2), 69, 70 (2) и 80 — чл. 14 вече е „Информация, предоставяна, когато личните данни не са получени от субекта на данните“, а чл. 80, параграф 2 препраща към надзорния орган, компетентен съгласно член 77. ОГРАНИЧЕНИЕ: консолидацията съдържа САМО разпоредителната част — НЯМА съображения (включително поправеното съображение 71); тълкувателният контекст от съображенията остава непокрит, докато автентичен източник не стане достъпен.",
    expectedCadence: "monthly",
    // v2: редакционните отметки ▼/► непосредствено след „Член N“ вече се пазят
    // в съдържанието на члена вместо да се изхвърлят при разпознаването.
    parserVersion: "law-pdf-v2",

    allowedContentTypes: [...PDF_TYPES],
    maxBytes: 8_000_000,
    timeoutMs: 60_000,
    lawBinding: {
      shortCode: "ОРЗД",
      title: "Регламент (ЕС) 2016/679 (Общ регламент относно защитата на данните)",
      sourceType: "regulation",
      issuer: "Европейски парламент и Съвет на ЕС",
      format: "pdf",
      effectiveFrom: "2018-05-25",
      chunker: "eu_regulation",
      // Регламентът има точно 99 члена: непълен текст е провал.
      minArticles: 99,
      // Консолидацията няма преамбюл; затова и нула съображения. Това се
      // декларира изрично, за да не мине непълен текст за пълен.
      hasPreamble: false,
      minRecitals: 0,
      requiredTextMarkers: [
        "02016R0679 — BG — 04.05.2016 — 000.002",
        "Поправка , ОВ L 127, 23.5.2018 г ., стр . 2 (2016/679)",
        "( ОВ L 119, 4.5.2016 г ., стр . 1)",
        "Информация , предоставяна , когато личните данни не са получени от субекта на данните",
        "компетентен съгласно член 77",
      ],
    },
  },
] as const satisfies readonly LegalSourceEntry[]);


/** Точен, затворен списък на разрешените origin-и. Lex.bg НЕ е тук. */
export const ALLOWED_ORIGINS: readonly string[] = Object.freeze(
  Array.from(new Set(LEGAL_SOURCE_REGISTRY.map((e) => e.origin))).sort(),
);

export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin);
}

export function getRegistryEntry(sourceKey: string): LegalSourceEntry | null {
  return LEGAL_SOURCE_REGISTRY.find((e) => e.sourceKey === sourceKey) ?? null;
}

export function enabledSources(): readonly LegalSourceEntry[] {
  return LEGAL_SOURCE_REGISTRY.filter((e) => e.enabled && e.reviewStatus === "approved");
}

/** Ред за идемпотентен upsert в public.legal_source_registry (без мрежа). */
export interface RegistrySyncRow {
  source_key: string;
  title: string;
  jurisdiction: Jurisdiction;
  authority_tier: AuthorityTier;
  origin: string;
  entry_path: string;
  access_method: AccessMethod;
  enabled: boolean;
  watch_only: boolean;
  review_status: ReviewStatus;
  owner: string;
  review_notes: string;
  expected_cadence: ExpectedCadence;
  parser_version: string;
}

export function registrySyncRows(): RegistrySyncRow[] {
  return LEGAL_SOURCE_REGISTRY.map((e) => ({
    source_key: e.sourceKey,
    title: e.title,
    jurisdiction: e.jurisdiction,
    authority_tier: e.authorityTier,
    origin: e.origin,
    entry_path: e.entryPath,
    access_method: e.accessMethod,
    // Fail-closed: изключен, докато условията/достъпът не са одобрени.
    enabled: e.enabled && e.reviewStatus === "approved",
    watch_only: e.watchOnly,
    review_status: e.reviewStatus,
    owner: e.owner,
    review_notes: e.reviewNotes.slice(0, 2000),
    expected_cadence: e.expectedCadence,
    parser_version: e.parserVersion,
  }));
}
