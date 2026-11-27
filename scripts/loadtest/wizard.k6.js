// Authenticated wizard flow. Signs in with TEST_EMAIL/TEST_PASSWORD, hits the
// generate-contract edge function, and downloads the resulting document.
// Run: k6 run scripts/loadtest/wizard.k6.js
import http from "k6/http";
import { check, sleep, group } from "k6";

const BASE = __ENV.BASE_URL || "https://dogovori.net";
const SUPA_URL = __ENV.SUPABASE_URL;
const SUPA_KEY = __ENV.SUPABASE_ANON_KEY;
const EMAIL = __ENV.TEST_EMAIL;
const PASSWORD = __ENV.TEST_PASSWORD;

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "2m", target: 30 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.02"],
    "http_req_duration{group:generate}": ["p(95)<8000"],
  },
};

function signIn() {
  const res = http.post(
    `${SUPA_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { "content-type": "application/json", apikey: SUPA_KEY } },
  );
  check(res, { "auth 200": (r) => r.status === 200 });
  return res.json("access_token");
}

export function setup() {
  if (!SUPA_URL || !SUPA_KEY || !EMAIL || !PASSWORD) {
    throw new Error("Set SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD env vars.");
  }
  return { token: signIn() };
}

export default function (data) {
  const auth = {
    "content-type": "application/json",
    apikey: SUPA_KEY,
    Authorization: `Bearer ${data.token}`,
  };

  group("wizard-open", () => {
    const res = http.get(`${BASE}/wizard/finance?doc=dogovor-za-zaem`, { tags: { group: "browse" } });
    check(res, { "wizard 200": (r) => r.status === 200 });
  });
  sleep(2);

  group("generate", () => {
    const body = JSON.stringify({
      sectorId: "finance",
      contractType: "Договор за заем",
      answers: {
        party_a_type: "ФЛ",
        party_b_type: "ФЛ",
        amount: "1000",
        currency: "EUR",
        duration_months: "12",
      },
    });
    const res = http.post(`${SUPA_URL}/functions/v1/generate-contract`, body, {
      headers: auth,
      tags: { group: "generate" },
    });
    check(res, {
      "generate ok": (r) => r.status === 200 || r.status === 402 || r.status === 429,
    });
  });
  sleep(3);
}
