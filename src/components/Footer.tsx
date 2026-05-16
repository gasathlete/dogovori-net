import { Link } from "react-router-dom";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-navy-light/40 py-10">
      <div className="container flex flex-col gap-8">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex flex-col gap-2">
            <Logo />
            <a
              href="https://im-development.imot.bg"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-[52px] inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-gold"
            >
              Powered by <span className="font-semibold text-gold/90">IM Development</span>
            </a>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <Link to="/provider-info" className="hover:text-gold">За доставчика</Link>
            <Link to="/terms" className="hover:text-gold">Общи условия</Link>
            <Link to="/privacy" className="hover:text-gold">Поверителност</Link>
            <Link to="/cookies" className="hover:text-gold">Бисквитки</Link>
            <Link to="/refund" className="hover:text-gold">Възстановяване</Link>
            <Link to="/withdrawal-form" className="hover:text-gold">Право на отказ</Link>
            <Link to="/dpa" className="hover:text-gold">DPA</Link>
            <Link to="/contacts" className="hover:text-gold">Контакти</Link>
          </nav>
        </div>
        <div className="border-t border-border/40 pt-6 text-center text-[11px] leading-relaxed text-muted-foreground md:text-left">
          <p>
            <strong>„Иванов и Милев Пропърти Девелъпмент" ЕООД</strong> · ЕИК 206957326 ·
            гр. София, ж.к. Стрелбище, бул. България №13, ет. 1, магазин 4 ·
            <a href="mailto:imdevelopmentoffice@gmail.com" className="ml-1 hover:text-gold">imdevelopmentoffice@gmail.com</a>
          </p>
          <p className="mt-2">
            © {new Date().getFullYear()} Dogovori.net · Изготвените договори са образци, създадени с изкуствен интелект, и не заместват консултация с адвокат.
          </p>
        </div>
      </div>
    </footer>
  );
}
