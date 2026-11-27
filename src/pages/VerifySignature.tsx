import { useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ShieldCheck, AlertCircle, Loader2, Upload } from "@/icons";
import {
  DTRUST_LEVEL_LABEL,
  getSignatureProvider,
  sha256HexOfBlob,
  type DtrustVerifyResult,
} from "@/lib/dtrust";

export default function VerifySignature() {
  const { id = "" } = useParams();
  const [requestId, setRequestId] = useState(id);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DtrustVerifyResult | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const onVerify = async () => {
    if (!file || !requestId.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const documentHash = await sha256HexOfBlob(file);
      setHash(documentHash);
      const res = await getSignatureProvider().verify(requestId.trim(), documentHash);
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <Helmet>
        <title>Проверка на електронен подпис | DTrust</title>
        <meta
          name="description"
          content="Проверете валидността на електронен подпис: съвпада ли отпечатъкът на документа, кой е подписал и кога."
        />
        <link rel="canonical" href="https://dogovori.net/verify" />
      </Helmet>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-serif text-3xl font-bold">Проверка на подпис</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Качете документа и въведете номера на заявката. Изчисляваме SHA-256 отпечатък
          локално във вашия браузър и го сравняваме с подписания — съдържанието на
          документа не се изпраща никъде.
        </p>

        <div className="mt-8 space-y-4 rounded-xl border border-border/60 bg-gradient-card p-6 shadow-soft">
          <div className="space-y-1.5">
            <Label htmlFor="req">Номер на заявката за подпис</Label>
            <Input
              id="req"
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              placeholder="напр. sbx_1_abc123"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc">Подписан документ (PDF)</Label>
            <Input
              id="doc"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button onClick={onVerify} disabled={loading || !file || !requestId.trim()} className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Провери подписа
          </Button>
        </div>

        {result && (
          <div
            className={`mt-6 rounded-xl border p-6 shadow-soft ${
              result.valid ? "border-emerald-600/40 bg-emerald-600/5" : "border-destructive/40 bg-destructive/5"
            }`}
          >
            <div className="flex items-center gap-2">
              {result.valid ? (
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
              <h2 className="font-serif text-lg font-bold">
                {result.valid ? "Подписът е валиден" : "Подписът не може да бъде потвърден"}
              </h2>
            </div>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Ниво</dt>
                <dd>{DTRUST_LEVEL_LABEL[result.level].name} — {DTRUST_LEVEL_LABEL[result.level].legal}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Отпечатък съвпада</dt>
                <dd>{result.hashMatches ? "Да" : "Не"}</dd>
              </div>
              {result.certificateSubject && (
                <div>
                  <dt className="text-xs text-muted-foreground">Сертификат</dt>
                  <dd className="break-all">{result.certificateSubject}</dd>
                </div>
              )}
              {result.signedAt && (
                <div>
                  <dt className="text-xs text-muted-foreground">Подписан на</dt>
                  <dd>{new Date(result.signedAt).toLocaleString("bg-BG")}</dd>
                </div>
              )}
            </dl>
            {hash && (
              <p className="mt-4 break-all font-mono text-[11px] text-muted-foreground">SHA-256: {hash}</p>
            )}
            {result.problems.length > 0 && (
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-destructive">
                {result.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
