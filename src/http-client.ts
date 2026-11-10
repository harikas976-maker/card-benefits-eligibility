import { get } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

export class DependencyError extends Error {
  constructor(readonly retryable: boolean) {
    super('Dependency unavailable');
  }
}

export function isRetryableStatus(status: number): boolean {
  return [429, 502, 503, 504].includes(status);
}

function getJson<T>(url: URL, decode: (value: unknown) => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = get(url, response => {
      const status = response.statusCode ?? 500;
      if (status !== 200) {
        response.destroy();
        reject(new DependencyError(isRetryableStatus(status)));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 4096) {
          reject(new DependencyError(false));
          response.destroy();
        } else {
          chunks.push(chunk);
        }
      });
      response.on('error', () => reject(new DependencyError(true)));
      response.on('end', () => {
        try {
          resolve(decode(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
        } catch {
          reject(new DependencyError(false));
        }
      });
    });
    const timeout = setTimeout(() => request.destroy(new DependencyError(true)), 300);
    request.on('socket', socket => {
      if (!socket.connecting) return;
      const connectTimeout = setTimeout(() => request.destroy(new DependencyError(true)), 100);
      socket.once('connect', () => clearTimeout(connectTimeout));
      request.once('close', () => clearTimeout(connectTimeout));
    });
    request.on('error', () => reject(new DependencyError(true)));
    request.on('close', () => clearTimeout(timeout));
  });
}

export async function readDependency<T>(url: URL, decode: (value: unknown) => T): Promise<T> {
  try {
    return await getJson(url, decode);
  } catch (error) {
    if (!(error instanceof DependencyError) || !error.retryable) throw error;
    await delay(25 + Math.floor(Math.random() * 26));
    return getJson(url, decode);
  }
}
