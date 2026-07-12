/**
 * Dogovori Icons — custom, Lucide-compatible icon set.
 *
 * Usage (drop-in replacement):
 *   import { Sparkles, ShieldCheck } from "@/icons";
 *
 * Any icon name NOT overridden below transparently falls back to lucide-react,
 * so partial migration is always safe — the app never breaks.
 */

// Fallback: re-export the LucideIcon type and anything not overridden below.
// The specific `export { X } from "./X"` lines beneath take precedence over
// the barrel `export *` — that's how partial migration stays safe.
export type { LucideIcon } from "lucide-react";
export * from "lucide-react";

// Bulk wrappers: apply Dogovori default stroke weight (1.75) to lucide icons
// that aren't hand-drawn. Loaded before the hand-crafted overrides so those
// still win.
export * from "./wrapped";

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

// Wave 2
export { Bird } from "./Bird";
export { Bot } from "./Bot";
export { Zap } from "./Zap";
export { Lock } from "./Lock";
export { Bell } from "./Bell";
export { Package } from "./Package";
export { Gift } from "./Gift";
export { Users } from "./Users";
export { Star } from "./Star";
export { Trophy } from "./Trophy";
export { Rocket } from "./Rocket";
export { PenTool } from "./PenTool";
export { Stamp } from "./Stamp";
export { Feather } from "./Feather";
export { Search } from "./Search";

export type { IconProps } from "./createIcon";
export { createIcon } from "./createIcon";
