import { ReactNode } from "react";
import {
  Search, FileText, ShieldCheck, PenLine, Package, Upload, FolderTree, MessageSquare, Sparkles,
} from "@/icons";

// Small preview snippets — visual approximations of the real product surfaces.
// Kept lightweight (no real data fetches) so the modal opens instantly.

function NegotiationPreview() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-gold/30 bg-gradient-to-br from-navy/40 via-navy/20 to-transparent p-4">
      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
        <Sparkles className="h-3 w-3" /> Negotiation Mode
      </div>
      <div className="mt-6 space-y-2">
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-gold/15 px-3 py-2 text-xs text-foreground">
          „Срокът за плащане — 30 дни вместо 14."
        </div>
        <div className="mr-auto max-w-[80%] rounded-2xl rounded-tl-sm border border-border/60 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
          Контрапредложение: 21 дни + 2% отстъпка при предсрочно плащане. Юридически риск: <span className="text-emerald-400">нисък</span>.
        </div>
        <div className="ml-auto max-w-[60%] rounded-2xl rounded-tr-sm bg-gold/15 px-3 py-2 text-xs">
          Приемам.
        </div>
      </div>
    </div>
  );
}

function SearchPreview() {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm">
        <Search className="h-4 w-4 text-gold" />
        <span className="text-muted-foreground">наем на офис...</span>
      </div>
      <ul className="space-y-1.5">
        {["Договор за наем на търговски обект", "Договор за наем на жилище", "Анекс към договор за наем"].map((t) => (
          <li key={t} className="flex items-center justify-between rounded-md border border-border/40 bg-background/60 px-3 py-2 text-xs">
            <span>{t}</span>
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] text-gold">ЗЗД</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlankVsWizardPreview() {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-xl border border-border/60 bg-card/40 p-3">
        <FileText className="h-4 w-4 text-gold" />
        <div className="mt-2 text-[11px] font-semibold">Само бланка</div>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">PDF/DOCX за ръчно попълване — 1 op.</p>
      </div>
      <div className="rounded-xl border border-gold/40 bg-gold/10 p-3">
        <Sparkles className="h-4 w-4 text-gold" />
        <div className="mt-2 text-[11px] font-semibold text-gold">Wizard</div>
        <p className="mt-1 text-[10px] leading-relaxed text-foreground/80">Стъпка по стъпка с AI клаузи и валидация.</p>
      </div>
    </div>
  );
}

function RiskSignPreview() {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card/40 p-4">
      <div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Риск анализ</span>
          <span className="font-semibold text-amber-400">68 / 100</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background">
          <div className="h-full w-[68%] bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500" />
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
        <PenLine className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-xs text-emerald-300">Готов за е-подпис</span>
      </div>
    </div>
  );
}

function KitsPreview() {
  const kits = [
    { t: "Стартиране на ООД", n: 5 },
    { t: "Наемане на служител", n: 4 },
    { t: "Покупка на имот", n: 7 },
  ];
  return (
    <div className="grid grid-cols-1 gap-2">
      {kits.map((k) => (
        <div key={k.t} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <Package className="h-3.5 w-3.5 text-gold" />
            <span className="text-xs font-medium">{k.t}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{k.n} документа</span>
        </div>
      ))}
      <div className="mt-1 rounded-lg border border-dashed border-gold/40 bg-gold/5 px-3 py-2 text-center text-xs text-gold">
        + Създай собствен комплект
      </div>
    </div>
  );
}

function UploadPreview() {
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-gold/40 bg-gold/5 p-6 text-center">
      <Upload className="mx-auto h-8 w-8 text-gold" />
      <div className="text-xs font-semibold">Пусни PDF / DOCX тук</div>
      <p className="text-[10px] text-muted-foreground">или сканирай и анализирай за рискове</p>
    </div>
  );
}

function WorkspacePreview() {
  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-[11px]">
        <FolderTree className="h-3.5 w-3.5 text-gold" /> Активни проекти
      </div>
      <ul className="space-y-1 text-[11px]">
        <li className="rounded-md bg-background/60 px-2 py-1.5">📁 Клиент: Алфа ЕООД <span className="text-muted-foreground">— 3 документа</span></li>
        <li className="rounded-md bg-background/60 px-2 py-1.5">📁 Сделка №14 <span className="text-muted-foreground">— 5 документа</span></li>
        <li className="rounded-md bg-background/60 px-2 py-1.5">👥 Workspace: Юр. екип <span className="text-muted-foreground">— 3 членове</span></li>
      </ul>
    </div>
  );
}

