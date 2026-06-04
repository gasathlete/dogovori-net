import { useEffect, useState, type ReactNode } from "react";

import type { Sector } from "@/data/sectors";
import { ProtectedContent } from "@/components/ProtectedContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, Lock, Sparkles, Feather } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { loadTemplateDraft, fillTemplateDraft } from "@/lib/templateDraftResolver";
import type { DocumentTypeId } from "@/lib/documentReferences";
import { buildTypeSkeleton, isOneSidedType } from "@/lib/typeSkeletons";


/**
 * Скрива долната част на дълъг превю-документ зад градиент.
 * Започва фейд около 30% от височината с по-силен fade за четливост.
 * Цел: задържа интереса и пречи на screenshot/copy извличане на пълния текст.
 */
function PreviewFadeGate({
  children,
  active,
  onDownloadBlank,
}: {
  children: ReactNode;
  active: boolean;
  onDownloadBlank?: () => void;
}) {
  if (!active) return <>{children}</>;
  return (
    <div className="relative">
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[25%] rounded-b-md"
        style={{
          background:
            "linear-gradient(to bottom, hsl(var(--card) / 0) 0%, hsl(var(--card) / 0.55) 25%, hsl(var(--card) / 0.92) 55%, hsl(var(--card)) 75%, hsl(var(--card)) 100%)",
          backdropFilter: "blur(2px)",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,1) 100%)",
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%, rgba(0,0,0,1) 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-[58%] flex flex-col items-center gap-2 px-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-gradient-gold px-5 py-2.5 text-sm font-semibold text-navy shadow-elegant">
          <Sparkles className="h-4 w-4" />
          Завършете въпросника, за да генерирате пълния документ
        </div>
        {onDownloadBlank && (
          <button
            type="button"
            onClick={onDownloadBlank}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-gold/40 bg-card/90 px-4 py-2 text-xs font-medium text-foreground shadow-sm backdrop-blur transition hover:bg-card hover:border-gold"
          >
            <Feather className="h-3.5 w-3.5 text-gold" />
            или изтеглете като бланка
          </button>
        )}
      </div>

    </div>
  );
}


type Clause = { roman: string; title: string; body: string };

/**
 * Точка 10 от правния одит — в живия преглед не пишем „Физическо лице" / „Юридическо лице",
 * а директно показваме идентификатора: ЕГН за физическо, ЕИК/Булстат за юридическо.
 */
function renderPartyIdentifier(type?: string): string {
  if (!type) return "";
  const t = type.toLowerCase();
  if (t.includes("физическо")) return ", ЕГН [........]";
  if (t.includes("ет") || t.includes("самоосигуряващо")) return ", ЕИК [........], представляван от [МОЛ]";
  if (t.includes("юридическо")) return ", ЕИК/Булстат [........], представлявано от [МОЛ], ДДС № [........]";
  return ` — ${type}`;
}

const CURRENCY = "€";

const BASE_CLOSING: Clause[] = [
  {
    roman: "VII.",
    title: "Форсмажор (непреодолима сила)",
    body:
      "Чл. 1. Страните не носят отговорност за неизпълнение, причинено от непреодолима сила по смисъла на чл. 306 ТЗ – природни бедствия, война, пандемия, актове на държавни органи и други извънредни обстоятелства, които страната не е могла да предвиди или предотврати.\n" +
      "Чл. 2. Засегнатата страна уведомява писмено другата страна в срок до 7 (седем) дни от настъпване на събитието.",
  },
  {
    roman: "VIII.",
    title: "Подсъдност",
    body:
      "Чл. 1. Всички спорове, възникнали във връзка с настоящия договор, се решават чрез преговори.\n" +
      "Чл. 2. При непостигнато съгласие, спорът се отнася до Софийски градски съд, респективно Арбитражен съд при Българска търговско-промишлена палата – София.",
  },
  {
    roman: "IX.",
    title: "Частична недействителност (Severability)",
    body:
      "Чл. 1. Ако някоя клауза от настоящия договор бъде призната за недействителна или неприложима, това не засяга действителността на останалите разпоредби.\n" +
      "Чл. 2. Страните се задължават да заместят недействителната клауза с такава, която е законосъобразна и максимално отразява първоначалното им намерение.",
  },
  {
    roman: "X.",
    title: "Заключителни разпоредби",
    body:
      "Чл. 1. За неуредените въпроси се прилагат разпоредбите на ЗЗД, ТЗ и приложимото българско законодателство.\n" +
      "Чл. 2. Настоящият договор се състави и подписа в два еднообразни екземпляра – по един за всяка от страните.",
  },
];

function buildGenericClauses(
  sector: Sector,
  a: Record<string, string>,
  docName?: string,
): Clause[] {
  const partyA = `„${sector.parties.a}“`;
  const partyB = `„${sector.parties.b}“`;
  const subject =
    a.subject_summary?.trim() ||
    a.extra_notes?.trim() ||
    `${docName || sector.contractName} съгласно уговореното между страните`;
  const duration = a.duration?.trim() || "[срок / безсрочно, до писмено прекратяване]";
  const price = a.value
    ? `${a.value} ${CURRENCY}`
    : a.rent
      ? `${a.rent} ${CURRENCY}`
      : `[___] ${CURRENCY}`;
  const penaltyPct = a.penalty_pct?.trim() || "[0.5]";
  const penaltyCap = a.penalty_cap?.trim() || "[10]";
  const notice = a.notice_days?.trim() || "30";

  return [
    {
      roman: "I.",
      title: "Предмет на договора",
      body:
        `Чл. 1. ${partyA} възлага, а ${partyB} приема да изпълни срещу възнаграждение следното: ${subject}.\n` +
        `Чл. 2. Изпълнението се извършва съгласно уговорените технически, качествени и срокови параметри, описани в настоящия договор и неговите приложения.`,
    },
    {
      roman: "II.",
      title: "Срок и действие",
      body:
        `Чл. 1. Настоящият договор се сключва за срок: ${duration}, считано от датата на подписването му от двете страни.\n` +
        `Чл. 2. Срокът може да бъде продължен по взаимно писмено съгласие или прекратен предсрочно при условията, уговорени по-долу.`,
    },
    {
      roman: "III.",
      title: "Възнаграждение и плащане",
      body:
        `Чл. 1. Общата стойност на договора е в размер на ${price}${a.value || a.rent ? "" : " (попълва се от страните)"}.\n` +
        `Чл. 2. Плащането се извършва по банков път по сметка, посочена от ${partyB}, в срок до 7 (седем) календарни дни от издаване на надлежна фактура.\n` +
        `Чл. 3. Към сумата се начислява ДДС, когато е приложимо съгласно ЗДДС.`,
    },
    {
      roman: "IV.",
      title: "Права и задължения на страните",
      body:
        `Чл. 1. ${partyA} се задължава да предостави своевременно цялата необходима информация и съдействие за изпълнението на договора.\n` +
        `Чл. 2. ${partyB} се задължава да изпълни договорените дейности качествено, в срок и с грижата на добър стопанин/професионалист.\n` +
        `Чл. 3. Страните си сътрудничат добросъвестно и се уведомяват взаимно за всички обстоятелства от значение за изпълнението.`,
    },
    {
      roman: "V.",
      title: "Отговорност и неустойки",
      body:
        `Чл. 1. При забавено изпълнение неизправната страна дължи неустойка в размер на ${penaltyPct}% от стойността на забавеното задължение за всеки ден забава, но не повече от ${penaltyCap}% от общата стойност на договора.\n` +
        `Чл. 2. Плащането на неустойка не освобождава неизправната страна от задължението за реално изпълнение.\n` +
        `Чл. 3. При причинени вреди над размера на неустойката, изправната страна има право на обезщетение за горницата по общия ред.`,
    },
    {
      roman: "VI.",
      title: "Прекратяване",
      body:
        `Чл. 1. Договорът се прекратява: (а) по взаимно писмено съгласие; (б) с едностранно писмено предизвестие от ${notice} дни; (в) при съществено неизпълнение от другата страна, без предизвестие.\n` +
        `Чл. 2. Прекратяването не засяга вече възникнали парични задължения и задълженията за конфиденциалност.`,
    },
    ...BASE_CLOSING,
  ];
}

