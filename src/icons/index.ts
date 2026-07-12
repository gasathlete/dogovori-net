/**
 * Dogovori Icons — custom, Lucide-compatible icon set.
 *
 * Usage (drop-in replacement):
 *   import { Sparkles, ShieldCheck } from "@/icons";
 *
 * Any icon name NOT overridden below transparently falls back to lucide-react,
 * so partial migration is always safe — the app never breaks.
 */

// Fallback: re-export everything from lucide-react first (types + long tail
// of icons that aren't hand-crafted or bulk-wrapped). Named re-exports below
// override the barrel — that's how partial migration stays safe.
export * from "lucide-react";

// Bulk wrappers: apply Dogovori default stroke weight (1.75) to lucide icons
// that aren't hand-drawn. Named re-exports so they take precedence over the
// `export * from "lucide-react"` above (avoids ambiguous-export errors).
export {
  Activity, AlertCircle, AlertTriangle, Archive, ArrowDown, ArrowLeft,
  ArrowRight, ArrowUp, BarChart3, Bookmark, BookmarkPlus, Brain,
  Briefcase, Bug, Building2, Calculator, CalendarDays, Check,
  CheckCircle2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  Circle, ClipboardCheck, ClipboardPaste, Clock, Coins, Command,
  Compass, Cookie, Copy, Cpu, CreditCard, DatabaseBackup,
  Dot, Download, Euro, ExternalLink, Eye, FileArchive,
  FileCheck2, FileDown, FileEdit, FilePlus2, FileQuestion, FileSearch,
  FileUp, FileWarning, Filter, Flame, FolderInput, FolderOpen,
  FolderTree, Gem, GitCompare, GripVertical, Headphones, HelpCircle,
  History, Home, Inbox, Info, KeyRound, Keyboard,
  Languages, Layers, Layout, LayoutDashboard, LayoutPanelLeft, Library,
  LifeBuoy, Lightbulb, ListChecks, Loader2, LogIn, LogOut,
  Mail, MapPin, Maximize2, Megaphone, Menu, MessageSquare,
  MessageSquarePlus, MessageSquareQuote, MessagesSquare, Minus, Moon, MoreHorizontal,
  MoreVertical, MousePointerClick, PanelLeft, Paperclip, Pause, Pen,
  PenLine, PenSquare, Pencil, Phone, Play, PlayCircle,
  Plus, Printer, Quote, Receipt, RefreshCw, RotateCcw,
  RotateCw, Save, ScrollText, Send, Settings, Share2,
  Shield, ShieldAlert, ShieldOff, ShieldQuestion, Square, Sun,
  Tag, Target, Trash, Trash2, TrendingDown, TrendingUp,
  Upload, User, UserCheck, UserMinus, UserPlus, Users2,
  Wrench, X, XCircle,
} from "./wrapped";

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
