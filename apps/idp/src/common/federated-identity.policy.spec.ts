import {
  canApplyVerifiedEmail,
  normalizeFederatedEmail,
  splitFederatedEmail,
} from './federated-identity.policy';

describe('federated identity policy', () => {
  it('normalizes provider emails and only exposes a canonical email when verified', () => {
    expect(
      splitFederatedEmail({
        email: 'Ada@Example.com',
        emailVerified: true,
      }),
    ).toEqual({
      normalizedEmail: 'ada@example.com',
      verifiedEmail: 'ada@example.com',
    });

    expect(
      splitFederatedEmail({
        email: 'Ada@Example.com',
        emailVerified: false,
      }),
    ).toEqual({
      normalizedEmail: 'ada@example.com',
      verifiedEmail: undefined,
    });
  });

  it('only allows a verified provider email to overwrite an empty or matching account email', () => {
    expect(
      canApplyVerifiedEmail({
        userId: 'user-1',
        currentUserEmail: undefined,
        verifiedEmail: 'ada@example.com',
      }),
    ).toBe(true);

    expect(
      canApplyVerifiedEmail({
        userId: 'user-1',
        currentUserEmail: 'ada@example.com',
        verifiedEmail: 'ada@example.com',
      }),
    ).toBe(true);

    expect(
      canApplyVerifiedEmail({
        userId: 'user-1',
        currentUserEmail: 'other@example.com',
        verifiedEmail: 'ada@example.com',
      }),
    ).toBe(false);
  });

  it('refuses to attach a verified email that already belongs to another user', () => {
    expect(
      canApplyVerifiedEmail({
        userId: 'user-1',
        currentUserEmail: undefined,
        verifiedEmail: 'ada@example.com',
        ownerUserId: 'user-2',
      }),
    ).toBe(false);
  });

  it('normalizes blank provider emails to undefined', () => {
    expect(normalizeFederatedEmail('   ')).toBeUndefined();
  });
});
