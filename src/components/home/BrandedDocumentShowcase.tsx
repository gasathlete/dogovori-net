import { Link } from "react-router-dom";
import { Palette, Megaphone, ArrowRight, Check } from "@/icons";

/**
 * Визуализация на персонално брандиран документ — примерна фирма
 * „Иванов и Милев Пропърти Девелъпмънт“, документ „Покана за работа с Dogovori.net“.
 * Чисто презентационна секция за началната страница.
 */

const BENEFITS = [
  "Лого и фирмени данни в горния колонтитул",
  "Долен колонтитул с контакти, ЕИК и ДДС номер",
  "Фирмен акцентен цвят, шрифт и заглавен стил",
  "Определено място за подпис и печат",
];

export function BrandedDocumentShowcase() {
  return (
    <section
      aria-labelledby="branded-doc-heading"
      className="container py-16 md:py-24"
    >
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Текстова част */}
        <div>
          <div className="eyebrow">
            <span className="section-number font-serif text-base font-normal tracking-normal text-gold/60">05</span>
            <span className="h-px w-5 bg-gold/40" />
            Персонално брандиране
          </div>
          <h2
            id="branded-doc-heading"
            className="mt-3 font-serif text-3xl font-bold leading-[1.15] text-balance md:text-4xl"
          >
            Вашите документи — с вашето лого, цветове и подпис
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            Задайте фирмен стил веднъж и всеки договор, оферта или покана излиза
            брандиран — в PDF и DOCX. Към брандирането добавяме и готови
            рекламни материали: покани за работа, оферти, предложения и
            представяне на фирмата.
          </p>

          <ul className="mt-6 space-y-2.5">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </span>
                <span className="text-muted-foreground">{b}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/account?tab=branding"
              className="inline-flex items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold transition-colors hover:bg-gold/20"
            >
              <Palette className="h-4 w-4" /> Персонално брандиране
            </Link>
            <Link
              to="/account?tab=marketing"
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 px-4 py-2.5 text-sm font-semibold transition-colors hover:border-gold/45 hover:text-gold"
            >
              <Megaphone className="h-4 w-4" /> Рекламни материали
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Визуализиран документ */}
        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-gold/10 via-transparent to-transparent blur-xl"
          />
          <figure className="relative mx-auto w-full max-w-md overflow-hidden rounded-xl border border-border/70 bg-white text-[#1b1b1f] shadow-2xl">
            {/* Горен колонтитул */}
            <div className="flex items-center justify-between gap-3 border-b-2 border-[#0f3b5c] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0f3b5c] font-serif text-sm font-bold text-white">
                  ИМ
                </div>
                <div className="leading-tight">
                  <p className="font-serif text-[13px] font-bold text-[#0f3b5c]">
                    Иванов и Милев Пропърти Девелъпмънт
                  </p>
                  <p className="text-[10px] text-[#5a6470]">
                    ЕИК 207334561 · гр. София, бул. България №13
                  </p>
                </div>
              </div>
            </div>

            {/* Тяло на документа */}
            <div className="px-6 py-6">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#8a94a0]">
                Изх. № 148 / 02.09.2026 г.
              </p>
              <h3 className="mt-3 font-serif text-lg font-bold leading-snug text-[#0f3b5c]">
                Покана за работа с Dogovori.net
              </h3>
              <div className="mt-1 h-0.5 w-14 bg-[#c9a227]" />

              <p className="mt-4 text-[11px] leading-relaxed text-[#3d4653]">
                Уважаеми партньори,
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-[#3d4653]">
                В стремежа си към по-бърза и прозрачна работа, „Иванов и Милев
                Пропърти Девелъпмънт“ ЕООД преминава към електронно изготвяне и
                подписване на документи чрез платформата Dogovori.net.
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-[#3d4653]">
                Каним Ви да получавате и подписвате договорите с нас изцяло
                онлайн — със законна сила, проследимост и архив на всяка версия.
              </p>

              <div className="mt-5 space-y-1.5">
                {[
                  "Договори за наем и покупко-продажба",
                  "Анекси и приемно-предавателни протоколи",
                  "Електронно подписване с КЕП",
                ].map((t) => (
                  <p key={t} className="text-[11px] text-[#3d4653]">
                    <span className="mr-1.5 text-[#c9a227]">•</span>
                    {t}
                  </p>
                ))}
              </div>

              {/* Място за подпис и печат */}
              <div className="mt-7 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] text-[#5a6470]">С уважение,</p>
                  <p className="mt-3 font-serif text-[12px] italic text-[#0f3b5c]">
                    Даниел Милев
                  </p>
                  <div className="mt-0.5 w-32 border-t border-[#b9c1cb] pt-1 text-[9px] text-[#8a94a0]">
                    imdevelopmentoffice@gmail.com
                  </div>
                </div>
                <div className="flex h-16 w-16 shrink-0 rotate-[-8deg] items-center justify-center rounded-full border-2 border-[#0f3b5c]/50 text-center text-[7px] font-semibold uppercase leading-tight text-[#0f3b5c]/70">
                  Печат
                  <br />
                  И&nbsp;М&nbsp;ПД
                </div>
              </div>
            </div>

            {/* Долен колонтитул */}
            <div className="border-t border-[#e3e7ec] bg-[#f6f8fa] px-5 py-2.5 text-[9px] text-[#6b7481]">
              imdevelopmentoffice@gmail.com · +359 2 987 4410 · ДДС №
              BG207334561 · стр. 1 от 1
            </div>
          </figure>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Примерен брандиран документ, генериран от Dogovori.net
          </p>
        </div>
      </div>
    </section>
  );
}
