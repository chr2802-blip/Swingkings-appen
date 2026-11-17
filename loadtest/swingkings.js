// k6 load test: SCENARIO=baseline|load|stress|spike k6 run loadtest/swingkings.js
// Each virtual user is a logged-in player opening the app: the front page (marking the feed
// seen), activities, the fine box and the chat with its unread count and a picture.
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE = __ENV.BASE_URL || "https://swingkings-appen.vercel.app";
const accounts = JSON.parse(open("./accounts.json"));
const failures = new Rate("page_failures");

const SCENARIOS = {
  baseline: { executor: "constant-vus", vus: 1, duration: "2m" },
  load: { executor: "ramping-vus", startVUs: 0, stages: [
    { duration: "2m", target: 50 }, { duration: "5m", target: 50 }, { duration: "1m", target: 0 }] },
  stress: { executor: "ramping-vus", startVUs: 0, stages: [
    { duration: "1m", target: 50 }, { duration: "2m", target: 50 },
    { duration: "1m", target: 100 }, { duration: "2m", target: 100 },
    { duration: "1m", target: 150 }, { duration: "2m", target: 150 },
    { duration: "1m", target: 200 }, { duration: "2m", target: 200 },
    { duration: "1m", target: 0 }] },
  spike: { executor: "ramping-vus", startVUs: 0, stages: [
    { duration: "30s", target: 5 }, { duration: "1m", target: 5 },
    { duration: "10s", target: 250 }, { duration: "2m", target: 250 },
    { duration: "10s", target: 5 }, { duration: "1m", target: 5 }] },
};
const scenario = __ENV.SCENARIO || "baseline";

export const options = {
  scenarios: { [scenario]: SCENARIOS[scenario] },
  thresholds: {
    // Stop a run that has clearly broken the app, so it does not use up the free plans.
    page_failures: [{ threshold: "rate<0.25", abortOnFail: true, delayAbortEval: "1m" }],
    "http_req_duration{kind:page}": ["p(95)<3000"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

/** A server action's id changes with every build: read it from the client chunks the front page loads. */
function actionId(cookie, name) {
  const page = http.get(`${BASE}/oversigt`, { headers: { cookie } }).body;
  const chunks = [...new Set(page.match(/\/_next\/static\/chunks\/[^"]+\.js/g) || [])];
  for (const chunk of chunks) {
    const m = new RegExp(`"([0-9a-f]{40,})"[^)]*?"${name}"\\)`).exec(http.get(`${BASE}${chunk}`).body);
    if (m) return m[1];
  }
  throw new Error(`no server action ${name} on /oversigt`);
}

export function setup() {
  const { cookie } = accounts[0];
  const chat = http.get(`${BASE}/chat`, { headers: { cookie } }).body;
  return { photos: [...new Set(chat.match(/\/api\/photos\/[a-z0-9]+/g) || [])], markFeedSeen: actionId(cookie, "markFeedSeen") };
}

function page(path, cookie, name) {
  const res = http.get(`${BASE}${path}`, { headers: { cookie }, redirects: 0, tags: { name, kind: "page" } });
  failures.add(!check(res, { [`${name} 200`]: (r) => r.status === 200 }));
}

export default function openTheApp(data) {
  const { cookie } = accounts[(__VU - 1) % accounts.length];
  const think = () => sleep(1 + Math.random() * 3);

  group("open app", () => {
    page("/oversigt", cookie, "oversigt");
    http.post(`${BASE}/oversigt`, "[]", {
      headers: { cookie, "Next-Action": data.markFeedSeen, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
      tags: { name: "action:markFeedSeen", kind: "action" },
    });
  });
  think();
  page("/aktiviteter", cookie, "aktiviteter");
  think();
  page("/boder", cookie, "boder");
  think();
  group("chat", () => {
    page("/chat", cookie, "chat");
    http.get(`${BASE}/api/chat/unread`, { headers: { cookie }, tags: { name: "api:unread", kind: "api" } });
    if (data.photos.length) {
      const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
      http.get(`${BASE}${photo}`, { headers: { cookie }, tags: { name: "api:photo", kind: "photo" } });
    }
  });
  think();
}
