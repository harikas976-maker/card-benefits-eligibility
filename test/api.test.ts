import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Fastify from 'fastify';
import { buildApi } from '../src/api';
import { createAuditStore } from '../src/audit';
import { mapDecision } from '../src/eligibility';
import { buildStubs } from '../src/stubs';

const headers = { authorization: 'Bearer local-alice' };
const url = '/api/v1/eligibility/check';

test('maps decisions from card and benefit eligibility', () => {
  assert.deepEqual(mapDecision('synthetic-account-01', true), { eligible: true, reasonCode: 'ELIGIBLE' });
  assert.equal(mapDecision(null, true).reasonCode, 'NO_ELIGIBLE_CARD');
  assert.equal(mapDecision('synthetic-account-01', false).reasonCode, 'BENEFIT_UNAVAILABLE');
});

test('checks authenticated eligibility and writes only the minimum audit fields', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'eligibility-audit-'));
  const stubs = buildStubs();
  const baseUrl = await stubs.listen({ port: 0, host: '127.0.0.1' });
  const api = buildApi({ profileUrl: baseUrl, rulesUrl: baseUrl, writeAudit: await createAuditStore(directory) });
  t.after(async () => {
    await api.close();
    await stubs.close();
    await rm(directory, { recursive: true, force: true });
  });

  const send = (payload: object, authorization?: string) =>
    api.inject({ method: 'POST', url, payload, headers: authorization ? { authorization } : {} });

  assert.equal((await api.inject('/health')).statusCode, 200);
  assert.equal((await send({ benefitCode: 'LOUNGE' })).statusCode, 401);
  assert.equal((await send({ benefitCode: 'lounge' }, headers.authorization)).statusCode, 400);
  assert.equal((await send({ benefitCode: 'LOUNGE', customerId: 'customer-alice' }, 'Bearer local-bob')).statusCode, 403);
  assert.deepEqual(await readdir(directory), []);

  const response = await send({ benefitCode: 'LOUNGE' }, headers.authorization);
  assert.equal(response.statusCode, 200);
  const decision = response.json();
  assert.deepEqual(decision, { eligible: true, reasonCode: 'ELIGIBLE', correlationId: decision.correlationId });
  assert.match(decision.correlationId, /^[a-f0-9-]{36}$/);
  const files = await readdir(directory);
  assert.equal(files.length, 1);
  const entry = JSON.parse(await readFile(join(directory, files[0]!), 'utf8'));
  assert.deepEqual(entry, {
    decisionId: entry.decisionId, timestamp: entry.timestamp, subject: 'customer-alice',
    benefitCode: 'LOUNGE', reasonCode: 'ELIGIBLE', correlationId: decision.correlationId,
  });
  assert.equal((await send({ benefitCode: 'LOUNGE' }, 'Bearer local-bob')).json().reasonCode, 'NO_ELIGIBLE_CARD');
});

test('retries transient failures once, skips permanent failures, and hides downstream errors', async t => {
  const stubs = Fastify();
  let attempts = 0;
  let status = 503;
  stubs.get('/profiles/:subject', async (_request, reply) => {
    attempts++;
    return reply.code(status).send({ error: 'private dependency detail' });
  });
  stubs.get('/rules/:code', async () => ({ enabled: true }));
  const baseUrl = await stubs.listen({ port: 0, host: '127.0.0.1' });
  let audits = 0;
  const api = buildApi({ profileUrl: baseUrl, rulesUrl: baseUrl, writeAudit: async () => { audits++; } });
  t.after(async () => {
    await api.close();
    await stubs.close();
  });
  for (const [failure, expectedAttempts] of [[503, 2], [401, 1]] as const) {
    status = failure;
    attempts = 0;
    const response = await api.inject({ method: 'POST', url, headers, payload: { benefitCode: 'LOUNGE' } });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { code: 'DEPENDENCY_UNAVAILABLE', correlationId: response.json().correlationId });
    assert.equal(attempts, expectedAttempts);
  }
  assert.equal(audits, 0);
});