function buildEmploymentClauses(a: Record<string, string>): Clause[] {
  const role = a.position?.trim() || a.role?.trim() || "[длъжност съгласно НКПД]";
  const salary = a.salary ? `${a.salary} ${CURRENCY}` : `[___] ${CURRENCY}`;
  const hours = a.work_hours?.trim() || "8 (осем) часа дневно при 5-дневна работна седмица";
  const probation = a.probation?.trim() || "до 6 (шест) месеца в полза на работодателя";
  const leave = a.leave_days?.trim() || "20 (двадесет) работни дни годишно";
  return [
    {
      roman: "I.",
      title: "Предмет на трудовия договор",
      body:
        `Чл. 1. Работодателят възлага, а Служителят приема да изпълнява длъжността „${role}" в предприятието на Работодателя, при условията на Кодекса на труда (КТ).\n` +
        `Чл. 2. Конкретните задължения, отговорности и подчиненост се определят с длъжностна характеристика, която е неразделна част от настоящия договор.`,
    },
    {
      roman: "II.",
      title: "Срок и място на работа",
      body:
        `Чл. 1. Договорът се сключва на основание чл. 67, ал. 1, т. 1 КТ – безсрочно.\n` +
        `Чл. 2. Място на работа: [седалище/адрес на Работодателя или конкретен обект].\n` +
        `Чл. 3. Уговаря се изпитателен срок ${probation} (чл. 70 КТ).`,
    },
    {
      roman: "III.",
      title: "Работно време и почивки",
      body:
        `Чл. 1. Работното време е ${hours}, при спазване на чл. 136 и сл. КТ.\n` +
        `Чл. 2. Служителят има право на междудневна, междуседмична и почивка по време на работния ден съгласно КТ.`,
    },
    {
      roman: "IV.",
      title: "Трудово възнаграждение",
      body:
        `Чл. 1. Основното месечно трудово възнаграждение е в размер на ${salary} бруто.\n` +
        `Чл. 2. Възнаграждението се изплаща по банков път до [___] число на месеца, следващ отработения период.\n` +
        `Чл. 3. Работодателят начислява и удържа дължимите данъци и осигурителни вноски съгласно КСО и ЗДДФЛ.`,
    },
    {
      roman: "V.",
      title: "Платен годишен отпуск",
      body:
        `Чл. 1. Служителят има право на платен годишен отпуск в размер на ${leave} (чл. 155 КТ).\n` +
        `Чл. 2. Отпускът се ползва по график, утвърден от Работодателя след съгласуване със Служителя.`,
    },
    {
      roman: "VI.",
      title: "Прекратяване на трудовия договор",
      body:
        `Чл. 1. Трудовият договор се прекратява на основанията по чл. 325 – чл. 330 КТ.\n` +
        `Чл. 2. Срокът за предизвестие при безсрочен договор е 30 (тридесет) дни (чл. 326, ал. 2 КТ), освен ако страните не уговорят по-дълъг срок до 3 месеца.`,
    },
    ...BASE_CLOSING,
  ];
}

function buildPOAClauses(a: Record<string, string>): Clause[] {
  const scope = a.scope?.trim() || "[конкретни действия и обем на представителна власт]";
  const duration = a.duration?.trim() || "до изричната ѝ отмяна от Упълномощителя";
  return [
    {
      roman: "I.",
      title: "Предмет на пълномощното",
      body:
        `Чл. 1. Упълномощителят упълномощава Пълномощника да го представлява пред трети лица, държавни и общински органи, юридически и физически лица за следните действия: ${scope}.`,
    },
    {
      roman: "II.",
      title: "Обем на представителната власт",
      body:
        `Чл. 1. Пълномощникът има право да подава заявления, да получава документи, да подписва книжа и да извършва всички фактически и правни действия, необходими за изпълнение на възложеното.\n` +
        `Чл. 2. Пълномощникът няма право да договаря сам със себе си (чл. 38 ЗЗД), освен ако изрично не е разрешено.`,
    },
    {
      roman: "III.",
      title: "Срок и отмяна",
      body:
        `Чл. 1. Пълномощното е валидно ${duration}.\n` +
        `Чл. 2. Упълномощителят може по всяко време да отмени пълномощното с писмено уведомление.\n` +
        `Чл. 3. Пълномощникът може да се откаже от пълномощието с писмено уведомление до Упълномощителя.`,
    },
    {
      roman: "IV.",
      title: "Отчет",
      body:
        `Чл. 1. Пълномощникът се отчита пред Упълномощителя за извършените действия и предава всички получени документи и средства.`,
    },
    ...BASE_CLOSING,
  ];
}

function buildLoanClauses(a: Record<string, string>): Clause[] {
  const principal = a.principal || a.value || "[___]";
  const interest = a.interest?.trim() || "[годишен лихвен %]";
  const term = a.duration?.trim() || a.term_months?.trim() || "[срок за връщане]";
  return [
    {
      roman: "I.",
      title: "Предмет на договора",
      body:
        `Чл. 1. Заемодателят предоставя на Заемополучателя парична сума в размер на ${principal} ${CURRENCY} (наричана „Главница"), а Заемополучателят се задължава да я върне в уговорения срок и при условията на настоящия договор.\n` +
        `Чл. 2. Главницата се предоставя по банков път или в брой (при спазване на ЗОПБ).`,
    },
    {
      roman: "II.",
      title: "Лихва",
      body:
        `Чл. 1. Върху Главницата се начислява възнаградителна лихва в размер на ${interest}, начислявана по [метод].\n` +
        `Чл. 2. При забава на плащане се дължи и законна лихва за забава (чл. 86 ЗЗД).`,
    },
    {
      roman: "III.",
      title: "Срок и погасяване",
      body:
        `Чл. 1. Срокът за връщане на Главницата е ${term}.\n` +
        `Чл. 2. Погасяването се извършва съгласно погасителен план – Приложение № 1.\n` +
        `Чл. 3. Заемополучателят има право на предсрочно погасяване без санкция, освен ако изрично не е уговорено друго.`,
    },
    {
      roman: "IV.",
      title: "Обезпечение",
      body:
        `Чл. 1. За обезпечение на задълженията се учредява: [запис на заповед / поръчителство / ипотека / залог / без обезпечение].`,
    },
    {
      roman: "V.",
      title: "Неустойки и последици при неизпълнение",
      body:
        `Чл. 1. При забава Заемополучателят дължи законна лихва за забава съгласно ПМС № 426/2014 г.\n` +
        `Чл. 2. При системно неизпълнение Заемодателят може да обяви предсрочна изискуемост на цялата непогасена част от заема.`,
    },
    ...BASE_CLOSING,
  ];
}

