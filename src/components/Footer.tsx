import { Link } from "react-router-dom";
import { Logo } from "./Logo";
import { revokeCookieConsent } from "@/lib/analytics";

function openCookieSettings() {
  revokeCookieConsent();
  // Banner re-mounts on next render reading getCookiePrefs() === null
  window.location.reload();
}

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-card/40 py-10">
      <div className="container flex flex-col gap-8">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center xl:gap-12">
          <div className="flex min-w-[220px] flex-col gap-2">
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
          <nav className="grid w-full grid-cols-2 gap-x-5 gap-y-2 text-xs text-muted-foreground sm:flex sm:w-auto sm:flex-wrap md:justify-end md:max-w-[min(880px,70%)]">
            <Link to="/ai" className="transition-colors hover:text-gold sm:whitespace-nowrap">AI анализ</Link>
            <Link to="/karta" className="transition-colors hover:text-gold sm:whitespace-nowrap">Карта на сайта</Link>
            <Link to="/provider-info" className="transition-colors hover:text-gold sm:whitespace-nowrap">За доставчика</Link>
            <Link to="/terms" className="transition-colors hover:text-gold sm:whitespace-nowrap">Общи условия</Link>
            <Link to="/privacy" className="transition-colors hover:text-gold sm:whitespace-nowrap">Поверителност</Link>
            <Link to="/cookies" className="transition-colors hover:text-gold sm:whitespace-nowrap">Бисквитки</Link>
            <Link to="/refund" className="transition-colors hover:text-gold sm:whitespace-nowrap">Възстановяване</Link>
            <Link to="/withdrawal-form" className="transition-colors hover:text-gold sm:whitespace-nowrap">Право на отказ</Link>
            <Link to="/dpa" className="transition-colors hover:text-gold sm:whitespace-nowrap">DPA</Link>
            <Link to="/legal/ai-processing" className="transition-colors hover:text-gold sm:whitespace-nowrap">AI политика</Link>
            <Link to="/legal/subprocessors" className="transition-colors hover:text-gold sm:whitespace-nowrap">Подпроцесори</Link>
            <Link to="/legal/retention" className="transition-colors hover:text-gold sm:whitespace-nowrap">Съхранение</Link>
            <Link to="/legal/incident-response" className="transition-colors hover:text-gold sm:whitespace-nowrap">Сигурност</Link>
            <Link to="/legal/ropa" className="transition-colors hover:text-gold sm:whitespace-nowrap">ROPA</Link>
            <Link to="/contacts" className="transition-colors hover:text-gold sm:whitespace-nowrap">Контакти</Link>
            <Link to="/legal/dpia-summary" className="transition-colors hover:text-gold sm:whitespace-nowrap">DPIA резюме</Link>
            <Link to="/legal/security" className="transition-colors hover:text-gold sm:whitespace-nowrap">VDP</Link>
            <Link to="/legal/changelog" className="transition-colors hover:text-gold sm:whitespace-nowrap">Changelog</Link>
            <button
              type="button"
              onClick={openCookieSettings}
              className="text-left transition-colors hover:text-gold sm:whitespace-nowrap"
            >
              Бисквитки: настройки
            </button>
          </nav>
        </div>
        <div className="section-divider" />
        <div className="border-t-0 pt-0 text-center text-[11px] leading-relaxed text-muted-foreground md:text-left">
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
