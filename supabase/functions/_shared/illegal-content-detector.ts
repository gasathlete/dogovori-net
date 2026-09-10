// ЧИСТ лист-модул: детерминистично разпознаване на незаконно съдържание.
//
// Тук НЯМА база, поща, npm пакети, мрежа и Deno API. Затова модулът може да се
// внесе от всеки път — включително от проверката за допустимост ПРЕДИ плащане —
// без да влачи зависимости и без динамични/скрити внасяния.
//
// Поведението е точно същото, което `illegal-content.ts` е ползвал досега:
// агресивна нормализация (малки букви, без диакритика, латиница→кирилица,
// цифрови замени като „у6ийство“) и точно съвпадение по цяла дума/фраза.

export type IllegalCategory =
  | "violence"
  | "sexual_minors"
  | "human_trafficking"
  | "drugs"
  | "weapons"
  | "fraud"
  | "terrorism";

interface CategoryDef {
  category: IllegalCategory;
  label: string;
  phrases: string[];
}

const CATEGORIES: CategoryDef[] = [
  {
    category: "violence",
    label: "Насилие срещу личността",
    phrases: [
      "убииство", "убии", "убиваи", "убием", "убият", "убиине",
      "поръчково убииство", "поръчителство за убииство",
      "ликвидираи", "ликвидация на лице", "ликвидация на човек",
      "екзекуция на", "екзекутираи",
      "отвличане", "отвлеки", "държане в плен", "държане като заложник",
      "побои", "побииване", "телесна повреда срещу",
      "заплаха за убииство", "заплаха със смърт", "заплаха с убииство",
      "хитман", "наемен убиец", "наемен убииец",
      "поръчка за убииство", "поръчам убииство",
      "kill contract", "murder contract", "hit man", "hitman contract",
    ],
  },
  {
    category: "sexual_minors",
    label: "Сексуална експлоатация / непълнолетни",
    phrases: [
      "детска порнография", "детско порно", "csam",
      "сексуални услуги с непълнолетен", "секс с непълнолетен",
      "сексуална експлоатация на дете", "експлоатация на непълнолетно",
      "проституция на непълнолетна", "проституция на непълнолетен",
      "child porn", "child pornography", "underage sex",
    ],
  },
  {
    category: "human_trafficking",
    label: "Трафик на хора / органи",
    phrases: [
      "трафик на хора", "трафик на жени", "трафик на деца",
      "продажба на човек", "купуване на човек", "купя човек",
      "продажба на дете", "купя дете", "продам дете",
      "трафик на органи", "продажба на органи", "купуване на органи",
      "купя бъбрек", "продам бъбрек", "продам черен дроб",
      "human trafficking", "organ trafficking",
    ],
  },
  {
    category: "drugs",
    label: "Наркотици и забранени вещества",
    phrases: [
      "разпространение на наркотици", "пласиране на наркотици",
      "продажба на кокаин", "продажба на хероин", "продажба на метамфетамин",
      "продажба на амфетамин", "продажба на марихуана", "продажба на канабис",
      "доставка на кокаин", "доставка на хероин",
      "наркотрафик", "трафик на наркотици",
      "drug dealing", "drug trafficking", "cocaine sale", "heroin sale",
    ],
  },
  {
    category: "weapons",
    label: "Незаконни оръжия и експлозиви",
    phrases: [
      "незаконна продажба на оръжие", "продажба на нелегално оръжие",
      "доставка на оръжие без разрешително", "контрабанда на оръжие",
      "незаконна търговия с оръжие",
      "изработка на бомба", "направа на бомба", "сглобяване на бомба",
      "изработка на експлозив", "направа на експлозив",
      "ied", "self-made explosive",
    ],
  },
  {
    category: "fraud",
    label: "Измама / пране на пари / подкуп",
    phrases: [
      "пране на пари", "изпиране на пари",
      "укриване на данъци чрез", "схема за укриване на данъци",
      "фалшива фактура за", "издаване на фалшиви фактури",
      "поръчков подкуп", "договор за подкуп",
      "корупционна схема", "схема за измама",
      "пирамидална схема", "понци схема",
      "money laundering", "bribery contract",
    ],
  },
  {
    category: "terrorism",
    label: "Тероризъм",
    phrases: [
      "терористичен акт", "тероризъм", "финансиране на тероризъм",
      "вербуване на терористи", "обучение на терористи",
      "atентат срещу", "атентат срещу",
      "terrorist attack", "terror financing",
    ],
  },
];

// --- Normalization ------------------------------------------------------

const LATIN_TO_CYR: Record<string, string> = {
  a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", z: "з", i: "и",
  k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", r: "р", s: "с",
  t: "т", u: "у", f: "ф", h: "х", c: "ц", y: "и", j: "й",
};

const LATIN_BIGRAMS: Array<[RegExp, string]> = [
  [/zh/g, "ж"], [/ch/g, "ч"], [/sh/g, "ш"], [/sht/g, "щ"],
  [/yu/g, "ю"], [/ya/g, "я"], [/ts/g, "ц"], [/kh/g, "х"],
];

const DIGIT_SUBS: Record<string, string> = {
  "0": "о", "1": "и", "3": "е", "4": "ч", "5": "с", "6": "б", "7": "т", "8": "в", "9": "д",
  "@": "а", "$": "с",
};

function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeForIllegalContent(input: string): string {
  let s = (input ?? "").toLowerCase();
  s = stripDiacritics(s);
  s = s.replace(/[0134567890@$]/g, (c) => DIGIT_SUBS[c] ?? c);
  for (const [re, rep] of LATIN_BIGRAMS) s = s.replace(re, rep);
  s = s.replace(/[a-z]/g, (c) => LATIN_TO_CYR[c] ?? c);
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export interface DetectionResult {
  blocked: boolean;
  category?: IllegalCategory;
  categoryLabel?: string;
  // Internal only — never persisted, never returned to client.
  _internalMatchedTerm?: string;
}

export function detectIllegalContent(text: string): DetectionResult {
  if (!text || text.length < 3) return { blocked: false };
  const norm = " " + normalizeForIllegalContent(text) + " ";
  for (const cat of CATEGORIES) {
    for (const phrase of cat.phrases) {
      if (norm.includes(" " + phrase + " ")) {
        return {
          blocked: true,
          category: cat.category,
          categoryLabel: cat.label,
          _internalMatchedTerm: phrase,
        };
      }
    }
  }
  return { blocked: false };
}

export const BLOCKED_USER_MESSAGE =
  "Това искане е блокирано. Платформата не генерира и не анализира документи с незаконно съдържание " +
  "(насилие, експлоатация на хора, наркотици, незаконни оръжия, измама, тероризъм). " +
  "Опитът е регистриран. " +
  "При повторни опити акаунтът може да бъде ограничен. " +
  "Ако смятате, че това е грешка — свържете се с екипа.";
