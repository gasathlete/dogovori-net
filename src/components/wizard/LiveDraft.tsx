import { useEffect, useState, type ReactNode } from "react";

import type { Sector } from "@/data/sectors";
import { ProtectedContent } from "@/components/ProtectedContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, Lock, Sparkles, Feather } from "@/icons";
import { useAuth } from "@/hooks/useAuth";
import { loadTemplateDraft, fillTemplateDraft } from "@/lib/templateDraftResolver";
import type { DocumentTypeId } from "@/lib/documentReferences";
import { buildTypeSkeleton, isOneSidedType } from "@/lib/typeSkeletons";


/**
 * Скрива долната част на дълъг превю-документ зад градиент.
 * Започва фейд около 30% от височината с по-силен fade за четливост.
 * Цел: задържа интереса и пречи на screenshot/copy извличане на пълния текст.
 */

import {
  type Clause,
  renderPartyIdentifier,
  renderPartyTypeBadge,
  parseExtraPartyTypes,
  CURRENCY,
  BASE_CLOSING,
  buildGenericClauses,
  buildEmploymentClauses,
  buildPOAClauses,
  buildLoanClauses,
  buildFamilyNoticeClauses,
  buildInitialClauses,
} from "./liveDraft/clauseBuilders";
import {
  BILINGUAL_PLACEHOLDER_EN,
  TITLE_EN,
  translateTitleToEn,
  PARTY_ROLE_EN,
  translatePartyRole,
  renderPartyIdentifierEn,
  BilingualPreviewNote,
} from "./liveDraft/bilingualHelpers";
import {
  type BilingualLang,
  STRINGS as LANG_STRINGS,
  translateTitle as translateTitleLang,
  translateRole as translateRoleLang,
  renderPartyIdentifierLang,
} from "./liveDraft/bilingualLanguages";

function PreviewFadeGate({
  children,
  active,
  onDownloadBlank,
}: {
  children: ReactNode;
  active: boolean;
  onDownloadBlank?: () => void;
}) {
  if (!active) return <>{children}</>;
  return (
    <div className="relative">
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[25%] rounded-b-md"
        style={{
          background:
            "linear-gradient(to bottom, hsl(var(--card) / 0) 0%, hsl(var(--card) / 0.55) 25%, hsl(var(--card) / 0.92) 55%, hsl(var(--card)) 75%, hsl(var(--card)) 100%)",
          backdropFilter: "blur(2px)",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,1) 100%)",
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,1) 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-[58%] flex flex-col items-center gap-2 px-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-gradient-gold px-5 py-2.5 text-sm font-semibold text-navy shadow-elegant">
          <Sparkles className="h-4 w-4" />
          Завършете въпросника, за да генерирате пълния документ
        </div>
        {onDownloadBlank && (
          <button
            type="button"
            onClick={onDownloadBlank}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-gold/40 bg-card/90 px-4 py-2 text-xs font-medium text-foreground shadow-sm backdrop-blur transition hover:bg-card hover:border-gold"
          >
            <Feather className="h-3.5 w-3.5 text-gold" />
            или изтеглете като бланка
          </button>
        )}
      </div>

    </div>
  );
}





