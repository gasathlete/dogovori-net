import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileUp, FileText, ClipboardPaste, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { extractTextFromFile, sha256Hex, type ExtractSource } from "@/lib/extractContractText";

type Folder = { id: string; name: string; is_favorites: boolean };
type Contact = { id: string; name: string };

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function UploadContractDialog({
  folders, contacts, onUploaded,
}: { folders: Folder[]; contacts: Contact[]; onUploaded: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ExtractSource>("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<string>("none");
  const [contactId, setContactId] = useState<string>("none");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [tip, setTip] = useState<string>("");

  // Rotating reassuring phrases shown while the AI risk analysis runs.
  useEffect(() => {
    if (!analyzing) return;
    const tips = [
      "Прочитам договора ред по ред...",
      "Сверявам клаузите със ЗЗД и ТЗ...",
      "Търся скрити рискове и неравнопоставени условия...",
      "Проверявам неустойки, срокове и подсъдност...",
      "Идентифицирам липсващи съществени клаузи...",
      "Цитирам дословно проблемните пасажи...",
      "Изчислявам общ риск-скор на договора...",
      "Финални проверки за точност...",
    ];
    let i = 0;
    setTip(tips[0]);
    const id = setInterval(() => {
      i = (i + 1) % tips.length;
      setTip(tips[i]);
    }, 2500);
    return () => clearInterval(id);
  }, [analyzing]);

  const reset = () => {
    setFile(null); setPasted(""); setTitle(""); setFolderId("none"); setContactId("none");
    setBusy(false); setPhase(""); setTab("pdf"); setAnalyzing(false); setTip("");
  };

  const onFileChange = (f: File | null) => {
    if (!f) return setFile(null);
    if (f.size > MAX_FILE_BYTES) {
      toast.error("Файлът е твърде голям (макс. 10 MB)");
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async (skipAnalysis = false) => {
    if (!user) return;
    if (!title.trim()) { toast.error("Добавете заглавие"); return; }

    try {
      setBusy(true);
      setPhase("Обработка на текста...");

      let text = "";
      let storagePath: string | null = null;
      let mime: string | null = null;
      let size: number | null = null;
      let originalName: string | null = null;

      if (tab === "paste") {
        text = pasted.trim();
        if (text.length < 80) throw new Error("Текстът е твърде кратък (минимум 80 знака)");
      } else {
        if (!file) throw new Error("Моля, изберете файл");
        text = await extractTextFromFile(file, tab, (p) => setPhase(p));
        if (text.length < 80) throw new Error("Не успяхме да извлечем достатъчно текст от файла. Опитайте с друг формат или поставете текста ръчно.");

        setPhase("Качване на оригинала...");
        // Long OCR/extract steps may outlive the access token. Force refresh
        // before the storage upload so the request carries a valid user JWT
        // (otherwise storage RLS rejects it as "new row violates row-level security policy").
        let { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          const r = await supabase.auth.refreshSession();
          sess = { session: r.data.session } as any;
        }
        if (!sess.session) {
          throw new Error("Сесията Ви е изтекла. Моля, влезте отново и опитайте пак.");
        }

        const ext = tab === "pdf" ? "pdf" : "docx";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("user-contracts").upload(path, file, {
          contentType: file.type || (tab === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
          upsert: false,
        });
        if (up.error) throw new Error("Грешка при качване: " + up.error.message);
        storagePath = path;
        mime = file.type || null;
        size = file.size;
        originalName = file.name;
      }

      setPhase("Запис...");
      const text_hash = await sha256Hex(text);
      const insertRes = await supabase
        .from("uploaded_contracts")
        .insert({
          user_id: user.id,
          folder_id: folderId === "none" ? null : folderId,
          contact_id: contactId === "none" ? null : contactId,
          title: title.trim(),
          source: tab,
          original_filename: originalName,
          storage_path: storagePath,
          mime_type: mime,
          size_bytes: size,
          extracted_text: text,
          text_hash,
        })
        .select("id")
        .single();

      if (insertRes.error) throw new Error(insertRes.error.message);
      const newId = insertRes.data!.id as string;

      if (skipAnalysis) {
        toast.success("Договорът е качен. Можете да го редактирате.");
        reset();
        setOpen(false);
        onUploaded();
        navigate(`/uploaded/${newId}`);
        return;
      }

      setPhase("Риск анализ...");
      setAnalyzing(true);
      const { data: aData, error: aErr } = await supabase.functions.invoke("analyze-contract", {
        body: { uploadedContractId: newId },
      });
      setAnalyzing(false);
      if (aErr) {
        // Surface server error if any
        const msg = (aErr as any)?.context?.responseText || aErr.message;
        toast.error("Грешка при анализа", { description: msg });
        // Still navigate to the document so user can re-try
        onUploaded();
        setOpen(false);
        navigate(`/uploaded/${newId}`);
        return;
      }
      if ((aData as any)?.error) {
        toast.error((aData as any).error);
        onUploaded();
        setOpen(false);
        navigate(`/uploaded/${newId}`);
        return;
      }

      toast.success("Готово! Анализът е изготвен.");
      reset();
      setOpen(false);
      onUploaded();
      navigate(`/uploaded/${newId}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Грешка");
    } finally {
      setBusy(false);
      setPhase("");
      setAnalyzing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-gold text-navy hover:shadow-gold">
          <FileUp className="mr-2 h-4 w-4" /> Добави договор
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif">Качване на собствен договор за AI анализ</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as ExtractSource)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pdf"><FileText className="mr-1 h-3.5 w-3.5" />PDF</TabsTrigger>
            <TabsTrigger value="docx"><FileText className="mr-1 h-3.5 w-3.5" />Word (.docx)</TabsTrigger>
            <TabsTrigger value="paste"><ClipboardPaste className="mr-1 h-3.5 w-3.5" />Текст</TabsTrigger>
          </TabsList>
          <TabsContent value="pdf" className="mt-3">
            <Input type="file" accept="application/pdf,.pdf" onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} />
            {file && <div className="mt-2 text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
          </TabsContent>
          <TabsContent value="docx" className="mt-3">
            <Input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} />
            {file && <div className="mt-2 text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
          </TabsContent>
          <TabsContent value="paste" className="mt-3">
            <Textarea
              rows={8}
              placeholder="Поставете пълния текст на договора тук..."
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
          </TabsContent>
        </Tabs>

        <div className="mt-3 grid gap-3">
          <div>
            <Label>Заглавие</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="напр. Договор за наем — ул. Витоша 12" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Папка</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Без папка —</SelectItem>
                  {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Контрагент</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Без контрагент —</SelectItem>
                  {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 flex-col sm:flex-col items-stretch gap-2">
          {analyzing && tip && (
            <div className="text-xs text-muted-foreground text-center animate-pulse">
              {tip}
            </div>
          )}
          <Button onClick={() => submit(false)} disabled={busy} className="bg-gradient-gold text-navy">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{phase || "Обработка..."}</> : "Качи и анализирай"}
          </Button>
          <Button
            onClick={() => submit(true)}
            disabled={busy}
            variant="outline"
            className="border-gold/40 hover:bg-gold/10 hover:text-gold"
          >
            Качи без анализ (само редакция)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
