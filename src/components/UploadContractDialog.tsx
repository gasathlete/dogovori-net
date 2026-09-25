import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FileUp, FileText, ClipboardPaste, Loader2 } from "@/icons";
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
import { LegalDisclaimer } from "@/components/LegalDisclaimer";
import { trackDocStart, trackGenerate } from "@/lib/docFunnel";
import { classifyGenerationError, type GenerationError } from "@/lib/generationErrors";
import { getStableOpKey, releaseStableOpKey, opaqueOpScope } from "@/lib/opSession";
import {
  RAW_FILE_BLOCKED_MESSAGE,
  RAW_FILE_BLOCKED_TITLE,
  RAW_FILE_INGRESS_ALLOWED,
  CLIENT_RAW_TEXT_WRITE_ALLOWED,
  CLIENT_RAW_TEXT_WRITE_BLOCKED_MESSAGE,
  assertNoRestrictedIdentifiers,
} from "@/lib/privacyGate";
import { canStartNewProcessing } from "@/lib/prelaunch";
import { openPrelaunchWaitlist } from "@/lib/prelaunchWaitlist";
import { UploadStepError, uploadFailureReason } from "@/lib/uploadFailureReason";

type Folder = { id: string; name: string; is_favorites: boolean };
type Contact = { id: string; name: string };

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function UploadContractDialog({
  folders, contacts, onUploaded, autoOpen,
}: { folders: Folder[]; contacts: Contact[]; onUploaded: () => void; autoOpen?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);
  // Текстът е единственият приеман вход, докато суровите файлове са спрени.
  const [tab, setTab] = useState<ExtractSource>(RAW_FILE_INGRESS_ALLOWED ? "pdf" : "paste");
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<string>("none");
  const [contactId, setContactId] = useState<string>("none");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [tip, setTip] = useState<string>("");
  // Ръчен повторен опит след правната преграда: документът вече е качен и
  // запазен, затова се повтаря САМО анализът, без ново качване и без цикъл.
  const retryingRef = useRef(false);
  const retryAnalysisFor = async (contractId: string) => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    try {
      // Същият обхват като първоначалния анализ за този документ — повторен
      // опит (двойно натискане, загубена връзка) не таксува втори път.
      const analyzePayloadScope = await opaqueOpScope("analyze_contract", { uploadedContractId: contractId });
      const opScope = `op:${analyzePayloadScope}`;
      const operationId = getStableOpKey(opScope);
      const { data, error } = await supabase.functions.invoke("analyze-contract", {
        body: { uploadedContractId: contractId, operation_id: operationId },
      });
      const gate = await import("@/lib/legalGateClient");
      if (gate.handleLegalVerificationUnavailable(
        { error, data },
        () => { void retryAnalysisFor(contractId); },
      )) return;
      if (error || (data as { error?: string } | null)?.error) {
        const gen: GenerationError = classifyGenerationError({ error, data: data ?? null });
        if (gen.code === "operation_conflict") {
          releaseStableOpKey(opScope);
          toast.error("Заявката се промени. Изпратете отново.");
          return;
        }
        if (
          gen.code === "operation_in_progress" ||
          gen.code === "quota_unavailable" ||
          gen.code === "entitlement_unavailable" ||
          gen.code === "reconciliation_required"
        ) {
          toast.error(gen.message);
          return;
        }
        const failed = (error as { message?: string } | null)?.message
          ?? (data as { error?: string } | null)?.error
          ?? "Грешка при анализа";
        toast.error("Грешка при анализа", { description: failed });
        return;
      }
      releaseStableOpKey(opScope);
      toast.success("Готово! Анализът е изготвен.");
      onUploaded();
    } finally {
      retryingRef.current = false;
    }
  };

  // Rotating reassuring phrases shown while the AI risk analysis runs.
  useEffect(() => {
    if (!analyzing) return;
    const tips = [
      "Прочитам договора ред по ред...",
      "Сверявам клаузите със ЗЗД и ТЗ...",
      "Проверяваме условията клауза по клауза...",
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

  const onFileChange = async (f: File | null) => {
    if (!f) return setFile(null);
    // Преграда: суровият файл не се чете и не се качва.
    if (!RAW_FILE_INGRESS_ALLOWED) {
      setFile(null);
      toast.error(RAW_FILE_BLOCKED_TITLE, { description: RAW_FILE_BLOCKED_MESSAGE });
      return;
    }
    // Magic-bytes + MIME + size валидация (защита срещу маскирани файлове)
    const { validateUploadedFile, detectFileKind } = await import("@/lib/fileValidation");
    const kind = detectFileKind(f);
    if (!kind) {
      toast.error("Поддържаме само PDF или DOCX файлове.");
      return;
    }
    const v = await validateUploadedFile(f, kind, MAX_FILE_BYTES);
    if (!v.ok) {
      toast.error(v.error ?? "Невалиден файл.");
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };


  const ensureFreshUploadSession = async () => {
    const refreshed = await supabase.auth.refreshSession();
    const activeSession = refreshed.data.session ?? (await supabase.auth.getSession()).data.session;
    if (!activeSession) {
      throw new Error("Сесията Ви е изтекла. Моля, влезте отново и опитайте пак.");
    }
    return activeSession;
  };

  const uploadOriginalFile = async (path: string, sourceFile: File, source: ExtractSource) => {
    const contentType = sourceFile.type || (source === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) await ensureFreshUploadSession();

      const upload = await supabase.storage.from("user-contracts").upload(path, sourceFile, {
        contentType,
        upsert: false,
      });

      if (!upload.error) return;

      const message = upload.error.message?.toLowerCase() ?? "";
      const isRlsError = message.includes("row-level security") || message.includes("permission denied");

      if (attempt === 0 && isRlsError) continue;

      if (isRlsError) {
        throw new Error("Сесията за качване е изтекла. Опреснете страницата или влезте отново и опитайте пак.");
      }

      throw new Error("Грешка при качване: " + upload.error.message);
    }
  };

  const submit = async (skipAnalysis = false) => {
    // Преградите са ПРЕДИ четене на файл, хеш, сесия и запис в базата.
    if (!skipAnalysis && !canStartNewProcessing("document_review")) {
      openPrelaunchWaitlist("document_review", { source: "analyze" });
      return;
    }
    // „Само запис“ на нов текст е забранен от 0044 до отделен бекенд.
    if (skipAnalysis && !CLIENT_RAW_TEXT_WRITE_ALLOWED) {
      toast.error(CLIENT_RAW_TEXT_WRITE_BLOCKED_MESSAGE);
      return;
    }
    if (!user) return;
    if (!title.trim()) { toast.error("Добавете заглавие"); return; }

    try {
      setBusy(true);
      trackDocStart({ source: "upload_analyze", doc_key: tab });
      setPhase("Обработка на текста...");

      let text = "";
      let storagePath: string | null = null;
      let mime: string | null = null;
      let size: number | null = null;
      let originalName: string | null = null;

      if (tab === "paste") {
        text = pasted.trim();
        if (text.length < 80) throw new UploadStepError("text_too_short", "Текстът е твърде кратък (минимум 80 знака)");
        // Fail-closed ПРЕДИ всяка заявка: ограничени идентификатори не излизат.
        assertNoRestrictedIdentifiers([title, text]);
      } else {
        if (!RAW_FILE_INGRESS_ALLOWED) throw new UploadStepError("raw_file_blocked", RAW_FILE_BLOCKED_MESSAGE);
        if (!file) throw new UploadStepError("missing_file", "Моля, изберете файл");
        text = await extractTextFromFile(file, tab, (p) => setPhase(p));
        if (text.length < 80) throw new UploadStepError("extraction_failed", "Не успяхме да извлечем достатъчно текст от файла. Опитайте с друг формат или поставете текста ръчно.");

        setPhase("Качване на оригинала...");
        await ensureFreshUploadSession();

        const ext = tab === "pdf" ? "pdf" : "docx";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        await uploadOriginalFile(path, file, tab);
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

      if (insertRes.error) throw new UploadStepError("save_failed", "Не успяхме да запазим документа. Опитайте отново.");
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
      trackGenerate("started", { source: "upload_analyze", doc_key: tab });
      // Същият опаковъчен обхват като при по-късен ръчен повторен опит за
      // този документ — двойно кликване или загубена връзка не таксуват два пъти.
      const analyzePayloadScope = await opaqueOpScope("analyze_contract", { uploadedContractId: newId });
      const opScope = `op:${analyzePayloadScope}`;
      const operationId = getStableOpKey(opScope);
      const { data: aData, error: aErr } = await supabase.functions.invoke("analyze-contract", {
        body: { uploadedContractId: newId, operation_id: operationId },
      });
      setAnalyzing(false);
      if (aErr) {
        if ((await import("@/lib/legalGateClient")).handleLegalVerificationUnavailable(
          { error: aErr },
          () => { void retryAnalysisFor(newId); },
        )) {
          onUploaded(); setOpen(false); navigate(`/uploaded/${newId}`);
          return;
        }
        if (await (await import("@/lib/blockedContent")).handleBlockedIllegalContent(aErr)) {
          trackGenerate("fail", { source: "upload_analyze", reason: "blocked_content" });
          onUploaded(); setOpen(false); navigate(`/uploaded/${newId}`);
          return;
        }
        const gen: GenerationError = classifyGenerationError({ error: aErr, data: null });
        if (gen.code === "operation_conflict") {
          releaseStableOpKey(opScope);
          trackGenerate("fail", { source: "upload_analyze", reason: gen.code });
          toast.error("Заявката се промени. Изпратете отново.");
          onUploaded();
          setOpen(false);
          navigate(`/uploaded/${newId}`);
          return;
        }
        if (
          gen.code === "operation_in_progress" ||
          gen.code === "quota_unavailable" ||
          gen.code === "entitlement_unavailable" ||
          gen.code === "reconciliation_required"
        ) {
          // Ключът се пази — потребителят може да натисне „Опитай отново" от
          // страницата на документа, без риск от двойно таксуване.
          trackGenerate("fail", { source: "upload_analyze", reason: gen.code });
          toast.error(gen.message);
          onUploaded();
          setOpen(false);
          navigate(`/uploaded/${newId}`);
          return;
        }
        const msg = (aErr as any)?.context?.responseText || aErr.message;
        trackGenerate("fail", { source: "upload_analyze", reason: uploadFailureReason(new Error(String(msg))) === "unknown" ? "analysis_failed" : uploadFailureReason(new Error(String(msg))) });
        toast.error("Грешка при анализа", { description: msg });
        onUploaded();
        setOpen(false);
        navigate(`/uploaded/${newId}`);
        return;
      }
      if ((await import("@/lib/legalGateClient")).handleLegalVerificationUnavailable(
        { data: aData },
        () => { void retryAnalysisFor(newId); },
      )) {
        onUploaded(); setOpen(false); navigate(`/uploaded/${newId}`);
        return;
      }
      if ((aData as any)?.error) {
        const gen: GenerationError = classifyGenerationError({ error: null, data: aData ?? null });
        if (gen.code === "operation_conflict") {
          releaseStableOpKey(opScope);
          trackGenerate("fail", { source: "upload_analyze", reason: gen.code });
          toast.error("Заявката се промени. Изпратете отново.");
          onUploaded();
          setOpen(false);
          navigate(`/uploaded/${newId}`);
          return;
        }
        if (
          gen.code === "operation_in_progress" ||
          gen.code === "quota_unavailable" ||
          gen.code === "entitlement_unavailable" ||
          gen.code === "reconciliation_required"
        ) {
          trackGenerate("fail", { source: "upload_analyze", reason: gen.code });
          toast.error(gen.message);
          onUploaded();
          setOpen(false);
          navigate(`/uploaded/${newId}`);
          return;
        }
        trackGenerate("fail", { source: "upload_analyze", reason: "analysis_failed" });
        toast.error((aData as any).error);
        onUploaded();
        setOpen(false);
        navigate(`/uploaded/${newId}`);
        return;
      }

      // ДОКАЗАН КРАЕН УСПЕХ: единственият момент, в който ключът пада.
      releaseStableOpKey(opScope);
      trackGenerate("success", { source: "upload_analyze", doc_key: tab });
      toast.success("Готово! Анализът е изготвен.");
      reset();
      setOpen(false);
      onUploaded();
      navigate(`/uploaded/${newId}`);
    } catch (e: any) {
      trackGenerate("fail", { source: "upload_analyze", reason: uploadFailureReason(e) });
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
          <DialogTitle className="font-serif">Качване на собствен договор</DialogTitle>
        </DialogHeader>

        {RAW_FILE_INGRESS_ALLOWED ? (
          <LegalDisclaimer variant="warning" storageKey="upload-ocr-accuracy" className="mt-1">
            <strong>Дисклеймър:</strong> При обработка на PDF/DOCX може автоматично извлечените клаузи, суми и страни да са неточни — особено при сканирани документи. Прегледайте резултата и сравнете с оригинала, преди да го използвате правно.<br />
            <strong>OCR цена:</strong> ако PDF е сканиран, OCR-ът на първите 3 страници е включен в анализа (1 операция). Всяка следваща страница струва +1 операция.
          </LegalDisclaimer>
        ) : (
          <div
            data-testid="upload-file-blocked"
            role="note"
            className="mt-1 rounded-lg border border-gold/40 bg-gold/5 p-4 text-sm"
          >
            <p className="font-semibold">{RAW_FILE_BLOCKED_TITLE}</p>
            <p className="mt-2 text-muted-foreground">{RAW_FILE_BLOCKED_MESSAGE}</p>
          </div>
        )}


        <Tabs value={tab} onValueChange={(v) => setTab(v as ExtractSource)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pdf" disabled={!RAW_FILE_INGRESS_ALLOWED}><FileText className="mr-1 h-3.5 w-3.5" />PDF</TabsTrigger>
            <TabsTrigger value="docx" disabled={!RAW_FILE_INGRESS_ALLOWED}><FileText className="mr-1 h-3.5 w-3.5" />Word (.docx)</TabsTrigger>
            <TabsTrigger value="paste"><ClipboardPaste className="mr-1 h-3.5 w-3.5" />Текст</TabsTrigger>
          </TabsList>
          {RAW_FILE_INGRESS_ALLOWED && (
            <>
              <TabsContent value="pdf" className="mt-3">
                <Input type="file" accept="application/pdf,.pdf" onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} />
                {file && <div className="mt-2 text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
              </TabsContent>
              <TabsContent value="docx" className="mt-3">
                <Input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} />
                {file && <div className="mt-2 text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
              </TabsContent>
            </>
          )}
          <TabsContent value="paste" className="mt-3">
            <Textarea
              rows={8}
              placeholder="Поставете пълния текст на договора тук. Заменете личните данни с [ЕГН], [IBAN], [номер на лична карта]…"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Не изпращайте ЕГН, IBAN, номер на банкова сметка или на лична карта. Попълнете ги
              на Вашето устройство, след като получите документа.
            </p>
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
          {CLIENT_RAW_TEXT_WRITE_ALLOWED && (
            <Button
              onClick={() => submit(true)}
              disabled={busy}
              variant="outline"
              className="border-gold/40 hover:bg-gold/10 hover:text-gold"
            >
              Качи без анализ (само редакция)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
