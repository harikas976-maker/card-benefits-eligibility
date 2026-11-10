export function mapDecision(accountRef: string | null, enabled: boolean) {
  if (!enabled) return { eligible: false, reasonCode: 'BENEFIT_UNAVAILABLE' };
  if (!accountRef) return { eligible: false, reasonCode: 'NO_ELIGIBLE_CARD' };
  return { eligible: true, reasonCode: 'ELIGIBLE' };
}