function buildFamilyNoticeClauses(a: Record<string, string>, docName?: string): Clause[] {
  const subject = a.subject_summary?.trim() || docName || "доброволно изпълнение на парично/непарично задължение";
  const basis = a.basis?.trim() || "[основанието – договор, изпълнителен лист, нотариален акт]";
  const amount = a.amount ? `${a.amount} ${CURRENCY}` : a.value ? `${a.value} ${CURRENCY}` : "[___] " + CURRENCY;
  const deadline = a.deadline?.trim() || "7 (седем) дни от получаване на настоящата покана";
  return [
    {
      roman: "I.",
      title: "Предмет на поканата",
      body:
        `Чл. 1. С настоящата покана Заявителят отправя до Получателя искане за ${subject}.\n` +
        `Чл. 2. Поканата се отправя на основание ${basis}.`,
    },
    {
      roman: "II.",
      title: "Размер и характер на задължението",
      body:
        `Чл. 1. Размер на задължението: ${amount}, ведно със законната лихва от датата на изпадане в забава до окончателното плащане.\n` +
        `Чл. 2. Към главницата се прибавят и евентуално начислените разноски, направени от Заявителя.`,
    },
    {
      roman: "III.",
      title: "Срок за доброволно изпълнение",
      body:
        `Чл. 1. Получателят се поканва да изпълни задължението в срок от ${deadline}.\n` +
        `Чл. 2. Плащането се извършва по банков път по посочена от Заявителя сметка или по друг съгласуван начин.`,
    },
    {
      roman: "IV.",
      title: "Последици при неизпълнение",
      body:
        `Чл. 1. При неизпълнение в посочения срок Заявителят ще предприеме всички предвидени от закона действия за принудително събиране на вземането, включително снабдяване с изпълнителен лист и образуване на изпълнително производство по реда на ГПК.\n` +
        `Чл. 2. Всички разноски по принудителното изпълнение, включително адвокатско възнаграждение, ще бъдат за сметка на длъжника.`,
    },
    {
      roman: "V.",
      title: "Заключителни разпоредби",
      body:
        `Чл. 1. Настоящата нотариална покана се връчва чрез нотариус по реда на чл. 50 ЗННД.\n` +
        `Чл. 2. Тя се счита за получена в момента на връчването, удостоверено от нотариуса.`,
    },
  ];
}

