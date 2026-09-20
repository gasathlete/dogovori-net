// Edge function: lazy generation + signed-URL delivery of blank document templates (.docx)
// - Looks up an existing blank in `document_blanks` for { sector_id, document_name }.
// - If absent, generates a professional Bulgarian legal blank via Lovable AI Gateway,
//   packages it as a .docx, uploads to the `document-blanks` bucket and indexes it.
// - Always consumes the `template` quota for the calling user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { extractJson as extractJsonShared } from "../_shared/json.ts";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "https://esm.sh/docx@8.5.0";
import { buildCors } from "../_shared/cors.ts";
import { getDocumentTypeSpec, inferDocumentType } from "../_shared/document-types.ts";
import { buildBlankStoragePath } from "../_shared/blank-key.ts";


const SYSTEM_PROMPT = `Ти си български правен архитект с 20+ години практика. Генерираш ПРАЗНИ БЛАНКИ (шаблони) на български юридически език (ЗЗД, ТЗ, ЗУТ, ГПК, КТ, ЗННД).

Бланката трябва да:
- съдържа всички задължителни клаузи и реквизити според вида на конкретния документ;
- използва [квадратни скоби] за всички места, които ползвателят трябва да попълни (имена, ЕИК/ЕГН, адреси, суми в евро, срокове, дати);
- НЕ съдържа конкретни данни — само празни полета;
- е готова за разпечатване и нотариална/правна употреба;
- спазва точната терминология и структура за СЪОТВЕТНИЯ ВИД документ — разписка ≠ договор ≠ декларация ≠ пълномощно ≠ жалба ≠ искова молба ≠ нотариална покана ≠ оферта ≠ фактура ≠ протокол ≠ анекс ≠ приложение ≠ КСС/СМР;
- използва коректна номерация: римска за раздели (за договори/споразумения), "Чл. N." за членове, "(1),(2)" за алинеи; за по-кратки документи (разписка, декларация, пълномощно) — без излишна правна структура.

Връщай СТРОГО валиден JSON (без markdown), точно тази структура:
{
  "title": "Точното заглавие на документа",
  "preamble": "Уводен текст с [плейсхолдъри] за дата, място, страни",
  "clauses": [
    { "number": "I.", "title": "ПРЕДМЕТ", "body": "Чл. 1. ...\\nЧл. 2. ..." }
  ],
  "closing": "Заключителен текст + подписи"
}`;

const BILINGUAL_ADDENDUM = `

БИЛИНГВАЛЕН РЕЖИМ (BG/EN): ЗАДЪЛЖИТЕЛНО върни паралелен професионален английски превод. Към JSON схемата добави:
- "title_en": английското заглавие
- "preamble_en": английски превод на преамбюла, със [square bracket] плейсхолдъри
- "closing_en": английски превод на заключителния текст
- във всеки елемент на "clauses" — "title_en" и "body_en" с английски превод

Преводът е професионален легален английски (US/UK неутрален). Номерацията съответства 1:1 — където на български е "Чл. 1.", на английски е "Art. 1.". Английският текст НЕ заменя българския — двата съществуват паралелно и са огледални по съдържание. Запази всички плейсхолдъри в [квадратни скоби] и в двата езика.`;


interface BlankPayload {
  title: string;
  preamble: string;
  clauses: Array<{ number: string; title: string; body: string; title_en?: string; body_en?: string }>;
  closing: string;
  title_en?: string;
  preamble_en?: string;
  closing_en?: string;
}

function extractJson(raw: string): BlankPayload {
  // Shared tolerant parser: recovers from markdown fences, control chars and
  // responses truncated mid-string by the model's token limit.
  return extractJsonShared(raw) as BlankPayload;
}

