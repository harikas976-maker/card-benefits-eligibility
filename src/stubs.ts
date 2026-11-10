import Fastify from 'fastify';

export function buildStubs() {
  const stubs = Fastify();
  stubs.get<{ Params: { subject: string } }>('/profiles/:subject', async request => ({
    accountRef: request.params.subject === 'customer-alice' ? 'synthetic-account-01' : null,
  }));
  stubs.get<{ Params: { code: string } }>('/rules/:code', async request => ({
    enabled: request.params.code === 'LOUNGE',
  }));
  return stubs;
}
