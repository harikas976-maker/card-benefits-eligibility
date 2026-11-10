import { performance } from 'node:perf_hooks';

const count = Number(process.argv[2] ?? 200);
const concurrency = Number(process.argv[3] ?? 8);
if (![count, concurrency].every(value => Number.isSafeInteger(value) && value > 0)) {
  throw new Error('Provide positive integer request and concurrency counts.');
}

let next = 0;
let errors = 0;
const latencies = [];
const started = performance.now();
await Promise.all(Array.from({ length: Math.min(count, concurrency) }, async () => {
  while (next < count) {
    next++;
    const start = performance.now();
    try {
      const response = await fetch('http://127.0.0.1:3000/api/v1/eligibility/check', {
        method: 'POST',
        headers: { authorization: 'Bearer local-alice', 'content-type': 'application/json' },
        body: JSON.stringify({ benefitCode: 'LOUNGE' }),
        signal: AbortSignal.timeout(3000),
      });
      await response.arrayBuffer();
      if (!response.ok) errors++;
    } catch {
      errors++;
    } finally {
      latencies.push(performance.now() - start);
    }
  }
}));
latencies.sort((a, b) => a - b);
const percentile = fraction => Math.round(latencies[Math.ceil(fraction * count) - 1]);
console.log({
  count, concurrency, errors, errorRate: errors / count,
  p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
  requestsPerSecond: Math.round(count * 1000 / (performance.now() - started)),
});
