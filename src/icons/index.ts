/**
 * Dogovori Icons — custom, Lucide-compatible icon set.
 *
 * Usage (drop-in replacement):
 *   import { Sparkles, ShieldCheck } from "@/icons";
 *
 * Layering (later wins):
 *   1. Bulk-wrapped lucide icons (finer 1.75 stroke) from `./wrapped`
 *   2. Hand-crafted brand icons below
 */

// Re-export the LucideIcon type so consumers can type icon props uniformly.
export type { LucideIcon } from "lucide-react";

// Bulk wrappers: apply Dogovori default stroke weight (1.75) to lucide icons
// that aren't hand-drawn.
export {
  Activity, AlertCircle, AlertTriangle, Archive, ArrowDown, ArrowUp,
  BarChart3, Bookmark, BookmarkPlus, Brain, Bug, Building2,
  Calculator, CheckCircle2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight,
  ChevronUp, Circle, ClipboardCheck, ClipboardPaste, Clock, Coins,
  Command, Compass, Cookie, Cpu, DatabaseBackup, Dot,
  Euro, FileArchive, FileCheck2, FileDown, FileEdit, FilePlus2,
  FileQuestion, FileSearch, FileUp, FileWarning, Filter, Flame,
  FolderInput, FolderOpen, FolderTree, Gem, GitCompare, GripVertical,
  Headphones, HelpCircle, History, Inbox, KeyRound, Keyboard,
  Languages, Layers, Layout, LayoutDashboard, LayoutPanelLeft, Library,
  LifeBuoy, Lightbulb, ListChecks, Loader2, LogIn, LogOut,
  MapPin, Maximize2, Megaphone, Menu, MessageSquare, MessageSquarePlus,
  MessageSquareQuote, MessagesSquare, Minus, Moon, MoreHorizontal, MoreVertical,
  MousePointerClick, PanelLeft, Paperclip, Pause, Pen, PenLine,
  PenSquare, Pencil, Phone, Play, PlayCircle, Printer,
  Quote, Receipt, RefreshCw, RotateCcw, RotateCw, Save,
  ScrollText, Share2, Shield, ShieldAlert, ShieldOff, ShieldQuestion,
  Square, Sun, Tag, Target, Trash, Trash2,
  TrendingDown, TrendingUp, User, UserCheck, UserMinus, UserPlus,
  Users2, Wrench, XCircle,
  BrainCircuit, Folder, ClipboardList, FolderArchive, Pin, PinOff,
  UploadCloud, GitCompareArrows, Map,
} from "./wrapped";

// Hand-crafted brand icons — take precedence over the wrapped versions above.
// Wave 1
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

// Wave 3 — everyday nav/action icons refined to match the Dogovori stroke.
export { ArrowLeft } from "./ArrowLeft";
export { ArrowRight } from "./ArrowRight";
export { Check } from "./Check";
export { X } from "./X";
export { Plus } from "./Plus";
export { Mail } from "./Mail";
export { CreditCard } from "./CreditCard";
export { Download } from "./Download";
export { Upload } from "./Upload";
export { Send } from "./Send";
export { Eye } from "./Eye";
export { Copy } from "./Copy";
export { ExternalLink } from "./ExternalLink";
export { Settings } from "./Settings";
export { CalendarDays } from "./CalendarDays";
export { Briefcase } from "./Briefcase";
export { Home } from "./Home";
export { Info } from "./Info";

export type { IconProps } from "./createIcon";
export { createIcon } from "./createIcon";
