/**
 * Типизирана фикстура: доказва, че РЕАЛНИЯТ изход на класификацията/маршрутизатора
 * се подава на помощника без никакви `any`/`unknown`/`Record` кастове, точно както
 * го прави обработчикът. Не се извикват мрежа, AI или база.
 */
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { routeModel } from "../_shared/model-router.ts";
import { unredact } from "../_shared/redact.ts";
import {
  buildGeneratorCacheIdentity,
  buildGeneratorClassificationCorpus,
  buildGeneratorContext,
  buildQaLines,
  redactGeneratorContext,
} from "./generator-context.ts";

export function pipelineFixture(body: unknown): string {
  const ctx = buildGeneratorContext(body as Parameters<typeof buildGeneratorContext>[0]);
  if ("ok" in ctx) return ctx.code;

  const corpus = buildGeneratorClassificationCorpus(ctx);
  const classification = classifyDocumentBeforeAI(corpus);
  const route = routeModel("generate-contract", classification, {
    userConfirmed: false,
    promptLength: corpus.length,
  });
  if (!route.allowed || route.requireConfirmation) return "gated";

  const safe = redactGeneratorContext(ctx, { redactionRequired: route.redactionRequired });
  if (safe.ok === false) return safe.code;

  const prompt = `${safe.context.partyA} ↔ ${safe.context.partyB}\n${buildQaLines(safe.context)}`;
  const identity = buildGeneratorCacheIdentity({
    context: ctx,
    promptVersion: "v3-doc-type",
    docTypeId: "contract",
    bilingual: false,
    arbitrationEnabled: false,
    callerKey: "user:fixture",
  });
  return `${identity.length}:${unredact(prompt, safe.mapping).length}`;
}
