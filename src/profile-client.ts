import { readDependency } from './http-client';

export function createProfileClient(baseUrl: string) {
  return (subject: string) => readDependency(
    new URL('/profiles/' + encodeURIComponent(subject), baseUrl),
    value => {
      const profile = value as { accountRef?: unknown };
      if (profile.accountRef !== null && typeof profile.accountRef !== 'string') {
        throw new Error('Invalid profile response');
      }
      return profile.accountRef;
    },
  );
}
