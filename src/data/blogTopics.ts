// 30 SEO-curated blog topics for Bulgarian contract law.
// Used by scripts/generate-blog.ts to produce article + image per slug.
// Each topic targets a specific high-intent keyword cluster.

/**
 * Editorially curated official source for a topic. Must be supplied by a human
 * before any article text may be generated for that topic — domain allowlists
 * alone are not factual grounding.
 */
export interface BlogTopicSource {
  /** Human-readable title of the official source. */
  title: string;
  /** Canonical HTTPS URL (official publisher only). */
  url: string;
  /** Grounding note: exactly which claims/scope this source supports. */
  note: string;
}

export interface BlogTopic {
  slug: string;
  title: string;
  keyword: string;
  summary: string; // 140-160 chars meta description seed
  category:
    | "Договори"
    | "Трудово право"
    | "Имоти"
    | "Защита на потребителя"
    | "GDPR"
    | "Търговско право"
    | "Семейно право"
    | "Данъци";
  imagePrompt: string; // editorial direction for hero image
  /**
   * Editorially supplied source pack. Generation of article text fails closed
   * unless at least 2 HTTPS sources with non-empty notes are present.
   * Intentionally not bulk-populated: each entry must be curated by a human.
   */
  sourcePack?: readonly BlogTopicSource[];
}

