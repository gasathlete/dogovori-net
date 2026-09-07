/**
 * P1 — правна точност на трите най-посещавани бланки (правен преглед 07.09.2026).
 * Семантични асерции върху точните производствени текстове, без снапшоти.
 * Източници: ЗЗД (justice.government.bg/home/normdoc/2121934337),
 * КТ (justice.government.bg/home/normdoc/1594373121),
 * НАП Регистър на заетостта, ОРЗД (минимизация на данните).
 */
import { describe, it, expect } from "vitest";
import protocol from "@/data/templateDrafts/priemo-predavatelen-protokol";
import lease from "@/data/templateDrafts/dogovor-za-naem-na-parkomyasto-garazh";
import notice from "@/data/templateDrafts/molba-za-napuskane";
import { getSeoTemplateIntent } from "@/lib/seoTemplateIntent";
import { loadTemplateDraft } from "@/lib/templateDraftResolver";
import { hasTemplateDraft, loadTemplateDraft as loadBySlug } from "@/data/templateDrafts/index";

describe("приемно-предавателен протокол", () => {
  it("не се позовава на чл. 350 ЗЗД", () => {
    expect(protocol).not.toMatch(/чл\.\s*350/);
  });

  it("запазва правилния правопис в заглавието", () => {
    expect(protocol.startsWith("ПРИЕМНО-ПРЕДАВАТЕЛЕН ПРОТОКОЛ")).toBe(true);
    expect(protocol).not.toMatch(/приемо-предавател/i);
  });

  it("стъпва на посочено от ползвателя основание", () => {
    expect(protocol).toMatch(/във връзка с \[ПОСОЧЕТЕ КОНКРЕТНОТО ОСНОВАНИЕ/);
  });

  it("не прехвърля безусловно риска и последващите загуби", () => {
    expect(protocol).not.toMatch(/рискът от погиване или повреждане, преминават/);
    expect(protocol).not.toMatch(/Всички последващи щети, повреди или загуби/);
    expect(protocol).toMatch(/не прехвърля риска и не създава отговорност/);
    expect(protocol).toMatch(/повелителните норми на закона/);
    expect(protocol).toMatch(/НЕ СЕ УГОВАРЯ/);
  });

  it("удостоверява факти: състояние, ключове, показания, документи, снимки", () => {
    expect(protocol).toMatch(/удостоверяват фактическото предаване/);
    expect(protocol).toMatch(/Ключове и средства за достъп/);
    expect(protocol).toMatch(/Показания на измервателни устройства/);
    expect(protocol).toMatch(/Предадени документи/);
    expect(protocol).toMatch(/Фотодокументация/);
  });

  it("липсата на забележки не е отказ от права за скрити недостатъци", () => {
    expect(protocol).toMatch(/не представлява отказ от права относно скрити недостатъци/);
  });

  it("писмената форма е сведена до поправки по фактическото съдържание", () => {
    expect(protocol).not.toMatch(/за да бъдат валидни/);
    expect(protocol).toMatch(/Поправки и допълнения на фактическото съдържание/);
  });

  it("запазва подписи, плейсхолдъри и EUR само при отразена стойност", () => {
    expect(protocol).toMatch(/ПРЕДАВАЩ:/);
    expect(protocol).toMatch(/ПРИЕМАЩ:/);
    expect(protocol).toMatch(/\[СУМА В EUR\] EUR/);
    expect(protocol).toMatch(/ПОПЪЛВА СЕ САМО АКО СТОЙНОСТ ДЕЙСТВИТЕЛНО СЕ ОТРАЗЯВА/);
  });
});

describe("договор за наем на паркомясто/гараж", () => {
  it("няма правописна грешка „изритното“", () => {
    expect(lease).not.toMatch(/изритното/);
    expect(lease).toMatch(/изричното писмено съгласие/);
  });

  it("съдържа практична депозитна клауза", () => {
    expect(lease).toMatch(/ДЕПОЗИТ \(ГАРАНЦИЯ\)/);
    expect(lease).toMatch(/не представлява предплатена наемна цена/);
    expect(lease).toMatch(/изискуеми и незаплатени суми/);
    expect(lease).toMatch(/надхвърлящи нормалното износване/);
    expect(lease).toMatch(/писмено извлечение с описание на всяко удържано перо/);
    expect(lease).toMatch(/в срок до \[БРОЙ ДНИ\] дни след връщането на имота/);
    expect(lease).toMatch(/не се прихваща автоматично срещу последния наем/);
  });

  it("описва предаване на средства за достъп и правила за достъп", () => {
    expect(lease).toMatch(/дистанционни управления/);
    expect(lease).toMatch(/карти\/чипа/);
    expect(lease).toMatch(/вътрешният ред на сградата\/паркинга/);
    expect(lease).toMatch(/\[РЕГ\.НОМЕР\]/);
  });

  it("не обещава охрана или застраховка на автомобила", () => {
    expect(lease).toMatch(/не представлява договор за пазене, охрана или застраховка/);
    expect(lease).toMatch(/не гарантира сигурността/);
    expect(lease).toMatch(/не изключва и не ограничава отговорност, която по закон не може/);
  });

  it("възпроизвежда точно трите хипотези по чл. 237 ЗЗД", () => {
    expect(lease).toMatch(/чл\. 237 от ЗЗД/);
    expect(lease).toMatch(/вписан, той остава в сила спрямо приобретателя/);
    expect(lease).toMatch(/не повече от една година от прехвърлянето/);
    expect(lease).toMatch(/като договор за наем без определен срок/);
    expect(lease).toMatch(/лишен от ползването на имота преди изтичане на срока поради прехвърлянето/);
    expect(lease).not.toMatch(/приобретателят не е обвързан от него/);
  });

  it("не отъждествява достоверната дата с нотариална заверка", () => {
    expect(lease).not.toMatch(/достоверна дата[^.]{0,80}нотариал/i);
  });

  it("остава използваем и в EUR", () => {
    expect(lease).toMatch(/\[СУМА В EUR\] EUR/);
    expect(lease).toMatch(/НАЕМОДАТЕЛ:/);
    expect(lease).toMatch(/НАЕМАТЕЛ:/);
  });
});

describe("предизвестие по чл. 326, ал. 1 КТ", () => {
  it("е предизвестие, не молба за съгласие", () => {
    expect(notice.startsWith(
      "ПРЕДИЗВЕСТИЕ ЗА ПРЕКРАТЯВАНЕ НА ТРУДОВ ДОГОВОР ПО ЧЛ. 326, АЛ. 1 КТ",
    )).toBe(true);
    expect(notice).not.toMatch(/Моля да приемете/);
    expect(notice).not.toMatch(/МОЛБА ЗА НАПУСКАНЕ/);
    expect(notice).not.toMatch(/който заема длъжността/);
  });

  it("посочва началото и последицата на срока", () => {
    expect(notice).toMatch(/чл\. 326, ал\. 4/);
    expect(notice).toMatch(/от деня, следващ получаването/);
    expect(notice).toMatch(/чл\. 335, ал\. 2, т\. 1/);
    expect(notice).toMatch(/подлежи на преизчисляване според действителната дата на получаване/);
  });

  it("минимизира личните данни", () => {
    expect(notice).not.toMatch(/ЛК №/);
    expect(notice).not.toMatch(/ИЗДАВАЩ ОРГАН/);
    expect(notice).not.toMatch(/Копие от лична карта/);
    expect(notice).toMatch(/ЕГН\/ЛНЧ ИЛИ ПЕРСОНАЛЕН НОМЕР/);
  });

  it("иска дължимите документи без остарели универсални искания", () => {
    expect(notice).not.toMatch(/УП-2/);
    expect(notice).not.toMatch(/УП-3/);
    expect(notice).not.toMatch(/да ми бъде издадена трудова книжка/);
    expect(notice).not.toMatch(/трудовата книжка да ми бъде върната с надлежно отразено прекратяване/);
    expect(notice).toMatch(/Регистъра на заетостта/);
    expect(notice).toMatch(/удостоверява прекратяването на трудовото правоотношение/);
    expect(notice).toMatch(/\[По избор,[^\]]*01\.06\.2025/);
    expect(notice).toMatch(/§ 24, ал\. 1/);
    expect(notice).toMatch(/трудовия стаж към 01\.06\.2025 г\./);
    expect(notice).toMatch(/върната незабавно/);
  });

  it("иска обезщетението по чл. 224 без условие за взаимно съгласие", () => {
    expect(notice).toMatch(/чл\. 224/);
    expect(notice).not.toMatch(/по взаимно съгласие, преди изтичане на срока/);
  });

  it("има блок за удостоверяване на получаването", () => {
    expect(notice).toMatch(/УДОСТОВЕРЯВАНЕ НА ПОЛУЧАВАНЕТО ОТ РАБОТОДАТЕЛЯ/);
    expect(notice).toMatch(/Входящ номер/);
    expect(notice).toMatch(/Име и длъжност на получателя/);
    expect(notice).toMatch(/само получаването, а не приемане или одобрение/);
  });
});

describe("UI и резолвер (инварианти)", () => {
  it("точен етикет и първа доказателствена точка", () => {
    const intent = getSeoTemplateIntent("molba-za-napuskane-chl-326-al-1-kt");
    expect(intent?.primaryLabel).toBe("Подготви предизвестието");
    expect(intent?.proofPoints[0]).toBe("Дата на получаване и срок на предизвестието");
  });

  it("другите два slug-а запазват етикетите си", () => {
    expect(getSeoTemplateIntent("priemo-predavatelen-protokol")?.primaryLabel)
      .toBe("Попълни протокола");
    expect(getSeoTemplateIntent("dogovor-za-naem-na-parkomyasto-garazh")?.primaryLabel)
      .toBe("Изготви договора");
  });

  it("slug → бланка остава непроменен", async () => {
    // Каноничните ключове на бланките са ASCII и непроменени.
    expect(hasTemplateDraft("molba-za-napuskane")).toBe(true);
    expect(hasTemplateDraft("priemo-predavatelen-protokol")).toBe(true);
    expect(hasTemplateDraft("dogovor-za-naem-na-parkomyasto-garazh")).toBe(true);
    await expect(loadBySlug("molba-za-napuskane")!).resolves.toBe(notice);
    await expect(loadBySlug("priemo-predavatelen-protokol")!).resolves.toBe(protocol);
    await expect(loadBySlug("dogovor-za-naem-na-parkomyasto-garazh")!).resolves.toBe(lease);
  });

  it("имената от каталога водят до същите бланки", async () => {
    await expect(loadTemplateDraft("Молба за напускане")).resolves.toBe(notice);
    await expect(loadTemplateDraft("Приемно-предавателен протокол")).resolves.toBe(protocol);
    await expect(loadTemplateDraft("Договор за наем на паркомясто/гараж")).resolves.toBe(lease);
  });
});