function paragraphsFromText(text: string, opts: { bold?: boolean; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {}): Paragraph[] {
  const lines = (text ?? "").split(/\n+/).filter(Boolean);
  if (lines.length === 0) return [new Paragraph({ text: "" })];
  return lines.map((line) =>
    new Paragraph({
      alignment: opts.align ?? AlignmentType.JUSTIFIED,
      spacing: { after: 160 },
      children: [new TextRun({ text: line, size: opts.size ?? 22, bold: opts.bold })],
    }),
  );
}

function buildDocx(blank: BlankPayload, isBilingual: boolean): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [];

  if (isBilingual) {
    // ----- Two-column BG/EN layout (mirrors src/lib/exporters.ts twoColRow) -----
    const TABLE_W = 9026;
    const COL_W = Math.floor(TABLE_W / 2);
    const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const cellBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

    const twoColRow = (bg: Paragraph[], en: Paragraph[]) =>
      new Table({
        width: { size: TABLE_W, type: WidthType.DXA },
        columnWidths: [COL_W, COL_W],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: COL_W, type: WidthType.DXA },
                borders: cellBorders,
                margins: { top: 60, bottom: 60, left: 80, right: 160 },
                children: bg.length ? bg : [new Paragraph({ text: "" })],
              }),
              new TableCell({
                width: { size: COL_W, type: WidthType.DXA },
                borders: cellBorders,
                margins: { top: 60, bottom: 60, left: 160, right: 80 },
                children: en.length ? en : [new Paragraph({ text: "" })],
              }),
            ],
          }),
        ],
      });

    // Title
    children.push(
      twoColRow(
        [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: blank.title.toUpperCase(), bold: true, size: 28 })],
        })],
        [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: (blank.title_en || blank.title).toUpperCase(), bold: true, size: 28 })],
        })],
      ),
    );
    children.push(new Paragraph({ text: "" }));

    // Preamble
    children.push(twoColRow(paragraphsFromText(blank.preamble), paragraphsFromText(blank.preamble_en || "")));
    children.push(new Paragraph({ text: "" }));

    // Clauses
    for (const c of blank.clauses) {
      const bgHead = new Paragraph({
        children: [new TextRun({ text: `${c.number} ${c.title.toUpperCase()}`, bold: true, size: 24 })],
      });
      const enHead = new Paragraph({
        children: [new TextRun({ text: `${c.number} ${(c.title_en || c.title).toUpperCase()}`, bold: true, size: 24 })],
      });
      children.push(
        twoColRow(
          [bgHead, ...paragraphsFromText(c.body)],
          [enHead, ...paragraphsFromText(c.body_en || "")],
        ),
      );
      children.push(new Paragraph({ text: "" }));
    }

    if (blank.closing) {
      children.push(twoColRow(paragraphsFromText(blank.closing), paragraphsFromText(blank.closing_en || "")));
    }
  } else {
    // ----- Original single-column layout -----
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
        children: [new TextRun({ text: blank.title, bold: true, size: 36 })],
      }),
    );

    for (const line of blank.preamble.split(/\n+/).filter(Boolean)) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 200 },
          children: [new TextRun({ text: line, size: 24 })],
        }),
      );
    }

    for (const c of blank.clauses) {
      children.push(
        new Paragraph({
          spacing: { before: 320, after: 160 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `${c.number} ${c.title}`, bold: true, size: 26 }),
          ],
        }),
      );
      for (const line of c.body.split(/\n+/).filter(Boolean)) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 160 },
            children: [new TextRun({ text: line, size: 24 })],
          }),
        );
      }
    }

    if (blank.closing) {
      for (const line of blank.closing.split(/\n+/).filter(Boolean)) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 320, after: 160 },
            children: [new TextRun({ text: line, size: 24 })],
          }),
        );
      }
    }
  }

  // Discrete brand watermark on every page (header + footer).
  const watermarkHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "dogovori.net", bold: true, color: "C9A84C", size: 18 }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: isBilingual
              ? "Bilingual template · BG / EN"
              : "Архитект на Вашите сделки",
            color: "A0A0A0",
            size: 14,
            italics: true,
          }),
        ],
      }),
    ],
  });
  const watermarkFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "dogovori.net",
            color: "B0B0B0",
            size: 14,
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: "Dogovori.net",
    title: blank.title,
    styles: {
      default: { document: { run: { font: "Times New Roman", size: 24 } } },
    },
    sections: [{
      headers: { default: watermarkHeader },
      footers: { default: watermarkFooter },
      children,
    }],
  });

  return Packer.toBuffer(doc).then((b) => new Uint8Array(b));
}