function buildInitialClauses(
  sector: Sector,
  a: Record<string, string>,
  docName?: string,
): Clause[] {
  const partyA = `„${sector.parties.a}"`;
  const partyB = `„${sector.parties.b}"`;
  const baseClosing = BASE_CLOSING;

  switch (sector.id) {
    case "real-estate": {
      const property = a.property?.trim() || "[адрес, площ, етаж, кадастрален №]";
      const rent = a.rent ? `${a.rent} ${CURRENCY}` : `[___] ${CURRENCY}`;
      const term = a.term_months || "[срок]";
      return [
        {
          roman: "I.",
          title: "Предмет на договора",
          body:
            `Чл. 1. ${partyA} предоставя за временно възмездно ползване на ${partyB} следния недвижим имот: ${property}.\n` +
            `Чл. 2. Имотът се предава за ползване с предназначение, съобразено с уговореното между страните и приложимото законодателство.`,
        },
        {
          roman: "II.",
          title: "Срок на договора",
          body:
            `Чл. 1. Настоящият договор се сключва за срок от ${term}, считано от датата на подписване на приемо-предавателен протокол.\n` +
            `Чл. 2. След изтичане на срока договорът може да бъде продължен по взаимно писмено съгласие.`,
        },
        {
          roman: "III.",
          title: "Наемна цена и плащане",
          body:
            `Чл. 1. Месечната наемна цена е в размер на ${rent}, платима до 5-то число на текущия месец.\n` +
            `Чл. 2. Плащането се извършва по банков път по сметка, посочена от ${partyA}.\n` +
            `Чл. 3. Депозитът служи като обезпечение за изпълнение на задълженията на ${partyB}.`,
        },
        {
          roman: "IV.",
          title: "Права и задължения на страните",
          body:
            `Чл. 1. ${partyA} се задължава да предостави имота в състояние, годно за ползване по предназначение.\n` +
            `Чл. 2. ${partyB} се задължава да полага грижата на добър стопанин и да заплаща консумативите.\n` +
            `Чл. 3. Текущите ремонти са за сметка на ${partyB}, а основните – за сметка на ${partyA}.`,
        },
        {
          roman: "V.",
          title: "Неустойки",
          body:
            `Чл. 1. При забава на плащането ${partyB} дължи неустойка за всеки ден забава.\n` +
            `Чл. 2. При увреждане на имота отговорността се определя по общия ред.`,
        },
        {
          roman: "VI.",
          title: "Прекратяване",
          body:
            `Чл. 1. Договорът се прекратява с изтичане на срока, по взаимно съгласие или при съществено неизпълнение.\n` +
            `Чл. 2. След прекратяване ${partyB} връща имота с приемо-предавателен протокол.`,
        },
        ...baseClosing,
      ];
    }
    case "construction": {
      const object = a.object?.trim() || "[описание на обекта и видове СМР]";
      const value = a.value ? `${a.value} ${CURRENCY}` : `[___] ${CURRENCY}`;
      const days = a.deadline || "[___]";
      return [
        {
          roman: "I.",
          title: "Предмет на договора",
          body:
            `Чл. 1. ${partyA} възлага, а ${partyB} приема да извърши срещу възнаграждение строително-монтажни работи (СМР), както следва: ${object}.\n` +
            `Чл. 2. СМР се извършват в съответствие с инвестиционен проект, технически правила и нормативите по ЗУТ.`,
        },
        {
          roman: "II.",
          title: "Стойност и плащане",
          body:
            `Чл. 1. Общата стойност на договора е ${value}, без ДДС.\n` +
            `Чл. 2. Плащанията се извършват по схема, договорена между страните, въз основа на приети актове.\n` +
            `Чл. 3. Окончателно плащане – след подписване на приемо-предавателен протокол и отстраняване на забележките.`,
        },
        {
          roman: "III.",
          title: "Срокове за изпълнение",
          body:
            `Чл. 1. Срокът за изпълнение на СМР е ${days} календарни дни от подписване на протокол за откриване на строителна площадка.\n` +
            `Чл. 2. Срокът се удължава при забава по вина на ${partyA} или при непреодолима сила.`,
        },
        {
          roman: "IV.",
          title: "Качество и гаранции",
          body:
            `Чл. 1. ${partyB} извършва СМР качествено, в съответствие с БДС и одобрения проект.\n` +
            `Чл. 2. Гаранционните срокове са в съответствие с Наредба №2 към ЗУТ.`,
        },
        {
          roman: "V.",
          title: "Приемане на работата",
          body:
            `Чл. 1. Приемането се извършва с двустранен приемо-предавателен протокол.\n` +
            `Чл. 2. Установените дефекти се отстраняват за сметка на ${partyB} в разумен срок.`,
        },
        {
          roman: "VI.",
          title: "Неустойки",
          body:
            `Чл. 1. При забава ${partyB} дължи неустойка за всеки ден забава, до договорения таван.\n` +
            `Чл. 2. При забава на плащането ${partyA} дължи законна лихва.`,
        },
        ...baseClosing,
      ];
    }
    case "logistics": {
      const route = a.route || "[маршрут от – до]";
      const cargo = a.cargo?.trim() || "[вид, тегло, обем на товара]";
      const freight = a.freight ? `${a.freight} ${CURRENCY}` : `[___] ${CURRENCY}`;
      return [
        {
          roman: "I.",
          title: "Предмет на договора",
          body:
            `Чл. 1. ${partyA} възлага, а ${partyB} приема да извърши превоз на товари по маршрут: ${route}.\n` +
            `Чл. 2. Товар: ${cargo}.`,
        },
        {
          roman: "II.",
          title: "Навло и плащане",
          body:
            `Чл. 1. Договореното навло е в размер на ${freight}.\n` +
            `Чл. 2. Плащането се извършва съгласно уговорения срок след представяне на надлежно оформена товарителница (CMR).`,
        },
        {
          roman: "III.",
          title: "Задължения на превозвача",
          body:
            `Чл. 1. ${partyB} осигурява технически изправно МПС и правоспособен водач.\n` +
            `Чл. 2. ${partyB} отговаря за товара от приемането до предаването му съгласно CMR конвенцията/българското законодателство.`,
        },
        {
          roman: "IV.",
          title: "Задължения на възложителя",
          body:
            `Чл. 1. ${partyA} осигурява надлежно опакован и придружен с документи товар.\n` +
            `Чл. 2. ${partyA} осигурява натоварването и разтоварването в договорените срокове.`,
        },
        {
          roman: "V.",
          title: "Отговорност и застраховка",
          body:
            `Чл. 1. Отговорността за щети по товара се определя съгласно избрания режим (CMR / вътрешен превоз).\n` +
            `Чл. 2. Карго застраховката се сключва съгласно уговореното в чл. ___.`,
        },
        {
          roman: "VI.",
          title: "Неустойки",
          body:
            `Чл. 1. При забава на доставката или на плащането се дължи неустойка съгласно договореното.\n` +
            `Чл. 2. Размерите и таванът на неустойките се прилагат за всяка от страните.`,
        },
        ...baseClosing,
      ];
    }
    case "digital": {
      const scope = a.scope?.trim() || "[обхват и описание на услугата/продукта]";
      const value = a.value ? `${a.value} ${CURRENCY}` : `[___] ${CURRENCY}`;
      return [
        {
          roman: "I.",
          title: "Предмет на договора",
          body:
            `Чл. 1. ${partyA} възлага, а ${partyB} приема да изработи и предаде следния продукт/услуга: ${scope}.\n` +
            `Чл. 2. Подробни технически изисквания се описват в Приложение №1 (Техническо задание), което е неразделна част от договора.`,
        },
        {
          roman: "II.",
          title: "Възнаграждение и плащане",
          body:
            `Чл. 1. Общото възнаграждение е в размер на ${value}, без ДДС.\n` +
            `Чл. 2. Плащанията се извършват по избрания модел (Milestones / T&M / ретейнър / 50/50).\n` +
            `Чл. 3. Всяка фактура се заплаща по банков път в срок до 7 дни.`,
        },
        {
          roman: "III.",
          title: "Срокове и приемане",
          body:
            `Чл. 1. Срокът за предаване е посочен в Техническото задание/Графика.\n` +
            `Чл. 2. Приемането се извършва съгласно уговорената процедура (тих accept / протокол / UAT).`,
        },
        {
          roman: "IV.",
          title: "Авторски и интелектуални права",
          body:
            `Чл. 1. Правата върху изработените резултати се уреждат съгласно ЗАПСП и избрания модел.\n` +
            `Чл. 2. Reusable компоненти и предходни разработки на ${partyB} остават негова собственост, освен ако изрично е уговорено друго.`,
        },
        {
          roman: "V.",
          title: "Конфиденциалност (NDA)",
          body:
            `Чл. 1. Страните се задължават да пазят в тайна цялата конфиденциална информация, станала им известна във връзка с договора.\n` +
            `Чл. 2. Задължението за конфиденциалност действа съгласно избрания срок.`,
        },
        {
          roman: "VI.",
          title: "Неустойки и прекратяване",
          body:
            `Чл. 1. При забава на изпълнението или на плащането се дължи неустойка съгласно договореното.\n` +
            `Чл. 2. Договорът може да бъде прекратен по взаимно съгласие или при съществено нарушение.`,
        },
        ...baseClosing,
      ];
    }
    case "partnerships": {
      const company = a.company?.trim() || "[наименование, ЕИК]";
      const shares = a.shares?.trim() || "[разпределение]";
      return [
        {
          roman: "I.",
          title: "Предмет",
          body:
            `Чл. 1. Настоящото споразумение урежда отношенията между съдружниците в ${company}.\n` +
            `Чл. 2. Разпределение на дяловете/акциите: ${shares}.`,
        },
        {
          roman: "II.",
          title: "Управление",
          body:
            `Чл. 1. Управлението се осъществява съгласно избрания модел (едноличен управител / двама управители / УС).\n` +
            `Чл. 2. Съществените решения се вземат с квалифицирано мнозинство.`,
        },
        {
          roman: "III.",
          title: "Vesting и дялове на основателите",
          body:
            `Чл. 1. Дяловете на основателите подлежат на vesting съгласно избрания план.\n` +
            `Чл. 2. При напускане преди изтичане на vesting периода – невестираните дялове се прехвърлят обратно към дружеството.`,
        },
        {
          roman: "IV.",
          title: "Exit клаузи",
          body:
            `Чл. 1. Прилагат се избраните exit механизми (Tag-along, Drag-along, ROFR, Put/Call).\n` +
            `Чл. 2. Процедурите се развиват съгласно правилата, договорени между страните.`,
        },
        {
          roman: "V.",
          title: "Конкурентна забрана",
          body:
            `Чл. 1. Страните се задължават да не извършват конкурентна дейност за договорения срок след напускане.\n` +
            `Чл. 2. При нарушение се дължи договорена неустойка.`,
        },
        {
          roman: "VI.",
          title: "Конфиденциалност",
          body:
            `Чл. 1. Страните пазят в тайна търговска и финансова информация, станала им известна.\n` +
            `Чл. 2. Задължението действа и след прекратяване на участието в дружеството.`,
        },
        ...baseClosing,
      ];
    }
    case "trade": {
      const products = a.products?.trim() || "[продукти / асортимент]";
      const territory = a.territory?.trim() || "[територия]";
      return [
        {
          roman: "I.",
          title: "Предмет",
          body:
            `Чл. 1. ${partyA} предоставя на ${partyB} правото да дистрибутира следните продукти: ${products}.\n` +
            `Чл. 2. Територия на дистрибуция: ${territory}.`,
        },
        {
          roman: "II.",
          title: "Ексклузивност",
          body:
            `Чл. 1. Дистрибуцията се извършва съгласно избрания режим (изключителна / селективна / неизключителна).\n` +
            `Чл. 2. ${partyA} не предоставя на трети лица права в обхвата на дадената ексклузивност.`,
        },
        {
          roman: "III.",
          title: "Цени, поръчки и плащане",
          body:
            `Чл. 1. Цените се определят съгласно действащ ценоразпис на ${partyA}, в ${CURRENCY}.\n` +
            `Чл. 2. Плащането се извършва съгласно избрания модел (авансово/отложено).\n` +
            `Чл. 3. При отложено плащане се предоставя избраното обезпечение.`,
        },
        {
          roman: "IV.",
          title: "Минимални покупки",
          body:
            `Чл. 1. ${partyB} се задължава да реализира минимални годишни покупки съгласно уговореното.\n` +
            `Чл. 2. Неизпълнението може да доведе до загуба на ексклузивност или прекратяване.`,
        },
        {
          roman: "V.",
          title: "Маркетинг и марка",
          body:
            `Чл. 1. ${partyB} ползва марките на ${partyA} единствено във връзка с продажбата на продуктите.\n` +
            `Чл. 2. Маркетинговите активности се съгласуват предварително.`,
        },
        {
          roman: "VI.",
          title: "Срок и прекратяване",
          body:
            `Чл. 1. Договорът се сключва за избрания срок с възможност за продължаване.\n` +
            `Чл. 2. Прекратяване – по взаимно съгласие, с предизвестие или при съществено нарушение.`,
        },
        ...baseClosing,
      ];
    }
    case "employment":
      return buildEmploymentClauses(a);
    case "power-of-attorney":
      return buildPOAClauses(a);
    case "finance": {
      const dn = (docName || "").toLowerCase();
      if (/заем|кредит|loan/.test(dn)) return buildLoanClauses(a);
      return buildGenericClauses(sector, a, docName);
    }
    case "family": {
      const dn = (docName || "").toLowerCase();
      if (/покан|нотариална|deklaratsiya|декларац/.test(dn))
        return buildFamilyNoticeClauses(a, docName);
      return buildGenericClauses(sector, a, docName);
    }
    default:
      return buildGenericClauses(sector, a, docName);
  }
}


