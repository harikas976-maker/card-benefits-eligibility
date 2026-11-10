export interface EligibilityRequest {
  benefitCode: string;
  customerId?: string;
}

export function isEligibilityRequest(body: unknown): body is EligibilityRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const { benefitCode, customerId } = body as Record<string, unknown>;
  return typeof benefitCode === 'string'
    && /^[A-Z][A-Z0-9_]{0,31}$/.test(benefitCode)
    && Object.keys(body).every(key => key === 'benefitCode' || key === 'customerId')
    && (!('customerId' in body) || typeof customerId === 'string');
}

export function canCheckCustomer(subject: string, customerId?: string): boolean {
  return customerId === undefined || customerId === subject;
}
