/**
 * Dogovori Icons — custom, Lucide-compatible icon set.
 *
 * Usage (drop-in replacement):
 *   import { Sparkles, ShieldCheck } from "@/icons";
 *
 * Any icon name NOT overridden below transparently falls back to lucide-react,
 * so partial migration is always safe — the app never breaks.
 */

// Fallback: re-export everything from lucide-react first...
export * from "lucide-react";

// ...then override with our custom, brand-matched icons.
// These take precedence over the lucide-react re-exports above.
export { Sparkles } from "./Sparkles";
export { Wand2 } from "./Wand2";
export { ShieldCheck } from "./ShieldCheck";
export { Scale } from "./Scale";
export { Gavel } from "./Gavel";
export { FileSignature } from "./FileSignature";
export { FileText } from "./FileText";
export { Handshake } from "./Handshake";
export { BookOpen } from "./BookOpen";
export { Crown } from "./Crown";

export type { IconProps } from "./createIcon";
export { createIcon } from "./createIcon";
