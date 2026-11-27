// Anonymous browse simulation. Hits public routes with no auth.
// Run: k6 run scripts/loadtest/browse.k6.js
import http from "k6/http";
import { check, sleep, group } from "k6";

const BASE = __ENV.BASE_URL || "https://dogovori.net";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m", target: 50 },
    { duration: "2m", target: 50 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{route:home}": ["p(95)<1200"],
    "http_req_duration{route:catalog}": ["p(95)<1500"],
  },
};

const PATHS = [
  ["/", "home"],
  ["/catalog", "catalog"],
  ["/sektor/finance", "sector"],
  ["/sektor/nedvijimi-imoti", "sector"],
  ["/blog", "blog"],
  ["/plans", "plans"],
];

export default function () {
  for (const [path, tag] of PATHS) {
    group(`GET ${path}`, () => {
      const res = http.get(`${BASE}${path}`, { tags: { route: tag, group: "browse" } });
      check(res, { "status 200": (r) => r.status === 200 });
    });
    sleep(Math.random() * 2 + 1);
  }
}