export function LiveDraft({
  sector,
  answers,
  generated,
  signature,
  isPro = false,
  docName,
  bilingual = false,
  documentType,
  onContractChange,
  onDownloadBlank,
}: {
  sector: Sector;
  answers: Record<string, string>;
  generated?: {
    title: string;
    preamble: string;
    clauses: { number: string; title: string; body: string; title_en?: string; body_en?: string }[];
    closing: string;
    bilingual?: boolean;
    title_en?: string;
    preamble_en?: string;
    closing_en?: string;
  } | null;
  signature?: {
    name_a: string;
    name_b: string;
    city: string;
    date: string;
    image_a?: string;
    image_b?: string;
  };
  isPro?: boolean;
  docName?: string;
  /** When true, render the pre-generation skeleton in BG/EN two columns. */
  bilingual?: boolean;
  /** Selected document type — drives type-specific skeleton (agreement, notary invitation, etc.). */
  documentType?: DocumentTypeId | string | null;
  onContractChange?: (next: NonNullable<typeof generated>) => void;
  onDownloadBlank?: () => void;
}) {
  const partyA = answers.party_a_name || `[${sector.parties.a}]`;
  const partyB = answers.party_b_name || `[${sector.parties.b}]`;
  const sigA = signature?.name_a || partyA;
  const sigB = signature?.name_b || partyB;
  const [editing, setEditing] = useState(false);
  const [fontFamily, setFontFamily] = useState<string>("'Libre Baskerville', Georgia, serif");
  const [fontSize, setFontSize] = useState<number>(14);
  const editorInputClass = "bg-white text-gray-900 placeholder:text-gray-400 border-gray-300 focus-visible:ring-gold";
  const { user } = useAuth();
  // Fade за всички (не само гости) когато не редактираме и не сме генерирали финален документ —
  // целта е да задържи интереса и да накара потребителя да завърши въпросника / да изхарчи операция.
  const fadeActive = !editing;



  if (generated) {
    const updateClause = (idx: number, patch: Partial<{ title: string; body: string; number: string }>) => {
      if (!onContractChange) return;
      const next = {
        ...generated,
        clauses: generated.clauses.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
      };
      onContractChange(next);
    };
    const enLocked = !!(generated.bilingual && !isPro);
    const enLockClass = enLocked ? " blur-sm select-none pointer-events-none" : "";
    return (
      <ProtectedContent>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {editing && isPro ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-gold/30 bg-card/60 px-2 py-1.5">
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="h-8 rounded border border-border/60 bg-background px-2 text-xs"
                title="Шрифт"
              >
                <option value="'Libre Baskerville', Georgia, serif">Libre Baskerville</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="'Times New Roman', Times, serif">Times New Roman</option>
                <option value="Arial, Helvetica, sans-serif">Arial</option>
                <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
                <option value="'Calibri', sans-serif">Calibri</option>
                <option value="Verdana, sans-serif">Verdana</option>
              </select>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="h-8 rounded border border-border/60 bg-background px-2 text-xs"
                title="Размер"
              >
                {[10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map((s) => (
                  <option key={s} value={s}>{s}px</option>
                ))}
              </select>
            </div>
          ) : <div />}
          {isPro ? (
            <Button
              size="sm"
              variant={editing ? "default" : "outline"}
              onClick={() => setEditing((v) => !v)}
              className={editing ? "bg-gradient-gold text-navy" : "border-gold/40 hover:bg-gold/10 hover:text-gold"}
            >
              {editing ? <><Check className="mr-1 h-3.5 w-3.5" />Готово</> : <><Pencil className="mr-1 h-3.5 w-3.5" />Редактирай</>}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" /> Директна редакция — само Pro
            </span>
          )}
        </div>
        <PreviewFadeGate active={false}>

        <article
          className="legal-paper rounded-md p-6 shadow-elegant md:p-8"
          style={editing && isPro ? { fontFamily, fontSize: `${fontSize}px` } : undefined}
        >

          <div className="mb-2 text-center text-[10px] uppercase tracking-[0.2em] text-foreground/50">
            Създадено с изкуствен интелект
          </div>
          {editing && isPro ? (
            <Input
              value={generated.title}
              onChange={(e) => onContractChange?.({ ...generated, title: e.target.value })}
              className={`text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl ${editorInputClass}`}
              style={{ fontFamily, fontSize: `${fontSize + 4}px` }}
            />
          ) : generated.bilingual ? (
            <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
              <span className="block">{generated.title}</span>
              <span className={`legal-paper-strong mt-1 block${enLockClass}`} aria-hidden={enLocked || undefined}>
                {generated.title_en || generated.title}
              </span>
            </h1>
          ) : (
            <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
              {generated.title}
            </h1>
          )}
          <div className="my-4 gold-divider" />
          {editing && isPro ? (
            <Textarea
              value={generated.preamble}
              onChange={(e) => onContractChange?.({ ...generated, preamble: e.target.value })}
              className={`min-h-[100px] text-sm leading-relaxed ${editorInputClass}`}
              style={{ fontFamily, fontSize: `${fontSize}px` }}
            />
          ) : generated.bilingual ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <p className="whitespace-pre-line text-sm leading-relaxed">{generated.preamble}</p>
              <p
                className={`legal-paper-strong whitespace-pre-line text-sm leading-relaxed md:border-l md:pl-6 md:legal-paper-divider${enLockClass}`}
                aria-hidden={enLocked || undefined}
              >
                {generated.preamble_en}
              </p>
            </div>
          ) : (
            <p className="whitespace-pre-line text-sm leading-relaxed">{generated.preamble}</p>
          )}
          {(generated.clauses ?? []).map((c, i) => (
            <section key={`${c.number}-${i}`} className="mt-6">
              {editing && isPro ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={c.number}
                      onChange={(e) => updateClause(i, { number: e.target.value })}
                      className={`w-20 font-serif font-bold uppercase ${editorInputClass}`}
                      style={{ fontFamily }}
                    />
                    <Input
                      value={c.title}
                      onChange={(e) => updateClause(i, { title: e.target.value })}
                      className={`flex-1 font-serif font-bold uppercase ${editorInputClass}`}
                      style={{ fontFamily }}
                    />
                  </div>
                  <Textarea
                    value={c.body}
                    onChange={(e) => updateClause(i, { body: e.target.value })}
                    className={`min-h-[120px] text-sm leading-relaxed ${editorInputClass}`}
                    style={{ fontFamily, fontSize: `${fontSize}px` }}
                  />
                </div>
              ) : generated.bilingual ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                  <div>
                    <h2 className="font-serif text-base font-bold uppercase">
                      {c.number} {c.title}
                    </h2>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
                  </div>
                  <div className={`md:border-l md:pl-6 md:legal-paper-divider${enLockClass}`} aria-hidden={enLocked || undefined}>
                    <h2 className="legal-paper-strong font-serif text-base font-bold uppercase">
                      {c.number} {c.title_en || c.title}
                    </h2>
                    <p className="legal-paper-strong mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body_en}</p>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="font-serif text-base font-bold uppercase">
                    {c.number} {c.title}
                  </h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
                </>
              )}
            </section>
          ))}
          <div className="my-6 gold-divider" />
          {editing && isPro ? (
            <Textarea
              value={generated.closing}
              onChange={(e) => onContractChange?.({ ...generated, closing: e.target.value })}
              className={`min-h-[80px] text-sm italic ${editorInputClass}`}
              style={{ fontFamily, fontSize: `${fontSize}px` }}
            />
          ) : generated.bilingual ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <p className="whitespace-pre-line text-sm italic">{generated.closing}</p>
              <p
                className={`legal-paper-strong whitespace-pre-line text-sm italic md:border-l md:pl-6 md:legal-paper-divider${enLockClass}`}
                aria-hidden={enLocked || undefined}
              >
                {generated.closing_en}
              </p>
            </div>
          ) : (
            <p className="text-sm italic">{generated.closing}</p>
          )}
          {(signature?.city || signature?.date) && (
            <p className="mt-6 text-sm">гр. {signature?.city || "_____"}, {signature?.date || "_____"}</p>
          )}
          <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs">
            <div>
              {signature?.image_a ? (
                <img src={signature.image_a} alt="Подпис А" className="mx-auto h-14 object-contain" />
              ) : (
                <div className="h-14" />
              )}
              <div className="border-t border-foreground/40 pt-2">За {sector.parties.a}</div>
              <div className="mt-1 font-bold">{sigA}</div>
            </div>
            <div>
              {signature?.image_b ? (
                <img src={signature.image_b} alt="Подпис Б" className="mx-auto h-14 object-contain" />
              ) : (
                <div className="h-14" />
              )}
              <div className="border-t border-foreground/40 pt-2">За {sector.parties.b}</div>
              <div className="mt-1 font-bold">{sigB}</div>
            </div>
          </div>
        </article>
        </PreviewFadeGate>
      </ProtectedContent>

    );
  }

  // Pre-filled boilerplate draft (per sector) — updates with answers
  const clauses = buildInitialClauses(sector, answers, docName);
  const documentTitle = docName || sector.contractName;
  const answeredCount = Object.values(answers).filter(
    (v) => typeof v === "string" && v.trim().length > 0,
  ).length;

  return (
    <ProtectedContent>
      <PreviewFadeGate active={fadeActive} onDownloadBlank={onDownloadBlank}>
        <TemplateDraftOrSkeleton
          docName={docName}
          answers={answers}
          signature={signature}
          documentTitle={documentTitle}
          sector={sector}
          partyA={partyA}
          partyB={partyB}
          clauses={clauses}
          answeredCount={answeredCount}
          bilingual={bilingual}
          documentType={documentType}
        />
      </PreviewFadeGate>
    </ProtectedContent>
  );
}

