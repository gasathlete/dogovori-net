import { Link } from "react-router-dom";
import { BrandLockup } from "./BrandLockup";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { revokeCookieConsent } from "@/lib/analytics";

function openCookieSettings() {
  revokeCookieConsent();
  // Banner re-mounts on next render reading getCookiePrefs() === null
  window.location.reload();
}

export function Footer() {
  return (
    <footer className="brand-footer border-t border-border/60 bg-card/40 py-10">
      <div className="container flex flex-col gap-8">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center xl:gap-12">
          <div className="flex min-w-[220px] flex-col gap-2">
            <Link to="/" aria-label="Договори.нет — начало"><BrandLockup /></Link>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">По-малко бюрокрация. Повече време за Вас.</p>
            <a
              href="https://im-development.imot.bg"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-gold"
            >
              От <span className="whitespace-nowrap font-semibold text-gold/90">IM Development</span>
            </a>
          </div>
          <nav aria-label="Информация и условия" className="footer-directory grid w-full grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground lg:grid-cols-3">
            <Link to="/feedback?source=footer" className="font-semibold text-gold transition-colors hover:text-gold/80 sm:whitespace-nowrap">Обратна връзка</Link>
            <Link to="/ai" className="transition-colors hover:text-gold sm:whitespace-nowrap">AI анализ</Link>
            <Link to="/paketi" className="transition-colors hover:text-gold sm:whitespace-nowrap">Пакети</Link>
            <Link to="/komplekti" className="transition-colors hover:text-gold sm:whitespace-nowrap">Комплекти</Link>
            <Link to="/connect" className="transition-colors hover:text-gold sm:whitespace-nowrap">Свържи AI асистент</Link>
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
            <Link to="/legal/knowledge-base" className="transition-colors hover:text-gold sm:whitespace-nowrap">Нормативна база</Link>
            <Button variant="link"
              type="button"
              onClick={openCookieSettings}
              className="h-auto justify-start whitespace-normal p-0 text-left font-normal text-muted-foreground hover:text-gold"
            >
              Бисквитки: настройки
            </Button>
          </nav>
        </div>
        <div className="section-divider" />
        <div className="flex flex-col gap-4 border-t-0 pt-0 text-left text-sm leading-relaxed text-muted-foreground md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <p>
              <strong>„Иванов и Милев Пропърти Девелъпмент" ЕООД</strong> · ЕИК 206957326 ·
              гр. София, ж.к. Стрелбище, бул. България №13, ет. 1, магазин 4 ·
              <a href="mailto:imdevelopmentoffice@gmail.com" className="ml-1 hover:text-gold">imdevelopmentoffice@gmail.com</a>
            </p>
            <p className="mt-2">
              © {new Date().getFullYear()} Dogovori.net · Образците и автоматичните предложения са обща помощ и може да изискват адаптация към конкретния случай. Не заменят индивидуална правна консултация.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 md:justify-end">
            <span className="text-sm text-muted-foreground">Тема</span>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
