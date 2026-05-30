import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { ArrowLeft, Search } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <Seo
        title="Страницата не е намерена (404) — Dogovori.net"
        description="Търсената страница в Dogovori.net не съществува или е преместена. Върнете се към началото или разгледайте каталога с над 400 договора и бланки."
        canonical={location.pathname}
        noindex
      />
      <Header />
      <main className="container flex flex-1 items-center justify-center py-16">
        <div className="max-w-lg text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
            Грешка 404
          </p>
          <h1 className="mt-3 font-serif text-5xl font-bold text-foreground sm:text-6xl">
            Страницата не е намерена
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Адресът{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {location.pathname}
            </code>{" "}
            не съществува или е преместен.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild className="bg-gradient-gold text-navy hover:shadow-gold">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Към началото
              </Link>
            </Button>
            <Button asChild variant="outline" className="border-gold/40 hover:bg-gold/10 hover:text-gold">
              <Link to="/catalog">
                <Search className="mr-2 h-4 w-4" />
                Виж каталога
              </Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default NotFound;