function DogovaryPreview() {
  return (
    <div className="space-y-2 rounded-xl border border-gold/40 bg-gradient-to-br from-gold/10 to-transparent p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-gold">
        <MessageSquare className="h-4 w-4" /> DogovaryAI
      </div>
      <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        „Предложете ми компромис между 14 и 30 дни срок за плащане."
      </div>
      <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs leading-relaxed">
        21 дни + неустойка 0.5%/ден забава. Юридически защитимо и пазарно приемливо.
      </div>
    </div>
  );
}

export interface TutorialStep {
  id: string;
  kicker?: string;
  title: string;
  body: string;
  icon: ReactNode;
  preview: ReactNode;
  cta?: { label: string; href: string };
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "intro",
    kicker: "Добре дошли",
    title: "AI правен и преговорен асистент от последно поколение",
    body: "Намирайте, изготвяйте, анализирайте и преговаряйте документи на едно място. Този кратък тур ще ви покаже как.",
    icon: <Sparkles className="h-5 w-5" />,
    preview: <NegotiationPreview />,
  },
  {
    id: "find",
    kicker: "Стъпка 1",
    title: "Намерете или създайте документ",
    body: "Над 600 готови шаблона по ЗЗД, ТЗ, КТ и ЗУТ — намерете го за секунди или започнете нов.",
    icon: <Search className="h-5 w-5" />,
    preview: <SearchPreview />,
    cta: { label: "Към каталога", href: "/catalog" },
  },
  {
    id: "build",
    kicker: "Стъпка 2",
    title: "Свалете бланка или попълнете през системата",
    body: "Изтеглете празна бланка за ръчно попълване, или използвайте Wizard за бърз AI-генериран документ.",
    icon: <FileText className="h-5 w-5" />,
    preview: <BlankVsWizardPreview />,
    cta: { label: "Виж шаблоните", href: "/catalog" },
  },
  {
    id: "analyse",
    kicker: "Стъпка 3",
    title: "Анализирайте рискове и подпишете електронно",
    body: "AI открива рискови клаузи, предлага корекции и води към квалифициран електронен подпис.",
    icon: <ShieldCheck className="h-5 w-5" />,
    preview: <RiskSignPreview />,
    cta: { label: "Към конзолата", href: "/console/analysis" },
  },
  {
    id: "kits",
    kicker: "Стъпка 4",
    title: "Комплекти за типични сценарии",
    body: 'Готови пакети документи за чести ситуации — или групирайте свои чрез „Добави в комплект" на всеки шаблон.',
    icon: <Package className="h-5 w-5" />,
    preview: <KitsPreview />,
    cta: { label: "Виж комплектите", href: "/komplekti" },
  },
  {
    id: "upload",
    kicker: "Стъпка 5",
    title: "Качете документ за анализ",
    body: "Пуснете PDF или DOCX от контрагент — системата ще извлече текста и ще оцени рисковете автоматично.",
    icon: <Upload className="h-5 w-5" />,
    preview: <UploadPreview />,
    cta: { label: "Качи документ", href: "/account?tab=documents" },
  },
  {
    id: "workspace",
    kicker: "Стъпка 6",
    title: "Папки, контрагенти и екипен Workspace",
    body: "Управлявайте контрагенти и проекти от профила; работете едновременно с екипа си.",
    icon: <FolderTree className="h-5 w-5" />,
    preview: <WorkspacePreview />,
    cta: { label: "Към профила", href: "/account" },
  },
  {
    id: "dogovary",
    kicker: "Стъпка 7",
    title: "Не се колебайте да договаряте — DogovaryAI",
    body: "Получете контрапредложения, оценки на риска и аргументация в реално време — за всяка клауза.",
    icon: <MessageSquare className="h-5 w-5" />,
    preview: <DogovaryPreview />,
    cta: { label: "Отвори асистента", href: "/assistant" },
  },
];
