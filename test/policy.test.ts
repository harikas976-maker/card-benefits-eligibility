import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isRetryableStatus } from '../src/http-client';
import { canCheckCustomer, isEligibilityRequest } from '../src/request-policy';

test('validates benefit code format and rejects unexpected fields', () => {
  assert.equal(isEligibilityRequest({ benefitCode: 'A' }), true);
  assert.equal(isEligibilityRequest({ benefitCode: 'A'.repeat(32), customerId: 'customer-alice' }), true);
  for (const invalid of [
    null, [], {}, { benefitCode: 42 }, { benefitCode: '1LOUNGE' },
    { benefitCode: 'lounge' }, { benefitCode: 'A'.repeat(33) },
    { benefitCode: 'LOUNGE', customerId: null },
    { benefitCode: 'LOUNGE', unexpected: true },
  ]) {
    assert.equal(isEligibilityRequest(invalid), false);
  }
});

test('authorizes only the authenticated subject', () => {
  assert.equal(canCheckCustomer('customer-alice'), true);
  assert.equal(canCheckCustomer('customer-alice', 'customer-alice'), true);
  assert.equal(canCheckCustomer('customer-alice', 'customer-bob'), false);
});

test('classifies only selected transient HTTP statuses as retryable', () => {
  for (const status of [429, 502, 503, 504]) {
    assert.equal(isRetryableStatus(status), true);
  }
  for (const status of [200, 302, 400, 401, 403, 404, 422, 500, 501]) {
    assert.equal(isRetryableStatus(status), false);
  }
});
