// Per-endpoint and per-minute breakdown of a k6 run: node analyze.mjs <file.csv.gz>
// (from `k6 run --out csv=<file.csv.gz>`). Status 0 is a request that got no answer.
import { createReadStream } from "node:fs";
import readline from "node:readline";
import { createGunzip } from "node:zlib";

const file = process.argv[2];
if (!file) throw new Error("usage: node analyze.mjs <file.csv.gz>");
const rl = readline.createInterface({ input: createReadStream(file).pipe(createGunzip()) });

let head;
let t0;
const durations = {};
const statuses = {};
const minutes = {};
for await (const line of rl) {
  const c = line.split(",");
  if (!head) {
    head = Object.fromEntries(c.map((h, i) => [h, i]));
    continue;
  }
  if (c[head.metric_name] !== "http_req_duration") continue;
  const name = (c[head.name] || "?").replace(/^https?:\/\/[^/]+/, "");
  const ms = +c[head.metric_value];
  const status = c[head.status];
  const t = +c[head.timestamp];
  t0 ??= t;
  (durations[name] ??= []).push(ms);
  (statuses[name] ??= {})[status] = (statuses[name][status] ?? 0) + 1;
  const minute = (minutes[Math.floor((t - t0) / 60)] ??= { n: 0, bad: 0, ms: [] });
  minute.n++;
  minute.ms.push(ms);
  if (status !== "200") minute.bad++;
}

const pct = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]);
};
const col = (v, w = 7) => String(v).padStart(w);

console.log("endpoint".padEnd(24), col("n", 6), col("p50"), col("p95"), col("p99"), col("max"), " status");
for (const [name, values] of Object.entries(durations)) {
  console.log(name.padEnd(24), col(values.length, 6), ...[0.5, 0.95, 0.99, 1].map((p) => col(pct(values, p))), " ", JSON.stringify(statuses[name]));
}
console.log("\nminute   reqs  req/s    p50    p95  not 200");
for (const [m, s] of Object.entries(minutes)) {
  console.log(col(m, 6), col(s.n, 6), col((s.n / 60).toFixed(1), 6), col(pct(s.ms, 0.5), 6), col(pct(s.ms, 0.95), 6), col(s.bad, 8));
}
