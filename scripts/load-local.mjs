import { loadEnvFile } from "node:process";

try { loadEnvFile(".env.local"); } catch { }
const base = process.env.LOAD_BASE_URL || process.env.APP_BASE_URL;
if (!base) throw new Error("APP_BASE_URL wajib diatur.");
const target = new URL(base);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw new Error("Load test hanya menerima origin loopback.");
const total = 200;
const concurrency = 20;
const timings = [];
let index = 0;
async function worker() {
  while (index < total) {
    index++;
    const started = performance.now();
    const response = await fetch(new URL("/api/v1/properties?limit=24", target));
    await response.arrayBuffer();
    if (response.status !== 200) throw new Error("Public catalog returned " + response.status);
    timings.push(performance.now() - started);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
timings.sort((left, right) => left - right);
const percentile = (p) => timings[Math.ceil(timings.length * p) - 1];
console.log(JSON.stringify({ requests: total, concurrency, p50Ms: Math.round(percentile(0.5)), p95Ms: Math.round(percentile(0.95)), maxMs: Math.round(timings.at(-1)) }));
