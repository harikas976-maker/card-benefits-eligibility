import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { AuditEntry } from './audit';
import { mapDecision } from './eligibility';
import { createProfileClient } from './profile-client';
import { canCheckCustomer, isEligibilityRequest } from './request-policy';
import { createRulesClient } from './rules-client';

export const testIdentities = new Map([
  ['Bearer local-alice', 'customer-alice'],
  ['Bearer local-bob', 'customer-bob'],
]);

interface Options {
  profileUrl: string;
  rulesUrl: string;
  writeAudit: (entry: AuditEntry) => Promise<void>;
}

export function buildApi(options: Options) {
  const api = Fastify({ requestIdHeader: false, genReqId: () => randomUUID(), bodyLimit: 2048 });
  const loadProfile = createProfileClient(options.profileUrl);
  const loadRule = createRulesClient(options.rulesUrl);
  let activeChecks = 0;

  api.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: number } | null)?.statusCode ?? 500;
    const code = status === 413 ? 'PAYLOAD_TOO_LARGE'
      : status === 415 ? 'UNSUPPORTED_MEDIA_TYPE'
      : status < 500 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR';
    return reply.code(status).send({ code, correlationId: request.id });
  });
  api.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({ code: 'NOT_FOUND', correlationId: request.id });
  });
  api.get('/health', async () => ({ status: 'ok' }));

  api.post('/api/v1/eligibility/check', {
    onRequest: async (request, reply) => {
      if (!testIdentities.has(request.headers.authorization ?? '')) {
        return reply.header('WWW-Authenticate', 'Bearer').code(401)
          .send({ code: 'UNAUTHENTICATED', correlationId: request.id });
      }
    },
  }, async (request, reply) => {
    const subject = testIdentities.get(request.headers.authorization ?? '')!;
    const correlationId = request.id;
    if (!isEligibilityRequest(request.body)) {
      return reply.code(400).send({ code: 'INVALID_REQUEST', correlationId });
    }
    const { benefitCode, customerId } = request.body;
    if (!canCheckCustomer(subject, customerId)) {
      return reply.code(403).send({ code: 'FORBIDDEN', correlationId });
    }
    if (activeChecks >= 32) {
      return reply.code(503).send({ code: 'SERVICE_BUSY', correlationId });
    }

    activeChecks++;
    try {
      const [profile, rule] = await Promise.allSettled([
        loadProfile(subject),
        loadRule(benefitCode),
      ]);
      if (profile.status !== 'fulfilled' || rule.status !== 'fulfilled') {
        return reply.code(503).send({ code: 'DEPENDENCY_UNAVAILABLE', correlationId });
      }
      const decision = mapDecision(profile.value, rule.value);
      try {
        await options.writeAudit({
          decisionId: randomUUID(), timestamp: new Date().toISOString(),
          subject, benefitCode, reasonCode: decision.reasonCode, correlationId,
        });
      } catch {
        return reply.code(503).send({ code: 'AUDIT_UNAVAILABLE', correlationId });
      }
      return { ...decision, correlationId };
    } finally {
      activeChecks--;
    }
  });

  return api;
}