export const BLOG_TOPICS: BlogTopic[] = [
  {
    slug: "kak-da-napravim-dogovor-za-naem",
    title: "Как да направим договор за наем на жилище през 2026 г.",
    keyword: "договор за наем на жилище",
    summary:
      "Подробно ръководство за договор за наем на жилище — задължителни реквизити по ЗЗД, депозит, прекратяване и често допускани грешки.",
    category: "Имоти",
    imagePrompt:
      "Editorial overhead photograph of an open lease document on a dark walnut desk, brass key on a leather keyring, fountain pen, soft window light from the side, single small house plant out of focus, muted navy and gold palette, Financial Times style, no text, no logos, cinematic depth of field",
  },
  {
    slug: "predvaritelen-dogovor-za-pokupka-na-imot",
    title: "Предварителен договор за покупко-продажба на имот: реквизити и капани",
    keyword: "предварителен договор имот",
    summary:
      "Какво трябва да съдържа предварителният договор за имот по чл. 19 ЗЗД, ролята на капарото и кога може да се иска нотариален акт.",
    category: "Имоти",
    imagePrompt:
      "Editorial close-up of a notarial stamp pressed onto a property contract, embossed seal visible, dark mahogany desk surface, warm tungsten lighting, blurred architectural blueprint in background, navy and gold color grading, Bloomberg Businessweek style, no text",
  },
  {
    slug: "trudov-dogovor-osnovni-elementi",
    title: "Трудов договор: основни елементи по Кодекса на труда",
    keyword: "трудов договор елементи",
    summary:
      "Задължителни реквизити по чл. 66 КТ, изпитателен срок, длъжностна характеристика и регистрация в НАП в 3-дневен срок.",
    category: "Трудово право",
    imagePrompt:
      "Editorial photograph of a signed employment contract on a slate-grey conference table, modern silver pen across the page, geometric office reflections, clean minimalist composition, navy and warm amber tones, Financial Times editorial style, no text, no faces",
  },
  {
    slug: "grazhdanski-dogovor-vs-trudov-dogovor",
    title: "Граждански договор срещу трудов договор: разлики и рискове",
    keyword: "граждански договор",
    summary:
      "Кога е законосъобразно да се ползва граждански договор, кога НАП преквалифицира като трудов и какви са санкциите.",
    category: "Трудово право",
    imagePrompt:
      "Editorial split composition with two paper documents fanned out on a dark desk, brass paperclip, vintage law book edge visible, dramatic side lighting, navy and gold tones, The Economist magazine style, no text, no logos",
  },
  {
    slug: "dogovor-za-izrabotka-zzd",
    title: "Договор за изработка по ЗЗД: какво да включите",
    keyword: "договор за изработка",
    summary:
      "Регламент по чл. 258-269 ЗЗД, разлика от поръчка и от трудов договор, гаранция за качество и приемно-предавателен протокол.",
    category: "Договори",
    imagePrompt:
      "Editorial overhead of architectural drafting tools — brass compass, ruler, pencil — laid over a folded contract on dark linen, single shaft of warm window light, Bauhaus minimalism, navy and ochre palette, Bloomberg style editorial photo, no text",
  },
  {
    slug: "neustojka-v-dogovor",
    title: "Неустойка в договор: как да я уговорим правилно",
    keyword: "неустойка договор",
    summary:
      "Видове неустойки по ЗЗД, съдебна практика на ВКС за прекомерност, как да формулираме клаузата без да е нищожна.",
    category: "Договори",
    imagePrompt:
      "Editorial macro of an antique brass scale of justice on a dark green leather desk, single document slightly out of focus, dramatic chiaroscuro lighting, deep navy and gold tones, Financial Times opinion piece style, no text, no faces",
  },
  {
    slug: "dogovor-za-zaem-mezhdu-fizicheski-litsa",
    title: "Договор за заем между физически лица: образец и данъци",
    keyword: "договор за заем",
    summary:
      "Кога трябва писмена форма по чл. 240 ЗЗД, лихва по чл. 86, деклариране в ГДД и доказване пред НАП.",
    category: "Договори",
    imagePrompt:
      "Editorial photograph of a stack of crisp euro banknotes weighed down by a glass paperweight on a contract, soft directional light, dark wooden desk, sober muted palette of forest green and gold, Bloomberg Businessweek style, no text, no faces",
  },
  {
    slug: "predizvestie-uvolnenie",
    title: "Предизвестие за уволнение: срокове и грешки на работодателите",
    keyword: "предизвестие уволнение",
    summary:
      "Срокове по чл. 326 КТ, изчисляване, връчване с обратна разписка и съдебна практика по неправомерно уволнение.",
    category: "Трудово право",
    imagePrompt:
      "Editorial close-up of a sealed envelope on a dark grey desk next to a fountain pen and an analog desk clock, soft window light, navy and warm grey palette, The Economist editorial style, no text, no faces",
  },
  {
    slug: "ddt-i-dogovor-grazhdanski",
    title: "ДДС и граждански договор: кога се удържа авансов данък",
    keyword: "авансов данък граждански договор",
    summary:
      "Удържане на 10% авансов данък по ЗДДФЛ, нормативно признати разходи 25%/40%, осигуровки и декларация Образец 6.",
    category: "Данъци",
    imagePrompt:
      "Editorial overhead of a calculator, tax forms, and a fountain pen on a dark walnut desk with single brass paperweight, warm directional lighting, sober navy and gold palette, Financial Times style, no text, no faces",
  },
  {
    slug: "dogovor-za-poruchka",
    title: "Договор за поръчка по ЗЗД: пълномощно и отговорност",
    keyword: "договор за поръчка",
    summary:
      "Разлика между поръчка и пълномощно, обем на представителната власт, отчет на довереника и прекратяване по чл. 287 ЗЗД.",
    category: "Договори",
    imagePrompt:
      "Editorial photograph of a leather-bound document folder slightly open on a dark desk, vintage pen and brass key resting on top, dim warm lighting, deep navy palette, Bloomberg editorial style, no text",
  },
  {
    slug: "obshti-uslovia-onlayn-magazin",
    title: "Общи условия за онлайн магазин: задължително съдържание",
    keyword: "общи условия онлайн магазин",
    summary:
      "Изисквания по ЗЗП и Регламент 2018/302, право на отказ 14 дни, информация за гаранция и алтернативно решаване на спорове.",
    category: "Защита на потребителя",
    imagePrompt:
      "Editorial photograph of a sleek black laptop closed on a dark desk with a single contract document beside it, brass desk lamp glow, sober navy and amber palette, Financial Times tech section style, no text, no logos, no screens",
  },
  {
    slug: "gdpr-za-malki-firmi",
    title: "GDPR за малки фирми: 7 задължителни документа",
    keyword: "GDPR малък бизнес",
    summary:
      "Регистър на дейностите, политика за поверителност, ОС с обработващи, оценка на въздействието и съгласия по ЗЗЛД.",
    category: "GDPR",
    imagePrompt:
      "Editorial overhead of stacked legal binders with subtle EU blue accent, single fountain pen and steel paperclip on top, dramatic side light, navy and steel grey palette, The Economist style, no text, no logos, no faces",
  },
  {
    slug: "politika-za-poveritelnost-shablon",
    title: "Политика за поверителност: какво съдържа правилният шаблон",
    keyword: "политика за поверителност",
    summary:
      "Минимални елементи по чл. 13 GDPR, основания за обработване, срокове на съхранение и права на субекта.",
    category: "GDPR",
    imagePrompt:
      "Editorial close-up of a printed policy document on a dark grey desk with a fountain pen, soft natural window light, monochromatic navy palette with single warm gold accent, Bloomberg editorial style, no text",
  },
  {
    slug: "nda-spogodba-za-poveritelnost",
    title: "NDA (споразумение за поверителност): шаблон и капани",
    keyword: "NDA споразумение поверителност",
    summary:
      "Едностранни и двустранни NDA, обхват на конфиденциалната информация, срок и неустойки за нарушение.",
    category: "Договори",
    imagePrompt:
      "Editorial overhead of a sealed manila envelope marked with a wax stamp on a dark desk, single brass key beside it, dramatic moody lighting, deep navy and gold tones, Financial Times investigative style, no text, no logos",
  },
  {
    slug: "dogovor-za-uslugi-mezhdu-firmi",
    title: "Договор за услуги между фирми: B2B клаузи, които спестяват пари",
    keyword: "договор за услуги между фирми",
    summary:
      "SLA, лимит на отговорност, intellectual property, fora за разрешаване на спорове и автоматично подновяване.",
    category: "Търговско право",
    imagePrompt:
      "Editorial photograph of two glass tumblers with water beside open contract folders on a dark conference table, soft directional window light, navy and warm grey corporate palette, Bloomberg Businessweek style, no text, no faces",
  },
  {
    slug: "kak-da-prekratim-dogovor-za-naem",
    title: "Как да прекратим договор за наем без неустойка",
    keyword: "прекратяване договор за наем",
    summary:
      "Едностранно прекратяване по чл. 87 ЗЗД, нотариално предизвестие, връщане на депозит и приемно-предавателен протокол.",
    category: "Имоти",
    imagePrompt:
      "Editorial close-up of a brass house key being placed on a folded contract document on a dark desk, single warm light source, navy and amber palette, Financial Times style, no text, no faces",
  },
  {
    slug: "dogovor-za-darenie",
    title: "Договор за дарение на пари или имот: форма и данъци",
    keyword: "договор за дарение",
    summary:
      "Изисквана форма по чл. 225 ЗЗД, нотариална форма за имоти, данък по ЗМДТ и отмяна по чл. 227.",
    category: "Договори",
    imagePrompt:
      "Editorial overhead of a wrapped gift envelope tied with twine on a dark wooden desk beside a vintage fountain pen, sober muted lighting, navy and warm gold palette, Bloomberg editorial style, no text, no faces",
  },
  {
    slug: "dogovor-za-frenchayz",
    title: "Договор за франчайз в България: рискове за франчайзополучателя",
    keyword: "договор за франчайз",
    summary:
      "Атипичен договор без специален закон, преддоговорно разкриване, обхват на марката, royalty и излизане.",
    category: "Търговско право",
    imagePrompt:
      "Editorial photograph of an open contract on a dark marble desk with a brass desk lamp casting warm directional light, single coffee cup edge visible, navy and gold corporate palette, The Economist editorial style, no text, no logos",
  },
  {
    slug: "kak-da-osporim-glob",
    title: "Как да оспорим глоба от КАТ или община: процедура",
    keyword: "оспорване на глоба",
    summary:
      "Възражение в 7-дневен срок по ЗАНН, обжалване пред районен съд, шансове и съдебни такси.",
    category: "Договори",
    imagePrompt:
      "Editorial overhead of a blank legal complaint form on a dark desk with a fountain pen and single steel paperclip, dramatic side lighting, navy and warm grey palette, Financial Times style, no text, no faces",
  },
  {
    slug: "brachen-dogovor-balgaria",
    title: "Брачен договор в България: какво може и какво не може да съдържа",
    keyword: "брачен договор",
    summary:
      "Регламент по СК от 2009 г., режим на разделност, защита на бизнес активи и нотариална форма.",
    category: "Семейно право",
    imagePrompt:
      "Editorial close-up of two simple platinum wedding rings resting on the corner of a folded legal document, dark velvet surface, single dramatic light source, deep navy and gold palette, Bloomberg lifestyle editorial style, no text",
  },
  {
    slug: "izdrazhka-detsa-razvod",
    title: "Издръжка за дете при развод: размер и принудително събиране",
    keyword: "издръжка за дете",
    summary:
      "Минимална издръжка по чл. 142 СК, фактори за определяне, изпълнителен лист и удръжки от заплата.",
    category: "Семейно право",
    imagePrompt:
      "Editorial overhead of a small wooden toy beside a folded family law document on a dark grey desk, soft window light from above, sober navy and warm wood palette, The Economist family section style, no text, no faces",
  },
  {
    slug: "dogovor-za-zaem-na-vesht",
    title: "Договор за заем за послужване: безвъзмездно ползване на вещ",
    keyword: "заем за послужване",
    summary:
      "Регламент по чл. 243-249 ЗЗД, отговорност за вреди, връщане и разлика от наема.",
    category: "Договори",
    imagePrompt:
      "Editorial photograph of a vintage leather-bound book and a brass key resting on a dark linen surface, single warm side light, navy and amber palette, Bloomberg cultural section style, no text, no faces",
  },
  {
    slug: "vrushtane-na-stoka-online",
    title: "Връщане на стока, купена онлайн: вашите права по ЗЗП",
    keyword: "връщане на стока онлайн",
    summary:
      "Право на отказ 14 дни без причина, изключения, разходи за връщане и срок за възстановяване на сумата.",
    category: "Защита на потребителя",
    imagePrompt:
      "Editorial overhead of a closed brown shipping box tied with twine on a dark desk beside a paper return form, single soft window light, sober navy and warm tan palette, Financial Times consumer section style, no text, no logos",
  },
  {
    slug: "garantsia-na-stoka",
    title: "Гаранция на стока в България: законова срещу търговска",
    keyword: "законова гаранция стока",
    summary:
      "2 години законова гаранция по ЗПЦСЦУПС, рекламация, ремонт срещу замяна и отговорност на търговеца.",
    category: "Защита на потребителя",
    imagePrompt:
      "Editorial close-up of a brass scale with a small product box on one side and a contract on the other, dark walnut desk, dramatic moody lighting, deep navy and gold palette, Bloomberg consumer style, no text, no logos",
  },
  {
    slug: "dogovor-za-stroitelstvo-fidic",
    title: "Договор за строителство: ЗУТ и FIDIC клаузи на български пазар",
    keyword: "договор за строителство",
    summary:
      "Етапи, фактуриране, гаранционни срокове по Наредба №2 и форсмажор в строителството.",
    category: "Имоти",
    imagePrompt:
      "Editorial overhead of architectural blueprints rolled up on a dark concrete surface beside a hard hat and a folded contract, dramatic warm side light, navy and ochre palette, The Economist construction sector style, no text, no logos",
  },
  {
    slug: "dogovor-za-prodazhba-na-avtomobil",
    title: "Договор за покупко-продажба на автомобил: нотариална заверка",
    keyword: "договор продажба автомобил",
    summary:
      "Нотариална заверка на подписите, регистрация в КАТ за 14 дни и данък по ЗМДТ.",
    category: "Договори",
    imagePrompt:
      "Editorial close-up of car keys on a leather fob resting on a folded vehicle contract on a dark desk, single warm light source, sober navy and warm tan palette, Financial Times automotive style, no text, no logos",
  },
  {
    slug: "ucheniecheski-dogovor-stipendia",
    title: "Ученически договор за стипендия: задължения след дипломиране",
    keyword: "договор за стипендия",
    summary:
      "Договор по чл. 230 КТ, срок на отработване, връщане на стипендията и съдебна практика по нищожност.",
    category: "Трудово право",
    imagePrompt:
      "Editorial overhead of an open notebook, fountain pen and a folded contract on a dark walnut desk, single warm window light, navy and amber academic palette, The Economist education sector style, no text, no faces",
  },
  {
    slug: "dogovor-za-deystvitelnost-prikazka",
    title: "Нищожност и унищожаемост на договор: разлики и срокове",
    keyword: "нищожен договор",
    summary:
      "Основания по чл. 26 ЗЗД, разлика от унищожаемост по чл. 27, тригодишен и петгодишен срок за иск.",
    category: "Договори",
    imagePrompt:
      "Editorial close-up of a contract document partially torn at the corner on a dark desk, single brass paperweight beside it, dramatic moody side lighting, deep navy and gold palette, Financial Times opinion style, no text",
  },
  {
    slug: "podpis-elektronen-zes",
    title: "Електронен подпис в България: КЕП срещу обикновен",
    keyword: "електронен подпис",
    summary:
      "Видове по ЗЕДЕУУ, кога е равен на саморъчен, доставчици и приложение в договори и НАП.",
    category: "Договори",
    imagePrompt:
      "Editorial overhead of a sleek silver tablet with stylus resting on a paper contract on a dark desk, single warm directional light, sober navy and gold palette, Bloomberg tech section style, no text, no logos, no screens visible",
  },
  {
    slug: "dogovor-za-prodazhba-na-firma",
    title: "Договор за прехвърляне на дружествени дялове: процедура и данъци",
    keyword: "продажба на дялове",
    summary:
      "Нотариална форма по ТЗ, оценка, преобразуване на капитала, вписване в ТР и данъчно облагане.",
    category: "Търговско право",
    imagePrompt:
      "Editorial close-up of a corporate seal stamp pressed into a contract on a dark mahogany desk, single fountain pen beside it, dramatic warm light, deep navy and gold corporate palette, The Economist business section style, no text, no logos",
  },
];

if (BLOG_TOPICS.length !== 30) {
  throw new Error(`Expected 30 blog topics, got ${BLOG_TOPICS.length}`);
}
