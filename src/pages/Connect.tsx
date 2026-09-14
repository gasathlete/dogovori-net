import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MCP_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/mcp`;

export default function Connect() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(MCP_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-dvh bg-background">
      <Helmet>
        <title>Свържи AI асистент | dogovori.net</title>
        <meta
          name="description"
          content="Свържи ChatGPT или Claude към dogovori.net чрез MCP и работи с твоите документи, шаблони и контакти директно от асистента."
        />
      </Helmet>

      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Свържи AI асистент към dogovori.net
          </h1>
          <p className="mt-3 text-muted-foreground">
            Използвай ChatGPT или Claude, за да търсиш шаблони, преглеждаш документите
            си и работиш с контактите си — под твоя акаунт, със същите права.
          </p>
        </header>

        <Card className="mb-10">
          <CardHeader>
            <CardTitle className="text-base font-medium text-muted-foreground">
              Адрес на MCP сървъра
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
              <code className="flex-1 truncate font-mono text-sm">{MCP_URL}</code>
              <Button size="sm" variant="secondary" onClick={copy}>
                {copied ? (
                  <>
                    <Check className="mr-1.5 h-4 w-4 text-success" /> Копирано
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-4 w-4" /> Копирай
                  </>
                )}
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              При първо свързване ще бъдеш пренасочен(а) към dogovori.net, за да
              одобриш достъпа. Асистентът вижда само това, до което ти имаш достъп.
            </p>
          </CardContent>
        </Card>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-semibold">ChatGPT</h2>
          <ol className="space-y-3 text-sm leading-relaxed">
            <li>
              <span className="font-medium">1.</span> Отвори{" "}
              <a
                href="https://chatgpt.com/#settings/Connectors/Advanced"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
              >
                Settings → Connectors → Advanced
                <ExternalLink className="h-3.5 w-3.5" />
              </a>{" "}
              и включи <span className="font-medium">Developer mode</span> (прочети предупреждението).
            </li>
            <li>
              <span className="font-medium">2.</span> В чата отвори менюто „+" и активирай Developer mode.
            </li>
            <li>
              <span className="font-medium">3.</span> Натисни <span className="font-medium">Add sources → Connect more</span>.
            </li>
            <li>
              <span className="font-medium">4.</span> Дай име на конектора и постави горния URL адрес.
            </li>
            <li>
              <span className="font-medium">5.</span> Одобри достъпа и помоли ChatGPT да използва dogovori.net.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-semibold">Claude</h2>
          <ol className="space-y-3 text-sm leading-relaxed">
            <li>
              <span className="font-medium">1.</span> Отвори{" "}
              <a
                href="https://claude.ai/customize/connectors?modal=add-custom-connector"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
              >
                Claude → Custom connectors
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              .
            </li>
            <li>
              <span className="font-medium">2.</span> Дай име на конектора и постави горния URL адрес.
            </li>
            <li>
              <span className="font-medium">3.</span> Активирай конектора от чата и помоли Claude да използва dogovori.net.
            </li>
          </ol>
        </section>

        <p className="text-xs text-muted-foreground">
          Асистентът получава достъп единствено чрез сигурен OAuth вход и се
          подчинява на същите правила за поверителност като теб.
        </p>
      </div>
    </main>
  );
}
