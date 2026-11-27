// Central model routing policy. Decides which model an operation may use
// given the document's classification, and whether fallback to a stronger
// model is allowed.

import type { Classification } from "./classify.ts";

export type AIOperation =
  | "generate-contract"
  | "build-custom-contract"
  | "analyze-contract"
  | "apply-corrections"
  | "correct-uploaded"
  | "ocr-contract"
  | "assistant-chat"
  | "suggest-followup-questions"
  | "refine-contract";

export interface RouteDecision {
  allowed: boolean;
  blockedReason?: string;
  model: string;
  fallbackChain: string[];
  allowFallback: boolean;
  requireConfirmation: boolean;
  redactionRequired: boolean;
}

const MODEL_FLASH_LITE = "google/gemini-2.5-flash-lite";
const MODEL_FLASH = "google/gemini-2.5-flash";
const MODEL_PRO = "google/gemini-2.5-pro";

interface RouteOpts {
  // Caller signals the user has acknowledged the sensitive-data warning.
  userConfirmed?: boolean;
  // Caller's preferred starting model (subject to policy clamp).
  preferredModel?: string;
  // Length of the (already redacted) prompt — drives lite vs flash defaults.
  promptLength?: number;
}

export function routeModel(
  operation: AIOperation,
  cls: Classification,
  opts: RouteOpts = {},
): RouteDecision {
  const promptLen = opts.promptLength ?? 0;
  const redactionRequired = cls.redaction_required;
  const requireConfirmation = cls.user_confirmation_required && !opts.userConfirmed;

  // Hard blocks for special-category data on operations that MUST send the
  // full document to a stronger model.
  if (cls.contains_special_category_data) {
    if (operation === "correct-uploaded" || operation === "ocr-contract") {
      return {
        allowed: false,
        blockedReason: "special_category_data_blocked_for_operation",
        model: "",
        fallbackChain: [],
        allowFallback: false,
        requireConfirmation: false,
        redactionRequired,
      };
    }
  }

  if (cls.risk_level === "blocked") {
    return {
      allowed: false,
      blockedReason: "classification_blocked",
      model: "",
      fallbackChain: [],
      allowFallback: false,
      requireConfirmation: false,
      redactionRequired,
    };
  }

  // Per-operation defaults.
  let model: string;
  let fallbackChain: string[] = [];
  let allowFallback = false;

  switch (operation) {
    case "generate-contract":
      // Generation is template-driven — keep on lite, no fallback.
      model = MODEL_FLASH_LITE;
      allowFallback = false;
      break;

    case "build-custom-contract":
      // Custom builder needs more reasoning for long prompts.
      model = promptLen > 6000 ? MODEL_FLASH : MODEL_FLASH_LITE;
      fallbackChain = cls.risk_level === "high" ? [] : [MODEL_FLASH];
      allowFallback = !cls.contains_special_category_data && cls.risk_level !== "high";
      break;

    case "analyze-contract":
      model = promptLen > 6000 ? MODEL_FLASH : MODEL_FLASH_LITE;
      if (cls.contains_special_category_data) {
        // No fallback to stronger model on special-category data.
        fallbackChain = [];
        allowFallback = false;
      } else if (cls.risk_level === "high") {
        // High risk PII (EGN/ID/IBAN) — allow flash only, no pro.
        fallbackChain = [MODEL_FLASH];
        allowFallback = true;
      } else {
        fallbackChain = [MODEL_FLASH, MODEL_PRO];
        allowFallback = true;
      }
      break;

    case "apply-corrections":
      // Corrections wave — flash is sufficient, no fallback to pro.
      model = MODEL_FLASH;
      allowFallback = false;
      break;

    case "correct-uploaded":
      // The strongest operation. Requires confirmation + redaction.
      // Blocked entirely on special-category (handled above).
      model = MODEL_PRO;
      fallbackChain = [];
      allowFallback = false;
      break;

    case "ocr-contract":
      model = MODEL_FLASH;
      allowFallback = false;
      break;

    case "assistant-chat":
    case "suggest-followup-questions":
      model = MODEL_FLASH_LITE;
      allowFallback = cls.risk_level !== "high";
      fallbackChain = allowFallback ? [MODEL_FLASH] : [];
      break;

    default:
      model = MODEL_FLASH_LITE;
      allowFallback = false;
  }

  // Clamp by allowed_models from classifier (safety net).
  if (cls.allowed_models.length > 0 && !cls.allowed_models.includes(model)) {
    model = cls.allowed_models[0];
  }
  fallbackChain = fallbackChain.filter((m) => cls.allowed_models.includes(m));

  // If caller asked for a stronger model and policy allows, honor it.
  if (opts.preferredModel && cls.allowed_models.includes(opts.preferredModel)) {
    model = opts.preferredModel;
  }

  return {
    allowed: true,
    model,
    fallbackChain,
    allowFallback,
    requireConfirmation,
    redactionRequired,
  };
}
