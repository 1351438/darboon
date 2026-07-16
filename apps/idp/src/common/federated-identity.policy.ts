export interface FederatedEmailInput {
  email?: string | null;
  emailVerified: boolean;
}

export function normalizeFederatedEmail(
  email?: string | null,
): string | undefined {
  const value = email?.trim().toLowerCase();
  return value || undefined;
}

export function splitFederatedEmail(input: FederatedEmailInput): {
  normalizedEmail?: string;
  verifiedEmail?: string;
} {
  const normalizedEmail = normalizeFederatedEmail(input.email);
  return {
    normalizedEmail,
    verifiedEmail: input.emailVerified ? normalizedEmail : undefined,
  };
}

export function canApplyVerifiedEmail(params: {
  userId: string;
  currentUserEmail?: string;
  verifiedEmail?: string;
  ownerUserId?: string;
}): boolean {
  return (
    !!params.verifiedEmail &&
    (!params.currentUserEmail ||
      params.currentUserEmail === params.verifiedEmail) &&
    (!params.ownerUserId || params.ownerUserId === params.userId)
  );
}