// `safeKey` removed — see `_shared/blank-key.ts` `buildBlankStoragePath`,
// which transliterates Cyrillic and appends a SHA-1 hash so two different
// documents in the same sector can never collide on the same Storage path.

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Влезте в профила си.", requires_login: true }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    let userId: string | undefined;
    // ES256 (signing-keys) tokens — getClaims validates them.
    const { data: claimsData, error: claimsErr } = await admin.auth.getClaims(token);
    userId = claimsData?.claims?.sub as string | undefined;
    if (!userId) {
      // Legacy HS256 fallback.
      const { data: u, error: uErr } = await admin.auth.getUser(token);
      userId = u?.user?.id;
      if (!userId) {
        console.warn("[download-blank] 401 invalid token:", { claimsErr: claimsErr?.message, uErr: uErr?.message });
        return new Response(JSON.stringify({ error: "Невалиден токен.", requires_login: true, code: "auth_required" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const rawSectorId = String(body?.sector_id ?? "").trim();
    const rawDocumentName = String(body?.document_name ?? "").trim();
    const rawSectorTitle = String(body?.sector_title ?? "").trim();
    const isBilingual = Boolean(body?.bilingual);
    // Празен текст НИКОГА не се подава на UUID параметър: "" става SQL NULL.
    const { asUuidOrNull, asTextOrNull, canonicalRequestDigest } = await import(
      "../_shared/canonical-digest.ts"
    );
    const sessionId = asUuidOrNull(body?.session_id);
    const docKey = asTextOrNull(body?.doc_key);
    // Клиентският ключ на операцията е ЗАДЪЛЖИТЕЛЕН: без него повторният опит
    // не може да бъде идемпотентен и би генерирал и таксувал наново.
    const rawClientOpId = body?.operation_id ?? body?.client_operation_id;
    const clientOperationId = asUuidOrNull(rawClientOpId);
    if (!clientOperationId) {
      return new Response(
        JSON.stringify({
          error: "Липсва или е невалиден идентификатор на операцията.",
          code: rawClientOpId ? "invalid_operation_id" : "operation_id_required",
          charge_state: "not_charged",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    // Strict input validation to prevent prompt-cache poisoning. The generated
    // blank is shared globally by (sector_id, document_name), so untrusted
    // free-form text must never reach the AI prompt or the cache key.
    // - sector_id: lowercase slug, alphanumerics + dash, ≤ 64 chars.
    // - document_name / sector_title: printable text, no control chars / line
    //   breaks, ≤ 200 chars.
    const SECTOR_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
    const SAFE_TEXT_RE = /^[^\u0000-\u001F\u007F<>{}`]{1,200}$/;
    const sectorId = rawSectorId;
    const documentName = rawDocumentName;
    const sectorTitle = rawSectorTitle.slice(0, 200);

    if (
      !sectorId ||
      !documentName ||
      !SECTOR_RE.test(sectorId) ||
      !SAFE_TEXT_RE.test(documentName) ||
      (sectorTitle && !SAFE_TEXT_RE.test(sectorTitle))
    ) {
      return new Response(JSON.stringify({ error: "Невалидни параметри" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

    // Match the document type so the AI doesn't render every blank as a contract.
    const docTypeSpec = getDocumentTypeSpec(inferDocumentType(documentName));

    // СТРОГО ЗАЗЕМЯВАНЕ — ПРЕДИ таксуване и преди всяко повикване към модела.
    const { retrieveLegalContext } = await import("../_shared/legal-rag.ts");
    const legal = await retrieveLegalContext(
      // Различна minor версия на клиента — структурно съвместим.
      admin as unknown as Parameters<typeof retrieveLegalContext>[0],
      LOVABLE_API_KEY,
      `${documentName}\n${docTypeSpec.label}\n${sectorTitle || sectorId}`.slice(0, 4000),
      { matchCount: 6 },
    );
    if (!legal.hasMatches) {
      const { legalVerificationUnavailableResponse } = await import("../_shared/legal-gate.ts");
      return legalVerificationUnavailableResponse({ headers: corsHeaders });
    }

    // 1) РЕЗЕРВАЦИЯ на квота СЛЕД всички безплатни проверки и заземяването.
    // Леджърът (quota_operations) пази точния източник на таксуването, за да е
    // отмяната доказуема, идемпотентна и точно веднъж.
    const {
      reserveQuota,
      commitQuota,
      cancelQuota,
      billingReconciliationResponse,
      recordReconciliation,
    } = await import("../_shared/quota-ledger.ts");

    // Ключът се обвързва със СЪДЪРЖАНИЕТО на заявката.
    const requestDigest = await canonicalRequestDigest({
      purpose: "download_blank",
      sectorId,
      documentName,
      sectorTitle,
      isBilingual,
    });
    const operationId = clientOperationId;
    // ДЕТЕРМИНИРАН адрес на артефакта, обвързан с валидирания UUID на
    // операцията. Същият ключ винаги сочи същия обект, затова качване без
    // последващо обвързване е откриваемо, а не сирак.
    const CACHE_VERSION = isBilingual ? "v6-bilingual" : "v6";
    const blankBase = await buildBlankStoragePath(CACHE_VERSION, sectorId, documentName);
    const deterministicStoragePath = `request/op/${operationId}/${blankBase}`;
    const reservation = await reserveQuota(admin as unknown as Parameters<typeof reserveQuota>[0], {
      operationId,
      userId,
      kind: "template",
      purpose: "download_blank",
      sessionId,
      docKey,
      requestDigest,
    });
    if (reservation.status === "conflict") {
      return new Response(
        JSON.stringify({
          error: "Този идентификатор вече е използван за друга заявка.",
          code: "idempotency_key_conflict",
          charge_state: "not_charged",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // ПОВТОРЕНИЕТО се обработва ЕДИНСТВЕНО в блока за възстановяване по-долу:
    // подпис без доказано съществуване на обекта не е доказателство.

    if (reservation.status === "unavailable") {
      return new Response(
        JSON.stringify({ error: "Квотата не може да бъде проверена в момента. Опитайте отново.", charge_state: "not_charged" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // Неизравнена/недоказана отмяна: НЕ се таксува наново и НЕ се твърди нищо.
    if (reservation.status === "reconciliation") {
      await recordReconciliation(
        admin as unknown as Parameters<typeof recordReconciliation>[0],
        operationId,
        `reserve_${reservation.reason}`,
        { purpose: "download_blank" },
      );
      return billingReconciliationResponse(corsHeaders);
    }
    if (reservation.status === "denied") {
      return new Response(
        JSON.stringify({
          error: "quota_exceeded",
          reason: reservation.reason,
          next_reset: reservation.raw?.next_reset ?? null,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ВЪЗСТАНОВЯВАНЕ НА ВЕЧЕ КАЧЕНИЯ ТОЧЕН ФАЙЛ.
    //
    // Ако предишният опит е качил обекта, но отговорът/обвързването/
    // потвърждението са се загубили, същият ключ намира ТОЧНО този обект,
    // потвърждава квотата идемпотентно и подписва нов адрес — без ново
    // генериране и без второ таксуване. Подписване без доказано съществуване
    // НЕ е доказателство и не се прави.
    const { lookupBoundArtifact, verifyArtifactExists, bindArtifactToOperation } = await import(
      "../_shared/artifact-binding.ts"
    );
    const { isOperationInProgress, operationInProgressResponse } = await import(
      "../_shared/quota-ledger.ts"
    );
    const isReplay = reservation.status === "reserved" && reservation.replay === true &&
      reservation.retry !== true;
    const priorRef = (reservation.status === "reserved" ? reservation.resultRef : null) as
      | { bucket?: unknown; path?: unknown; filename?: unknown }
      | null;
    const filenameOut = isBilingual
      ? `${documentName} - бланка (BG-EN).docx`
      : `${documentName} - бланка.docx`;

    const reconcile = async (reason: string, extra: Record<string, unknown> = {}) => {
      await recordReconciliation(
        admin as unknown as Parameters<typeof recordReconciliation>[0],
        operationId,
        reason,
        { purpose: "download_blank", ...extra },
      );
      return billingReconciliationResponse(corsHeaders);
    };
    const conflictResponse = () =>
      new Response(
        JSON.stringify({
          error: "Този идентификатор вече е използван за друга заявка.",
          code: "idempotency_key_conflict",
          charge_state: "not_charged",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

    /** Потвърждава идемпотентно и връща СВЕЖ подпис върху доказан обект. */
    const serveExisting = async (bucket: string, path: string): Promise<Response> => {
      const settled = await commitQuota(
        admin as unknown as Parameters<typeof commitQuota>[0],
        operationId,
        { bucket, path, filename: filenameOut },
      );
      if (settled.status !== "settled") {
        return reconcile(`replay_commit_unresolved:${settled.reason}`, { bucket, path });
      }
      const { data: reSigned } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 10);
      if (!reSigned?.signedUrl) {
        return reconcile("replay_sign_failed", { bucket, path });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          url: reSigned.signedUrl,
          filename: filenameOut,
          cached: false,
          replay: true,
          operation_id: operationId,
          retry_idempotent: true,
          citations: legal.citations,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    };

    const { planBoundArtifact, planBoundExistence, planDeterministicRecovery } = await import(
      "./recovery.ts"
    );

    const bound = await lookupBoundArtifact(
      admin as unknown as Parameters<typeof lookupBoundArtifact>[0],
      { operationId, userId, purpose: "download_blank", requestDigest },
    );
    const firstPlan = planBoundArtifact({
      bound,
      priorRef: priorRef
        ? {
          bucket: typeof priorRef.bucket === "string" ? priorRef.bucket : null,
          path: typeof priorRef.path === "string" ? priorRef.path : null,
        }
        : null,
      isReplay,
    });
    if (firstPlan.action === "conflict") return conflictResponse();
    if (firstPlan.action === "reconcile") return reconcile(firstPlan.reason);

    if (bound.status === "match" && firstPlan.action === "check_bound") {
      const exists = await verifyArtifactExists(
        admin.storage as unknown as Parameters<typeof verifyArtifactExists>[0],
        bound.bucket,
        bound.path,
      );
      const plan = planBoundExistence(exists, bound.bucket, bound.path, isReplay);
      if (plan.action === "serve_bound") return await serveExisting(plan.bucket, plan.path);
      if (plan.action === "in_progress") return operationInProgressResponse(corsHeaders, 5);
      if (plan.action === "reconcile") {
        return reconcile(plan.reason, { bucket: bound.bucket, path: bound.path });
      }
    }

    // Няма обвързан ред. При повторение на още незавършена операция проверяваме
    // ДЕТЕРМИНИРАНИЯ адрес: там стои файл, качен от опит, спрял преди
    // обвързването. Второ генериране НЕ се стартира.
    if (bound.status === "none" && firstPlan.action === "check_bound") {
      const orphan = await verifyArtifactExists(
        admin.storage as unknown as Parameters<typeof verifyArtifactExists>[0],
        "document-blanks",
        deterministicStoragePath,
      );
      const plan = planDeterministicRecovery(orphan, isOperationInProgress(reservation));
      if (plan.action === "bind_deterministic") {
        const rebind = await bindArtifactToOperation(
          admin as unknown as Parameters<typeof bindArtifactToOperation>[0],
          {
            operationId,
            userId,
            bucket: "document-blanks",
            storagePath: deterministicStoragePath,
            purpose: "download_blank",
            requestDigest,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        );
        if (rebind.status === "conflict") return conflictResponse();
        if (rebind.status !== "bound") {
          return reconcile(`replay_bind_unresolved:${rebind.reason}`, {
            bucket: "document-blanks",
            path: deterministicStoragePath,
          });
        }
        return await serveExisting("document-blanks", deterministicStoragePath);
      }
      if (plan.action === "in_progress") return operationInProgressResponse(corsHeaders, 5);
      if (plan.action === "reconcile") {
        return reconcile(plan.reason, {
          bucket: "document-blanks",
          path: deterministicStoragePath,
        });
      }
    }
    const isPro = reservation.raw?.is_pro === true || undefined;

    /**
     * Единствен пазител за компенсация. Твърдим „charged: false" САМО когато
     * отмяната е потвърдена от базата. При неясен изход връщаме типизиран
     * billing_reconciliation_required и записваме траен запис за изравняване.
     */
    const cancelOrReport = async (reason: string): Promise<Response | null> => {
      const settled = await cancelQuota(admin as unknown as Parameters<typeof cancelQuota>[0], operationId, reason);
      if (settled.status === "settled") return null;
      return billingReconciliationResponse(corsHeaders);
    };

    try {
    // 2) СТАРИТЕ ГЛОБАЛНИ БЛАНКИ НЕ СЕ ПОДНАСЯТ: записите в document_blanks са
    // създадени без сървърно доказуем правен манифест и не могат да бъдат
    // проверени отново. Документът се изготвя наново за тази заявка и НЕ се
    // записва като глобално преизползваема бланка.
    let storagePath: string | undefined;

    // 3) Generate via AI Gateway with the grounded prompt.
    {
      const systemPrompt = `${SYSTEM_PROMPT}\n\n--- Специфика за този вид документ (${docTypeSpec.label}) ---\n${docTypeSpec.systemAddendum}${isBilingual ? BILINGUAL_ADDENDUM : ""}\n\n${legal.promptBlock}`;

      const userPrompt = `Сектор: ${sectorTitle || sectorId}\nВид документ: ${docTypeSpec.label}\nКонкретен документ: ${documentName}\n\nГенерирай професионална българска правна БЛАНКА (празен шаблон) за този КОНКРЕТЕН ВИД документ. Спазвай структурата за „${docTypeSpec.label}" — не я смесвай с друг вид документ.${isBilingual ? "\n\nЗАДЪЛЖИТЕЛНО: добави паралелен английски превод в полетата title_en, preamble_en, closing_en и в clauses[].title_en/body_en (виж системния промпт за билингвален режим)." : ""}`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      // Грешките на шлюза се нормализират: тялото му НИКОГА не стига до клиента.
      if (!aiRes.ok) {
        const { normalizeGatewayStatus, gatewayErrorResponse } = await import(
          "../_shared/gateway-error.ts"
        );
        const normalized = normalizeGatewayStatus(aiRes.status);
        const unresolved = await cancelOrReport(`ai_gateway_${aiRes.status}`);
        if (unresolved) return unresolved;
        return gatewayErrorResponse(normalized, corsHeaders, {
          charged: false,
          charge_state: "cancelled",
        });
      }

      const aiJson = await aiRes.json();
      const raw = aiJson?.choices?.[0]?.message?.content ?? "";
      const blank = extractJson(raw);

      const docxBytes = await buildDocx(blank, isBilingual);
      // Не се записва глобално преизползваема бланка без проверим правен
      // манифест — файлът е само за тази заявка.
      // ДЕТЕРМИНИРАН адрес, обвързан с операцията: ако процесът е спрял след
      // качването и преди обвързването, повторният опит по същия ключ намира
      // ТОЧНО този обект — иначе той остава неоткриваем сирак.
      storagePath = deterministicStoragePath;

      const { error: upErr } = await admin.storage
        .from("document-blanks")
        .upload(storagePath, docxBytes, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: true,
        });
      if (upErr) throw new Error(`upload: ${upErr.message}`);

      // ТРАЙНО ОБВЪРЗВАНЕ с операцията ПРЕДИ потвърждаване на квотата: така
      // повторен опит по същия ключ намира точно този обект. Ако обвързването
      // не успее, обектът се маха синхронно; ако и махането не е доказано,
      // случаят се записва за изравняване.
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const bindOutcome = await bindArtifactToOperation(
        admin as unknown as Parameters<typeof bindArtifactToOperation>[0],
        {
          operationId,
          userId,
          bucket: "document-blanks",
          storagePath,
          purpose: "download_blank",
          requestDigest,
          expiresAt,
        },
      );
      if (bindOutcome.status !== "bound") {
        const { error: rmErr } = await admin.storage
          .from("document-blanks")
          .remove([storagePath]);
        if (rmErr) {
          await recordReconciliation(
            admin as unknown as Parameters<typeof recordReconciliation>[0],
            operationId,
            `artifact_bind_failed_cleanup_unproven:${bindOutcome.reason}`,
            { purpose: "download_blank", bucket: "document-blanks", path: storagePath },
          );
        }
        throw new Error(`artifact_binding:${bindOutcome.reason}`);
      }
    }

    // 4) Sign and return.
    const { data: signed, error: signErr } = await admin.storage
      .from("document-blanks")
      .createSignedUrl(storagePath!, 60 * 10);
    if (signErr || !signed?.signedUrl) throw new Error(signErr?.message ?? "sign failed");

    const filename = isBilingual
      ? `${documentName} - бланка (BG-EN).docx`
      : `${documentName} - бланка.docx`;

    // Успешен изход — потвърждаваме таксуването точно веднъж И обвързваме
    // готовия файл с ключа, за да може повторен опит да върне същия документ.
    const committed = await commitQuota(
      admin as unknown as Parameters<typeof commitQuota>[0],
      operationId,
      { bucket: "document-blanks", path: storagePath!, filename },
    );
    if (committed.status !== "settled") {
      // Файлът ВЕЧЕ е трайно обвързан с операцията, затова НЕ се маха: махането
      // би направило възстановяването по същия ключ невъзможно. Записваме случая
      // за изравняване и връщаме типизирано състояние.
      await recordReconciliation(
        admin as unknown as Parameters<typeof recordReconciliation>[0],
        operationId,
        `commit_unresolved_artifact_retained:${committed.reason}`,
        {
          purpose: "download_blank",
          bucket: "document-blanks",
          path: storagePath,
          cleanup: "retained_for_recovery",
        },
      );
      return billingReconciliationResponse(corsHeaders);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        url: signed.signedUrl,
        filename,
        cached: false,
        is_pro: !!isPro,
        citations: legal.citations,
        // Ключът е клиентски и задължителен — повторението е идемпотентно.
        operation_id: operationId,
        retry_idempotent: true,
      }),

      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
    } catch (afterCharge) {
      // Всеки неуспешен краен изход след резервация се отменя точно веднъж.
      const unresolved = await cancelOrReport(`exception:${String((afterCharge as Error)?.message ?? afterCharge).slice(0, 200)}`);
      if (unresolved) return unresolved;
      throw afterCharge;
    }
  } catch (e) {
    // Нормализиран отговор: без вътрешни съобщения и без тела от шлюза.
    console.error("download-blank error", { name: e instanceof Error ? e.name : "unknown" });
    return new Response(
      JSON.stringify({
        error: "Възникна вътрешна грешка. Опитайте отново.",
        code: "internal_error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
