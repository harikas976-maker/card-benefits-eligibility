import { buildApi } from './api';
import { createAuditStore } from './audit';
import { buildStubs } from './stubs';

async function main() {
  const writeAudit = await createAuditStore(process.env.AUDIT_DIR ?? '.audit');
  const stubs = buildStubs();
  const stubUrl = await stubs.listen({ host: '127.0.0.1', port: 0 });
  const api = buildApi({ profileUrl: stubUrl, rulesUrl: stubUrl, writeAudit });
  try {
    const address = await api.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 3000) });
    console.log('Eligibility API listening at ' + address);
  } catch (error) {
    await stubs.close();
    throw error;
  }

  const close = async () => {
    await api.close();
    await stubs.close();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

main().catch(() => {
  console.error('Could not start the eligibility API.');
  process.exitCode = 1;
});
