import type { Sector } from "@/data/sectors";
import { ProtectedContent } from "@/components/ProtectedContent";

type Clause = { roman: string; title: string; body: string };

const CURRENCY = "€";

function buildInitialClauses(sector: Sector, a: Record<string, string>): Clause[] {
  const partyA = `„${sector.parties.a}“`;
  const partyB = `„${sector.parties.b}“`;

  const baseClosing: Clause[] = [
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
    default:
      return [];
  }
}

export function LiveDraft({
  sector,
  answers,
  generated,
  signature,
}: {
  sector: Sector;
  answers: Record<string, string>;
  generated?: {
    title: string;
    preamble: string;
    clauses: { number: string; title: string; body: string }[];
    closing: string;
  } | null;
  signature?: {
    name_a: string;
    name_b: string;
    city: string;
    date: string;
    image_a?: string;
    image_b?: string;
  };
}) {
  const partyA = answers.party_a_name || `[${sector.parties.a}]`;
  const partyB = answers.party_b_name || `[${sector.parties.b}]`;
  const sigA = signature?.name_a || partyA;
  const sigB = signature?.name_b || partyB;

  if (generated) {
    return (
      <ProtectedContent>
        <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
          <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
            {generated.title}
          </h1>
          <div className="my-4 gold-divider" />
          <p className="whitespace-pre-line text-sm leading-relaxed">{generated.preamble}</p>
          {generated.clauses.map((c) => (
            <section key={c.number} className="mt-6">
              <h2 className="font-serif text-base font-bold uppercase">
                {c.number} {c.title}
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
            </section>
          ))}
          <div className="my-6 gold-divider" />
          <p className="text-sm italic">{generated.closing}</p>
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
      </ProtectedContent>
    );
  }

  // Pre-filled boilerplate draft (per sector) — updates with answers
  const clauses = buildInitialClauses(sector, answers);

  return (
    <ProtectedContent>
      <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
        <h1 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
          {sector.contractName}
        </h1>
        <div className="my-4 gold-divider" />

        <p className="text-sm leading-relaxed">
          Днес, [ДАТА], в гр. [ГРАД], между:
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          <strong>1. {partyA}</strong>
          {answers.party_a_type ? ` — ${answers.party_a_type}` : ""}, наричан по-долу „
          <em>{sector.parties.a}</em>“, и
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          <strong>2. {partyB}</strong>
          {answers.party_b_type ? ` — ${answers.party_b_type}` : ""}, наричан по-долу „
          <em>{sector.parties.b}</em>“,
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          се сключи настоящият договор за следното:
        </p>

        {clauses.map((c) => (
          <section key={c.roman} className="mt-6">
            <h2 className="font-serif text-base font-bold uppercase">
              {c.roman} {c.title}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
          </section>
        ))}

        <div className="mt-8 rounded-md border border-dashed border-foreground/20 bg-foreground/[0.03] p-3 text-xs italic text-foreground/60">
          Това е работен текст, който се актуализира с Вашите отговори. След завършване на интервюто
          системата ще създаде окончателния договор с пълни и прецизирани клаузи.
        </div>
      </article>
    </ProtectedContent>
  );
}
