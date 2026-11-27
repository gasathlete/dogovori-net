// Общ набор случаи за метаданните. Използва се от тестовете на edge функцията И
// (огледално копиран) от фронтенд тестовете, за да се доказва, че двата
// валидатора решават еднакво.

export interface VerificationFixture {
  name: string;
  value: unknown;
  valid: boolean;
}

const counts = (over: Record<string, number> = {}) => ({
  issues_raw: 1,
  issues_kept: 1,
  issues_rejected: 0,
  missing_raw: 0,
  missing_kept: 0,
  missing_rejected: 0,
  ...over,
});

export const VERIFICATION_FIXTURES: VerificationFixture[] = [
  {
    name: "валиден evidence_checked",
    value: { version: 1, status: "evidence_checked", reason_codes: [], counts: counts(), score_trusted: true },
    valid: true,
  },
  {
    name: "валиден incomplete",
    value: {
      version: 1,
      status: "incomplete",
      reason_codes: ["quote_unverified"],
      counts: counts({ issues_raw: 2, issues_kept: 1, issues_rejected: 1 }),
      score_trusted: false,
    },
    valid: true,
  },
  {
    name: "липсват counts и reason_codes (валидаторът НЕ пада отворен)",
    value: { version: 1, status: "evidence_checked", score_trusted: true },
    valid: false,
  },
  {
    name: "противоречие: evidence_checked с код и отхвърлени",
    value: {
      version: 1,
      status: "evidence_checked",
      reason_codes: ["quote_unverified"],
      counts: counts({ issues_raw: 2, issues_kept: 1, issues_rejected: 1 }),
      score_trusted: true,
    },
    valid: false,
  },
  {
    name: "противоречие: incomplete без кодове",
    value: { version: 1, status: "incomplete", reason_codes: [], counts: counts(), score_trusted: false },
    valid: false,
  },
  {
    name: "противоречие: incomplete с доверена оценка",
    value: {
      version: 1,
      status: "incomplete",
      reason_codes: ["input_truncated"],
      counts: counts(),
      score_trusted: true,
    },
    valid: false,
  },
  {
    name: "невъзможни сборове",
    value: {
      version: 1,
      status: "evidence_checked",
      reason_codes: [],
      counts: counts({ issues_raw: 5 }),
      score_trusted: true,
    },
    valid: false,
  },
  {
    name: "дробен брой",
    value: {
      version: 1,
      status: "evidence_checked",
      reason_codes: [],
      counts: counts({ issues_kept: 0.5, issues_rejected: 0.5 }),
      score_trusted: true,
    },
    valid: false,
  },
  {
    name: "NaN брой",
    value: {
      version: 1,
      status: "evidence_checked",
      reason_codes: [],
      counts: counts({ issues_raw: NaN }),
      score_trusted: true,
    },
    valid: false,
  },
  {
    name: "Infinity брой",
    value: {
      version: 1,
      status: "evidence_checked",
      reason_codes: [],
      counts: counts({ issues_raw: Infinity }),
      score_trusted: true,
    },
    valid: false,
  },
  {
    name: "отрицателен брой",
    value: {
      version: 1,
      status: "incomplete",
      reason_codes: ["issue_malformed"],
      counts: counts({ issues_raw: -1, issues_kept: 0, issues_rejected: -1 }),
      score_trusted: false,
    },
    valid: false,
  },
  {
    name: "липсващо поле в counts",
    value: {
      version: 1,
      status: "evidence_checked",
      reason_codes: [],
      counts: { issues_raw: 0, issues_kept: 0, issues_rejected: 0, missing_raw: 0, missing_kept: 0 },
      score_trusted: true,
    },
    valid: false,
  },
  {
    name: "непознат код",
    value: {
      version: 1,
      status: "incomplete",
      reason_codes: ["some_new_code"],
      counts: counts(),
      score_trusted: false,
    },
    valid: false,
  },
  {
    name: "дублиран код",
    value: {
      version: 1,
      status: "incomplete",
      reason_codes: ["input_truncated", "input_truncated"],
      counts: counts(),
      score_trusted: false,
    },
    valid: false,
  },
  {
    name: "нестрингов код",
    value: { version: 1, status: "incomplete", reason_codes: [7], counts: counts(), score_trusted: false },
    valid: false,
  },
  {
    name: "непозната версия",
    value: { version: 2, status: "evidence_checked", reason_codes: [], counts: counts(), score_trusted: true },
    valid: false,
  },
  {
    name: "непознат статус",
    value: { version: 1, status: "ok", reason_codes: [], counts: counts(), score_trusted: true },
    valid: false,
  },
  {
    name: "score_trusted не е булево",
    value: { version: 1, status: "evidence_checked", reason_codes: [], counts: counts(), score_trusted: "true" },
    valid: false,
  },
  { name: "масив вместо обект", value: [], valid: false },
  { name: "число", value: 1, valid: false },
  { name: "низ", value: "evidence_checked", valid: false },
  { name: "празен обект", value: {}, valid: false },
];
