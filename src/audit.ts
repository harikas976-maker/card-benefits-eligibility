import { mkdir, open, rename } from 'node:fs/promises';
import { join } from 'node:path';

export interface AuditEntry {
  decisionId: string;
  timestamp: string;
  subject: string;
  benefitCode: string;
  reasonCode: string;
  correlationId: string;
}

export async function createAuditStore(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return async (entry: AuditEntry) => {
    const stagingPath = join(directory, entry.decisionId + '.tmp');
    const file = await open(stagingPath, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(entry) + '\n');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(stagingPath, join(directory, entry.decisionId + '.json'));
  };
}
