import { readDependency } from './http-client';

export function createRulesClient(baseUrl: string) {
  return (benefitCode: string) => readDependency(
    new URL('/rules/' + encodeURIComponent(benefitCode), baseUrl),
    value => {
      const rule = value as { enabled?: unknown };
      if (typeof rule.enabled !== 'boolean') throw new Error('Invalid rules response');
      return rule.enabled;
    },
  );
}