export function LiveDraft({
  sector,
  answers,
  generated,
  signature,
  isPro = false,
  docName,
  bilingual = false,
  bilingualLang = "en",
  documentType,
  onContractChange,
  onDownloadBlank,
}: {
  sector: Sector;
  answers: Record<string, string>;
  generated?: {
    title: string;
    preamble: string;
    clauses: { number: string; title: string; body: string; title_en?: string; body_en?: string }[];
    closing: string;
    bilingual?: boolean;
    title_en?: string;
    preamble_en?: string;
    closing_en?: string;
  } | null;
  signature?: {
    name_a: string;
    name_b: string;
    city: string;
    date: string;
    image_a?: string;
    image_b?: string;
  };
  isPro?: boolean;
  docName?: string;
  /** When true, render the pre-generation skeleton in BG/EN two columns. */
  bilingual?: boolean;
  /** Target language for the right-column skeleton translation. */
  bilingualLang?: BilingualLang;
  /** Selected document type — drives type-specific skeleton (agreement, notary invitation, etc.). */
  documentType?: DocumentTypeId | string | null;
  onContractChange?: (next: NonNullable<typeof generated>) => void;
  onDownloadBlank?: () => void;
}) {
  const partyA = answers.party_a_name || `[${sector.parties.a}]`;
  const partyB = answers.party_b_name || `[${sector.parties.b}]`;
  const sigA = signature?.name_a || partyA;
  const sigB = signature?.name_b || partyB;
  const [editing, setEditing] = useState(false);
  const [fontFamily, setFontFamily] = useState<string>("'Libre Baskerville', Georgia, serif");
  const [fontSize, setFontSize] = useState<number>(14);
  const editorInputClass = "bg-white text-gray-900 placeholder:text-gray-400 border-gray-300 focus-visible:ring-gold";
  const { user } = useAuth();
  // Fade за всички (не само гости) когато не редактираме и не сме генерирали финален документ —
  // целта е да задържи интереса и да накара потребителя да завърши въпросника / да изхарчи операция.
  const fadeActive = !editing;



  if (generated) {
    const updateClause = (idx: number, patch: Partial<{ title: string; body: string; number: string }>) => {
      if (!onContractChange) return;
      const next = {
        ...generated,
        clauses: generated.clauses.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
      };
      onContractChange(next);
    };
    const enLocked = !!(generated.bilingual && !isPro);
    const enLockClass = enLocked ? " blur-sm select-none pointer-events-none" : "";
    return (
      <ProtectedContent>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {editing && isPro ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-gold/30 bg-card/60 px-2 py-1.5">
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="h-8 rounded border border-border/60 bg-background px-2 text-xs"
                title="Шрифт"
              >
                <option value="'Libre Baskerville', Georgia, serif">Libre Baskerville</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="'Times New Roman', Times, serif">Times New Roman</option>
                <option value="Arial, Helvetica, sans-serif">Arial</option>
                <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
                <option value="'Calibri', sans-serif">Calibri</option>
                <option value="Verdana, sans-serif">Verdana</option>
              </select>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="h-8 rounded border border-border/60 bg-background px-2 text-xs"
                title="Размер"
              >
                {[10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map((s) => (
                  <option key={s} value={s}>{s}px</option>
                ))}
              </select>
            </div>
          ) : <div />}
          {isPro ? (
            <Button
              size="sm"
              variant={editing ? "default" : "outline"}
              onClick={() => setEditing((v) => !v)}
              className={editing ? "bg-gradient-gold text-navy" : "border-gold/40 hover:bg-gold/10 hover:text-gold"}
            >
              {editing ? <><Check className="mr-1 h-3.5 w-3.5" />Готово</> : <><Pencil className="mr-1 h-3.5 w-3.5" />Редактирай</>}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" /> Директна редакция — само "Предприемач"
            </span>
          )}
        </div>
        {enLocked && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-gold/40 bg-gold/10 p-3">
            <div className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <div>
                <div className="text-sm font-semibold text-foreground">Английската версия е заключена</div>
                <p className="text-xs text-muted-foreground">
                  Двуезичните договори (BG + EN) са PRO функция. Българската страна остава напълно достъпна.
                </p>
              </div>
            </div>
            <a
              href="/account?tab=subscription"
              className="shrink-0 rounded-md bg-gradient-gold px-3 py-1.5 text-xs font-semibold text-navy shadow-gold hover:opacity-90"
            >
              Отключи PRO
            </a>
          </div>
        )}
        <PreviewFadeGate active={false}>

        <article
          className="legal-paper rounded-md p-6 shadow-elegant md:p-8"
          style={editing && isPro ? { fontFamily, fontSize: `${fontSize}px` } : undefined}
        >

          {editing && isPro ? (
            <Input
              value={generated.title}
              onChange={(e) => onContractChange?.({ ...generated, title: e.target.value })}
              className={`text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl ${editorInputClass}`}
              style={{ fontFamily, fontSize: `${fontSize + 4}px` }}
            />
          ) : generated.bilingual ? (
            <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
              <span className="block">{generated.title}</span>
              <span className={`legal-paper-strong mt-1 block${enLockClass}`} aria-hidden={enLocked || undefined}>
                {generated.title_en || generated.title}
              </span>
            </h1>
          ) : (
            <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
              {generated.title}
            </h1>
          )}
          <div className="my-4 gold-divider" />
          {editing && isPro ? (
            <Textarea
              value={generated.preamble}
              onChange={(e) => onContractChange?.({ ...generated, preamble: e.target.value })}
              className={`min-h-[100px] text-sm leading-relaxed ${editorInputClass}`}
              style={{ fontFamily, fontSize: `${fontSize}px` }}
            />
          ) : generated.bilingual ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <p className="whitespace-pre-line text-sm leading-relaxed">{generated.preamble}</p>
              <p
                className={`legal-paper-strong whitespace-pre-line text-sm leading-relaxed md:border-l md:pl-6 md:legal-paper-divider${enLockClass}`}
                aria-hidden={enLocked || undefined}
              >
                {generated.preamble_en}
              </p>
            </div>
          ) : (
            <p className="whitespace-pre-line text-sm leading-relaxed">{generated.preamble}</p>
          )}
          {(generated.clauses ?? []).map((c, i) => (
            <section key={`${c.number}-${i}`} className="mt-6">
              {editing && isPro ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={c.number}
                      onChange={(e) => updateClause(i, { number: e.target.value })}
                      className={`w-20 font-serif font-bold uppercase ${editorInputClass}`}
                      style={{ fontFamily }}
                    />
                    <Input
                      value={c.title}
                      onChange={(e) => updateClause(i, { title: e.target.value })}
                      className={`flex-1 font-serif font-bold uppercase ${editorInputClass}`}
                      style={{ fontFamily }}
                    />
                  </div>
                  <Textarea
                    value={c.body}
                    onChange={(e) => updateClause(i, { body: e.target.value })}
                    className={`min-h-[120px] text-sm leading-relaxed ${editorInputClass}`}
                    style={{ fontFamily, fontSize: `${fontSize}px` }}
                  />
                </div>
              ) : generated.bilingual ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                  <div>
                    <h2 className="font-serif text-base font-bold uppercase">
                      {c.number} {c.title}
                    </h2>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
                  </div>
                  <div className={`md:border-l md:pl-6 md:legal-paper-divider${enLockClass}`} aria-hidden={enLocked || undefined}>
                    <h2 className="legal-paper-strong font-serif text-base font-bold uppercase">
                      {c.number} {c.title_en || c.title}
                    </h2>
                    <p className="legal-paper-strong mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body_en}</p>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="font-serif text-base font-bold uppercase">
                    {c.number} {c.title}
                  </h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
                </>
              )}
            </section>
          ))}
          <div className="my-6 gold-divider" />
          {editing && isPro ? (
            <Textarea
              value={generated.closing}
              onChange={(e) => onContractChange?.({ ...generated, closing: e.target.value })}
              className={`min-h-[80px] text-sm italic ${editorInputClass}`}
              style={{ fontFamily, fontSize: `${fontSize}px` }}
            />
          ) : generated.bilingual ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <p className="whitespace-pre-line text-sm italic">{generated.closing}</p>
              <p
                className={`legal-paper-strong whitespace-pre-line text-sm italic md:border-l md:pl-6 md:legal-paper-divider${enLockClass}`}
                aria-hidden={enLocked || undefined}
              >
                {generated.closing_en}
              </p>
            </div>
          ) : (
            <p className="text-sm italic">{generated.closing}</p>
          )}
          {(signature?.city || signature?.date) && (
            <p className="mt-6 text-sm">гр. {signature?.city || "_____"}, {signature?.date || "_____"}</p>
          )}
          <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs">
            <div>
              {signature?.image_a ? (
                <img src={signature.image_a} alt="Подпис А" className="mx-auto h-14 object-contain" />
              ) : (
                <div className="h-14" />
              )}
              <div className="border-t border-foreground/40 pt-2">За {sector.parties.a}</div>
              <div className="mt-1 font-bold">{sigA}</div>
            </div>
            <div>
              {signature?.image_b ? (
                <img src={signature.image_b} alt="Подпис Б" className="mx-auto h-14 object-contain" />
              ) : (
                <div className="h-14" />
              )}
              <div className="border-t border-foreground/40 pt-2">За {sector.parties.b}</div>
              <div className="mt-1 font-bold">{sigB}</div>
            </div>
          </div>
        </article>
        </PreviewFadeGate>
      </ProtectedContent>

    );
  }

  // Pre-filled boilerplate draft (per sector) — updates with answers
  const clauses = buildInitialClauses(sector, answers, docName);
  const documentTitle = docName || sector.contractName;
  const answeredCount = Object.values(answers).filter(
    (v) => typeof v === "string" && v.trim().length > 0,
  ).length;

  return (
    <ProtectedContent>
      <PreviewFadeGate active={fadeActive} onDownloadBlank={onDownloadBlank}>
        <TemplateDraftOrSkeleton
          docName={docName}
          answers={answers}
          signature={signature}
          documentTitle={documentTitle}
          sector={sector}
          partyA={partyA}
          partyB={partyB}
          clauses={clauses}
          answeredCount={answeredCount}
          bilingual={bilingual}
          bilingualLang={bilingualLang}
          documentType={documentType}
        />
      </PreviewFadeGate>
    </ProtectedContent>
  );
}

