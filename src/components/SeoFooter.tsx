import { Link } from "react-router-dom";
import { CATALOG, TOP_DOCUMENTS } from "@/data/catalog";
import { slugify } from "@/lib/slugify";
import { Logo } from "./Logo";

export function SeoFooter() {
  return (
    <footer className="border-t border-border/60 bg-navy-light/40 pt-12">
      <div className="container">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <Logo />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Договори онлайн на български език. Над 290 шаблона по ЗЗД, ТЗ и КТ — готови за попълване с AI помощник.
            </p>
            <a
              href="https://im-development.imot.bg"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-gold py-[40px] my-0"
            >
              Powered by <span className="font-semibold text-gold/90">IM Development</span>
            </a>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-gold">Топ шаблони</h3>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {TOP_DOCUMENTS.slice(0, 8).map((d) => (
                <li key={d.name}>
                  <Link to={`/shablon/${slugify(d.name)}`} className="transition-colors hover:text-gold">
                    {d.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/catalog" className="font-medium text-gold/90 transition-colors hover:text-gold">
                  Виж всички →
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-gold">Категории</h3>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {CATALOG.slice(0, 10).map((cat) => (
                <li key={cat.id}>
                  <Link to={`/kategoria/${cat.id}`} className="transition-colors hover:text-gold">
                    {cat.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-gold">Информация</h3>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><Link to="/terms" className="hover:text-gold">Общи условия</Link></li>
              <li><Link to="/privacy" className="hover:text-gold">Поверителност</Link></li>
              <li><Link to="/cookies" className="hover:text-gold">Бисквитки</Link></li>
              <li><Link to="/refund" className="hover:text-gold">Възстановяване</Link></li>
              <li><Link to="/blog" className="hover:text-gold">Блог</Link></li>
              <li><a href="mailto:contact@dogovori.net" className="hover:text-gold">Контакти</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border/40 py-6 text-center text-xs text-muted-foreground md:text-left">
          © {new Date().getFullYear()} Dogovori.net · Изготвените договори не заместват консултация с адвокат.
        </div>
      </div>
    </footer>
  );
}
