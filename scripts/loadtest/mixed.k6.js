// Mixed 50-VU simulation: 70% browse, 20% wizard-open, 10% assistant chat.
// Run: k6 run --summary-export=reports/loadtest-$(date +%s).json scripts/loadtest/mixed.k6.js
import http from "k6/http";
import { check, sleep, group } from "k6";

const BASE = __ENV.BASE_URL || "https://dogovori.net";
const SUPA_URL = __ENV.SUPABASE_URL;
const SUPA_KEY = __ENV.SUPABASE_ANON_KEY;

export const options = {
  scenarios: {
    browse: {
      executor: "ramping-vus",
      exec: "browseVU",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 35 },
        { duration: "3m", target: 35 },
        { duration: "30s", target: 70 },
        { duration: "30s", target: 0 },
      ],
    },
    wizard: {
      executor: "ramping-vus",
      exec: "wizardVU",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 10 },
        { duration: "3m", target: 10 },
        { duration: "30s", target: 20 },
        { duration: "30s", target: 0 },
      ],
    },
    assistant: {
      executor: "ramping-vus",
      exec: "assistantVU",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 5 },
        { duration: "3m", target: 5 },
        { duration: "30s", target: 10 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{group:browse}": ["p(95)<1500"],
    "http_req_duration{group:assistant}": ["p(95)<6000"],
  },
};

const ROUTES = ["/", "/catalog", "/sektor/finance", "/sektor/nedvijimi-imoti", "/blog", "/plans"];

export function browseVU() {
  const path = ROUTES[Math.floor(Math.random() * ROUTES.length)];
  group(`GET ${path}`, () => {
    const res = http.get(`${BASE}${path}`, { tags: { group: "browse" } });
    check(res, { "200": (r) => r.status === 200 });
  });
  sleep(Math.random() * 3 + 1);
}

export function wizardVU() {
  group("wizard open", () => {
    const res = http.get(`${BASE}/wizard/finance?doc=dogovor-za-zaem`, { tags: { group: "browse" } });
    check(res, { "200": (r) => r.status === 200 });
  });
  sleep(Math.random() * 4 + 2);
}

export function assistantVU() {
  if (!SUPA_URL || !SUPA_KEY) return;
  group("assistant anon", () => {
    const res = http.post(
      `${SUPA_URL}/functions/v1/assistant-chat-anon`,
      JSON.stringify({ messages: [{ role: "user", content: "Какъв договор ми трябва за наем на офис?" }] }),
      { headers: { "content-type": "application/json", apikey: SUPA_KEY }, tags: { group: "assistant" } },
    );
    check(res, { "ok": (r) => r.status === 200 || r.status === 429 });
  });
  sleep(Math.random() * 5 + 3);
}