/**
 * Tries to resolve a pre-written template "бланка" for `docName` and renders
 * it with placeholders progressively filled from `answers`. Falls back to
 * the sector-generic skeleton when no matching template exists.
 */
function TemplateDraftOrSkeleton({
  docName,
  answers,
  signature,
  documentTitle,
  sector,
  partyA,
  partyB,
  clauses,
  answeredCount,
  bilingual = false,
  bilingualLang = "en",
  documentType,
}: {
  docName?: string;
  answers: Record<string, string>;
  signature?: { name_a: string; name_b: string; city: string; date: string };
  documentTitle: string;
  sector: Sector;
  partyA: string;
  partyB: string;
  clauses: Clause[];
  answeredCount: number;
  bilingual?: boolean;
  bilingualLang?: BilingualLang;
  documentType?: DocumentTypeId | string | null;
}) {
  const [draftRaw, setDraftRaw] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  // Реактивни списъци с типовете на допълнителните страни — LiveDraft ги
  // пре-рендерира на всяка промяна в +Add селектите за ФЛ/ЮЛ/ЕТ.
  const extraAtypes = parseExtraPartyTypes(answers.party_a_extra);
  const extraBtypes = parseExtraPartyTypes(answers.party_b_extra);

  useEffect(() => {
    let cancelled = false;
    setResolved(false);
    setDraftRaw(null);
    loadTemplateDraft(docName).then((text) => {
      if (cancelled) return;
      setDraftRaw(text);
      setResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [docName]);

  if (resolved && draftRaw) {
    const filled = fillTemplateDraft(draftRaw, { answers, signature });
    // Split on blank lines → paragraphs; keep single newlines inside paragraphs.
    const paragraphs = filled.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const [headerParagraph, ...rest] = paragraphs;

    if (bilingual) {
      const titleEn = translateTitleLang(headerParagraph || documentTitle, bilingualLang);
      const placeholder = LANG_STRINGS[bilingualLang].placeholder;
      return (
        <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
              {headerParagraph || documentTitle}
            </h1>
            <h1 className="legal-paper-strong text-center font-serif text-lg font-bold uppercase tracking-wide md:border-l md:pl-6 md:text-xl">
              {titleEn}
            </h1>
          </div>
          <div className="my-4 gold-divider" />
          {rest.map((p, i) => (
            <div key={i} className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <p className="whitespace-pre-line text-sm leading-relaxed">{p}</p>
              <p className="legal-paper-strong whitespace-pre-line text-sm italic leading-relaxed md:border-l md:pl-6">
                {placeholder}
              </p>
            </div>
          ))}
          <BilingualPreviewNote documentTitle={documentTitle} answeredCount={answeredCount} fromTemplate />
        </article>
      );
    }

    return (
      <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
        <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
          {headerParagraph || documentTitle}
        </h1>
        <div className="my-4 gold-divider" />
        {rest.map((p, i) => (
          <p key={i} className="mt-3 whitespace-pre-line text-sm leading-relaxed">
            {p}
          </p>
        ))}
        <div className="mt-8 rounded-md border border-dashed border-gold/30 bg-gold/[0.04] p-4 text-xs leading-relaxed text-foreground/75">
          <p className="font-semibold text-foreground/90">
            Това е оригиналната бланка на „{documentTitle}", която се попълва на живо с Вашите отговори.
          </p>
          <p className="mt-1.5">
            Финалният документ — с прецизни клаузи, оценка на риска и препоръки от ИИ — се
            генерира след завършване на въпросника.
            {answeredCount > 0 && (
              <span className="ml-1 text-gold">Попълнени са {answeredCount} отговора.</span>
            )}
          </p>
        </div>
      </article>
    );
  }

  // Type-specific skeleton override — when a non-contract documentType is
  // selected (e.g. Споразумение, Нотариална покана, Декларация, …) we render
  // a structure that matches that document type instead of the generic
  // two-party contract preamble.
  const typeSkeleton = buildTypeSkeleton(documentType, partyA, partyB, docName);
  if (typeSkeleton) {
    const { preambleLines, clauses: typeClauses } = typeSkeleton;
    if (bilingual) {
      const titleEn = translateTitleLang(documentTitle, bilingualLang);
      const placeholder = LANG_STRINGS[bilingualLang].placeholder;
      return (
        <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
              {documentTitle}
            </h1>
            <h1 className="legal-paper-strong text-center font-serif text-lg font-bold uppercase tracking-wide md:border-l md:pl-6 md:text-xl">
              {titleEn}
            </h1>
          </div>
          <div className="my-4 gold-divider" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            <div className="space-y-3 text-sm leading-relaxed">
              {preambleLines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <div className="legal-paper-strong space-y-3 text-sm italic leading-relaxed md:border-l md:pl-6">
              <p>{placeholder}</p>
            </div>
          </div>
          {typeClauses.map((c) => {
            const titleEnC = translateTitleLang(c.title, bilingualLang);
            return (
              <section key={c.roman} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                <div>
                  <h2 className="font-serif text-base font-bold uppercase">{c.roman} {c.title}</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
                </div>
                <div className="md:border-l md:pl-6">
                  <h2 className="legal-paper-strong font-serif text-base font-bold uppercase">{c.roman} {titleEnC}</h2>
                  <p className="legal-paper-strong mt-2 whitespace-pre-line text-sm italic leading-relaxed">
                    {placeholder}
                  </p>
                </div>
              </section>
            );
          })}
          <BilingualPreviewNote documentTitle={documentTitle} answeredCount={answeredCount} />
        </article>
      );
    }
    return (
      <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
        <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
          {documentTitle}
        </h1>
        <div className="my-4 gold-divider" />
        <div className="space-y-3 text-sm leading-relaxed">
          {preambleLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        {typeClauses.map((c) => (
          <section key={c.roman} className="mt-6">
            <h2 className="font-serif text-base font-bold uppercase">{c.roman} {c.title}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
          </section>
        ))}
        <div className="mt-8 rounded-md border border-dashed border-gold/30 bg-gold/[0.04] p-4 text-xs leading-relaxed text-foreground/75">
          <p className="font-semibold text-foreground/90">
            Това е примерен скелет на „{documentTitle}", оформен според структурата на избрания вид документ.
          </p>
          <p className="mt-1.5">
            Финалният документ — с прецизни клаузи, оценка на риска и препоръки от ИИ — се генерира след завършване на въпросника.
            {answeredCount > 0 && (
              <span className="ml-1 text-gold">Попълнени са {answeredCount} отговора.</span>
            )}
          </p>
        </div>
      </article>
    );
  }

  // Fallback: sector-generic skeleton (запазено поведение)
  if (bilingual) {
    const titleEn = translateTitleLang(documentTitle, bilingualLang);
    const S = LANG_STRINGS[bilingualLang];
    return (
      <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
            {documentTitle}
          </h1>
          <h1 className="legal-paper-strong text-center font-serif text-lg font-bold uppercase tracking-wide md:border-l md:pl-6 md:text-xl">
            {titleEn}
          </h1>
        </div>
        <div className="my-4 gold-divider" />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <div className="space-y-3 text-sm leading-relaxed">
            <p>Днес, [ДАТА], в гр. [ГРАД], между:</p>
            <p>
              <strong>1. {partyA}{renderPartyTypeBadge(answers.party_a_type)}</strong>
              {renderPartyIdentifier(answers.party_a_type)}, наричан по-долу „
              <em>{sector.parties.a}</em>", и
            </p>
            {extraAtypes.map((t, i) => (
              <p key={`a-extra-${i}`}>
                <strong>1.{i + 2} [{sector.parties.a}]{renderPartyTypeBadge(t)}</strong>
                {renderPartyIdentifier(t)}, наричан по-долу „<em>{sector.parties.a}</em>", и
              </p>
            ))}
            <p>
              <strong>2. {partyB}{renderPartyTypeBadge(answers.party_b_type)}</strong>
              {renderPartyIdentifier(answers.party_b_type)}, наричан по-долу „
              <em>{sector.parties.b}</em>",
            </p>
            {extraBtypes.map((t, i) => (
              <p key={`b-extra-${i}`}>
                <strong>2.{i + 2} [{sector.parties.b}]{renderPartyTypeBadge(t)}</strong>
                {renderPartyIdentifier(t)}, наричан по-долу „<em>{sector.parties.b}</em>",
              </p>
            ))}
            <p>се сключи настоящият документ за следното:</p>
          </div>
          <div className="legal-paper-strong space-y-3 text-sm italic leading-relaxed md:border-l md:pl-6">
            <p>{S.todayInBetween("[DATE]", "[CITY]")}</p>
            <p>
              <strong>1. {partyA}</strong>
              {renderPartyIdentifierLang(answers.party_a_type, bilingualLang)}, {S.hereinafter} „<em>{translateRoleLang(sector.parties.a, bilingualLang)}</em>", {S.and}
            </p>
            <p>
              <strong>2. {partyB}</strong>
              {renderPartyIdentifierLang(answers.party_b_type, bilingualLang)}, {S.hereinafter} „<em>{translateRoleLang(sector.parties.b, bilingualLang)}</em>",
            </p>
            <p>{S.enteredAsFollows}</p>
          </div>
        </div>

        {clauses.map((c) => {
          const titleEn = translateTitleLang(c.title, bilingualLang);
          return (
            <section key={c.roman} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <div>
                <h2 className="font-serif text-base font-bold uppercase">
                  {c.roman} {c.title}
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
              </div>
              <div className="md:border-l md:pl-6">
                <h2 className="legal-paper-strong font-serif text-base font-bold uppercase">
                  {c.roman} {titleEn}
                </h2>
                <p className="legal-paper-strong mt-2 whitespace-pre-line text-sm italic leading-relaxed">
                  {S.placeholder}
                </p>
              </div>
            </section>
          );
        })}

        <BilingualPreviewNote documentTitle={documentTitle} answeredCount={answeredCount} />
      </article>
    );
  }

  return (

      <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
        <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
          {documentTitle}
        </h1>
        <div className="my-4 gold-divider" />

        <p className="text-sm leading-relaxed">
          Днес, [ДАТА], в гр. [ГРАД], между:
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          <strong>1. {partyA}{renderPartyTypeBadge(answers.party_a_type)}</strong>
          {renderPartyIdentifier(answers.party_a_type)}, наричан по-долу „
          <em>{sector.parties.a}</em>", и
        </p>
        {extraAtypes.map((t, i) => (
          <p key={`a-extra-${i}`} className="mt-2 text-sm leading-relaxed">
            <strong>1.{i + 2} [{sector.parties.a}]{renderPartyTypeBadge(t)}</strong>
            {renderPartyIdentifier(t)}, наричан по-долу „<em>{sector.parties.a}</em>", и
          </p>
        ))}
        <p className="mt-2 text-sm leading-relaxed">
          <strong>2. {partyB}{renderPartyTypeBadge(answers.party_b_type)}</strong>
          {renderPartyIdentifier(answers.party_b_type)}, наричан по-долу „
          <em>{sector.parties.b}</em>",
        </p>
        {extraBtypes.map((t, i) => (
          <p key={`b-extra-${i}`} className="mt-2 text-sm leading-relaxed">
            <strong>2.{i + 2} [{sector.parties.b}]{renderPartyTypeBadge(t)}</strong>
            {renderPartyIdentifier(t)}, наричан по-долу „<em>{sector.parties.b}</em>",
          </p>
        ))}
        <p className="mt-3 text-sm leading-relaxed">
          се сключи настоящият документ за следното:
        </p>

        {clauses.map((c) => (
          <section key={c.roman} className="mt-6">
            <h2 className="font-serif text-base font-bold uppercase">
              {c.roman} {c.title}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
          </section>
        ))}

        <div className="mt-8 rounded-md border border-dashed border-gold/30 bg-gold/[0.04] p-4 text-xs leading-relaxed text-foreground/75">
          <p className="font-semibold text-foreground/90">
            Това е примерен скелет на „{documentTitle}", който се актуализира на живо с Вашите отговори.
          </p>
          <p className="mt-1.5">
            Финалният документ — с прецизни клаузи по ЗЗД/ТЗ/КТ, оценка на риска и препоръки от ИИ — се
            генерира след завършване на въпросника. Отнема ~2 минути.
            {answeredCount > 0 && (
              <span className="ml-1 text-gold">Попълнени са {answeredCount} отговора.</span>
            )}
          </p>
        </div>
      </article>
  );
}

/* ============================================================================
 * Bilingual preview helpers
 * --------------------------------------------------------------------------
 * Used only by the BG/EN two-column skeleton preview. The actual generated
 * contract carries authoritative *_en fields from the AI; these helpers exist
 * solely so the pre-generation skeleton already *looks* bilingual.
 * ========================================================================== */