/**
 * Tries to resolve a pre-written template "бланка" for `docName` and renders
 * it with placeholders progressively filled from `answers`. Falls back to
 * the sector-generic skeleton when no matching template exists.
 */
function TemplateDraftOrSkeleton({
  docName,
  answers,
  signature,
  documentTitle,
  sector,
  partyA,
  partyB,
  clauses,
  answeredCount,
  bilingual = false,
  documentType,
}: {
  docName?: string;
  answers: Record<string, string>;
  signature?: { name_a: string; name_b: string; city: string; date: string };
  documentTitle: string;
  sector: Sector;
  partyA: string;
  partyB: string;
  clauses: Clause[];
  answeredCount: number;
  bilingual?: boolean;
  documentType?: DocumentTypeId | string | null;
}) {
  const [draftRaw, setDraftRaw] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResolved(false);
    setDraftRaw(null);
    loadTemplateDraft(docName).then((text) => {
      if (cancelled) return;
      setDraftRaw(text);
      setResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [docName]);

  if (resolved && draftRaw) {
    const filled = fillTemplateDraft(draftRaw, { answers, signature });
    // Split on blank lines → paragraphs; keep single newlines inside paragraphs.
    const paragraphs = filled.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const [headerParagraph, ...rest] = paragraphs;

    if (bilingual) {
      const titleEn = translateTitleToEn(headerParagraph || documentTitle);
      return (
        <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
              {headerParagraph || documentTitle}
            </h1>
            <h1 className="legal-paper-strong text-center font-serif text-lg font-bold uppercase tracking-wide md:border-l md:pl-6 md:text-xl">
              {titleEn}
            </h1>
          </div>
          <div className="my-4 gold-divider" />
          {rest.map((p, i) => (
            <div key={i} className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <p className="whitespace-pre-line text-sm leading-relaxed">{p}</p>
              <p className="legal-paper-strong whitespace-pre-line text-sm italic leading-relaxed md:border-l md:pl-6">
                {BILINGUAL_PLACEHOLDER_EN}
              </p>
            </div>
          ))}
          <BilingualPreviewNote documentTitle={documentTitle} answeredCount={answeredCount} fromTemplate />
        </article>
      );
    }

    return (
      <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
        <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
          {headerParagraph || documentTitle}
        </h1>
        <div className="my-4 gold-divider" />
        {rest.map((p, i) => (
          <p key={i} className="mt-3 whitespace-pre-line text-sm leading-relaxed">
            {p}
          </p>
        ))}
        <div className="mt-8 rounded-md border border-dashed border-gold/30 bg-gold/[0.04] p-4 text-xs leading-relaxed text-foreground/75">
          <p className="font-semibold text-foreground/90">
            Това е оригиналната бланка на „{documentTitle}", която се попълва на живо с Вашите отговори.
          </p>
          <p className="mt-1.5">
            Финалният документ — с прецизни клаузи, оценка на риска и препоръки от ИИ — се
            генерира след завършване на въпросника.
            {answeredCount > 0 && (
              <span className="ml-1 text-gold">Попълнени са {answeredCount} отговора.</span>
            )}
          </p>
        </div>
      </article>
    );
  }

  // Type-specific skeleton override — when a non-contract documentType is
  // selected (e.g. Споразумение, Нотариална покана, Декларация, …) we render
  // a structure that matches that document type instead of the generic
  // two-party contract preamble.
  const typeSkeleton = buildTypeSkeleton(documentType, partyA, partyB, docName);
  if (typeSkeleton) {
    const { preambleLines, clauses: typeClauses } = typeSkeleton;
    if (bilingual) {
      const titleEn = translateTitleToEn(documentTitle);
      return (
        <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
              {documentTitle}
            </h1>
            <h1 className="legal-paper-strong text-center font-serif text-lg font-bold uppercase tracking-wide md:border-l md:pl-6 md:text-xl">
              {titleEn}
            </h1>
          </div>
          <div className="my-4 gold-divider" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            <div className="space-y-3 text-sm leading-relaxed">
              {preambleLines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <div className="legal-paper-strong space-y-3 text-sm italic leading-relaxed md:border-l md:pl-6">
              <p>{BILINGUAL_PLACEHOLDER_EN}</p>
            </div>
          </div>
          {typeClauses.map((c) => {
            const titleEnC = translateTitleToEn(c.title);
            return (
              <section key={c.roman} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                <div>
                  <h2 className="font-serif text-base font-bold uppercase">{c.roman} {c.title}</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
                </div>
                <div className="md:border-l md:pl-6">
                  <h2 className="legal-paper-strong font-serif text-base font-bold uppercase">{c.roman} {titleEnC}</h2>
                  <p className="legal-paper-strong mt-2 whitespace-pre-line text-sm italic leading-relaxed">
                    {BILINGUAL_PLACEHOLDER_EN}
                  </p>
                </div>
              </section>
            );
          })}
          <BilingualPreviewNote documentTitle={documentTitle} answeredCount={answeredCount} />
        </article>
      );
    }
    return (
      <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
        <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
          {documentTitle}
        </h1>
        <div className="my-4 gold-divider" />
        <div className="space-y-3 text-sm leading-relaxed">
          {preambleLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        {typeClauses.map((c) => (
          <section key={c.roman} className="mt-6">
            <h2 className="font-serif text-base font-bold uppercase">{c.roman} {c.title}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
          </section>
        ))}
        <div className="mt-8 rounded-md border border-dashed border-gold/30 bg-gold/[0.04] p-4 text-xs leading-relaxed text-foreground/75">
          <p className="font-semibold text-foreground/90">
            Това е примерен скелет на „{documentTitle}", оформен според структурата на избрания вид документ.
          </p>
          <p className="mt-1.5">
            Финалният документ — с прецизни клаузи, оценка на риска и препоръки от ИИ — се генерира след завършване на въпросника.
            {answeredCount > 0 && (
              <span className="ml-1 text-gold">Попълнени са {answeredCount} отговора.</span>
            )}
          </p>
        </div>
      </article>
    );
  }

  // Fallback: sector-generic skeleton (запазено поведение)
  if (bilingual) {
    const titleEn = translateTitleToEn(documentTitle);
    return (
      <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
            {documentTitle}
          </h1>
          <h1 className="legal-paper-strong text-center font-serif text-lg font-bold uppercase tracking-wide md:border-l md:pl-6 md:text-xl">
            {titleEn}
          </h1>
        </div>
        <div className="my-4 gold-divider" />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <div className="space-y-3 text-sm leading-relaxed">
            <p>Днес, [ДАТА], в гр. [ГРАД], между:</p>
            <p>
              <strong>1. {partyA}</strong>
              {renderPartyIdentifier(answers.party_a_type)}, наричан по-долу „
              <em>{sector.parties.a}</em>", и
            </p>
            <p>
              <strong>2. {partyB}</strong>
              {renderPartyIdentifier(answers.party_b_type)}, наричан по-долу „
              <em>{sector.parties.b}</em>",
            </p>
            <p>се сключи настоящият документ за следното:</p>
          </div>
          <div className="legal-paper-strong space-y-3 text-sm italic leading-relaxed md:border-l md:pl-6">
            <p>Today, [DATE], in [CITY], between:</p>
            <p>
              <strong>1. {partyA}</strong>
              {renderPartyIdentifierEn(answers.party_a_type)}, hereinafter „<em>{translatePartyRole(sector.parties.a)}</em>", and
            </p>
            <p>
              <strong>2. {partyB}</strong>
              {renderPartyIdentifierEn(answers.party_b_type)}, hereinafter „<em>{translatePartyRole(sector.parties.b)}</em>",
            </p>
            <p>have entered into this Agreement as follows:</p>
          </div>
        </div>

        {clauses.map((c) => {
          const titleEn = translateTitleToEn(c.title);
          return (
            <section key={c.roman} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <div>
                <h2 className="font-serif text-base font-bold uppercase">
                  {c.roman} {c.title}
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
              </div>
              <div className="md:border-l md:pl-6">
                <h2 className="legal-paper-strong font-serif text-base font-bold uppercase">
                  {c.roman} {titleEn}
                </h2>
                <p className="legal-paper-strong mt-2 whitespace-pre-line text-sm italic leading-relaxed">
                  {BILINGUAL_PLACEHOLDER_EN}
                </p>
              </div>
            </section>
          );
        })}

        <BilingualPreviewNote documentTitle={documentTitle} answeredCount={answeredCount} />
      </article>
    );
  }

  return (

      <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
        <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
          {documentTitle}
        </h1>
        <div className="my-4 gold-divider" />

        <p className="text-sm leading-relaxed">
          Днес, [ДАТА], в гр. [ГРАД], между:
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          <strong>1. {partyA}</strong>
          {renderPartyIdentifier(answers.party_a_type)}, наричан по-долу „
          <em>{sector.parties.a}</em>", и
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          <strong>2. {partyB}</strong>
          {renderPartyIdentifier(answers.party_b_type)}, наричан по-долу „
          <em>{sector.parties.b}</em>",
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          се сключи настоящият документ за следното:
        </p>

        {clauses.map((c) => (
          <section key={c.roman} className="mt-6">
            <h2 className="font-serif text-base font-bold uppercase">
              {c.roman} {c.title}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
          </section>
        ))}

        <div className="mt-8 rounded-md border border-dashed border-gold/30 bg-gold/[0.04] p-4 text-xs leading-relaxed text-foreground/75">
          <p className="font-semibold text-foreground/90">
            Това е примерен скелет на „{documentTitle}", който се актуализира на живо с Вашите отговори.
          </p>
          <p className="mt-1.5">
            Финалният документ — с прецизни клаузи по ЗЗД/ТЗ/КТ, оценка на риска и препоръки от ИИ — се
            генерира след завършване на въпросника. Отнема ~2 минути.
            {answeredCount > 0 && (
              <span className="ml-1 text-gold">Попълнени са {answeredCount} отговора.</span>
            )}
          </p>
        </div>
      </article>
  );
}

/* ============================================================================
 * Bilingual preview helpers
 * --------------------------------------------------------------------------
 * Used only by the BG/EN two-column skeleton preview. The actual generated
 * contract carries authoritative *_en fields from the AI; these helpers exist
 * solely so the pre-generation skeleton already *looks* bilingual.
 * ========================================================================== */

const BILINGUAL_PLACEHOLDER_EN =
  "The parallel English text will be inserted alongside the Bulgarian section in the final bilingual document.";

/** Map common Bulgarian skeleton headings to professional English equivalents. */
const TITLE_EN: Record<string, string> = {
  "Предмет на договора": "Subject of the Agreement",
  "Предмет на трудовия договор": "Subject of the Employment Agreement",
  "Предмет на пълномощното": "Scope of the Power of Attorney",
  "Предмет на поканата": "Subject of the Notice",
  "Предмет": "Subject",
  "Срок на договора": "Term",
  "Срок и действие": "Term and Effect",
  "Срок и място на работа": "Term and Place of Work",
  "Срок и погасяване": "Term and Repayment",
  "Срок и отмяна": "Term and Revocation",
  "Срок за доброволно изпълнение": "Voluntary Performance Period",
  "Срокове за изпълнение": "Performance Deadlines",
  "Срокове и приемане": "Deadlines and Acceptance",
  "Работно време и почивки": "Working Hours and Rest Periods",
  "Възнаграждение и плащане": "Remuneration and Payment",
  "Трудово възнаграждение": "Salary",
  "Наемна цена и плащане": "Rent and Payment",
  "Стойност и плащане": "Value and Payment",
  "Цена и плащане": "Price and Payment",
  "Навло и плащане": "Freight and Payment",
  "Размер и характер на задължението": "Amount and Nature of the Obligation",
  "Лихва": "Interest",
  "Права и задължения на страните": "Rights and Obligations of the Parties",
  "Задължения на превозвача": "Obligations of the Carrier",
  "Задължения на възложителя": "Obligations of the Principal",
  "Обем на представителната власт": "Scope of Representation",
  "Отговорност и неустойки": "Liability and Penalties",
  "Отговорност и застраховка": "Liability and Insurance",
  "Неустойки": "Penalties",
  "Неустойки и последици при неизпълнение": "Penalties and Consequences of Default",
  "Неустойки и прекратяване": "Penalties and Termination",
  "Обезпечение": "Security",
  "Прекратяване": "Termination",
  "Прекратяване на трудовия договор": "Termination of the Employment Agreement",
  "Платен годишен отпуск": "Paid Annual Leave",
  "Качество и гаранции": "Quality and Warranties",
  "Приемане на работата": "Acceptance of the Work",
  "Авторски и интелектуални права": "Intellectual Property Rights",
  "Конфиденциалност (NDA)": "Confidentiality (NDA)",
  "Управление": "Governance",
  "Форсмажор (непреодолима сила)": "Force Majeure",
  "Подсъдност": "Jurisdiction",
  "Частична недействителност (Severability)": "Severability",
  "Заключителни разпоредби": "Final Provisions",
  "Отчет": "Reporting",
  "Последици при неизпълнение": "Consequences of Default",
};

function translateTitleToEn(title: string): string {
  const trimmed = title.trim();
  if (TITLE_EN[trimmed]) return TITLE_EN[trimmed];
  // Strip leading numbering like "I. " or "Чл. 1." before lookup.
  const stripped = trimmed.replace(/^([IVXLCM]+\.\s*|Чл\.\s*\d+\.\s*)/i, "").trim();
  if (TITLE_EN[stripped]) return TITLE_EN[stripped];
  return trimmed;
}

const PARTY_ROLE_EN: Record<string, string> = {
  "Възложител": "Principal",
  "Изпълнител": "Contractor",
  "Наемодател": "Lessor",
  "Наемател": "Lessee",
  "Продавач": "Seller",
  "Купувач": "Buyer",
  "Работодател": "Employer",
  "Служител": "Employee",
  "Заемодател": "Lender",
  "Заемополучател": "Borrower",
  "Упълномощител": "Principal",
  "Пълномощник": "Attorney-in-Fact",
  "Превозвач": "Carrier",
  "Заявител": "Applicant",
  "Получател": "Recipient",
  "Страна А": "Party A",
  "Страна Б": "Party B",
};

function translatePartyRole(role: string): string {
  return PARTY_ROLE_EN[role.trim()] || role;
}

function renderPartyIdentifierEn(type?: string): string {
  if (!type) return "";
  const t = type.toLowerCase();
  if (t.includes("физическо")) return ", Personal ID [........]";
  if (t.includes("ет") || t.includes("самоосигуряващо")) return ", Company ID [........], represented by [Authorised Person]";
  if (t.includes("юридическо")) return ", Company ID [........], represented by [Authorised Person], VAT No [........]";
  return ` — ${type}`;
}

function BilingualPreviewNote({
  documentTitle,
  answeredCount,
  fromTemplate = false,
}: {
  documentTitle: string;
  answeredCount: number;
  fromTemplate?: boolean;
}) {
  return (
    <div className="mt-8 rounded-md border border-dashed border-gold/30 bg-gold/[0.04] p-4 text-xs leading-relaxed text-foreground/75">
      <p className="font-semibold text-foreground/90">
        Двуезичен преглед на „{documentTitle}" — българският {fromTemplate ? "текст от бланката" : "скелет"} вляво, паралелен английски превод вдясно.
      </p>
      <p className="mt-1.5">
        Финалният документ генерира пълен паралелен английски (BG / EN) с правни клаузи и
        двуколонен експорт в PDF и DOCX.
        {answeredCount > 0 && (
          <span className="ml-1 text-gold">Попълнени са {answeredCount} отговора.</span>
        )}
      </p>
    </div>
  );
}

