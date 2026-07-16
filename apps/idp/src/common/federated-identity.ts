import { EntityManager } from '@mikro-orm/core';
import { Identity, IdentityProvider, User, UserStatus } from '../entities';
import {
  canApplyVerifiedEmail,
  splitFederatedEmail,
} from './federated-identity.policy';

export interface FederatedIdentityInput {
  provider: IdentityProvider;
  providerSubject: string;
  email?: string | null;
  emailVerified: boolean;
  rawProfile?: Record<string, unknown>;
}

function sameProfile(
  left?: Record<string, unknown>,
  right?: Record<string, unknown>,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/**
 * Link a federated identity to an existing Darboon user by verified email, or
 * create a provider-backed account when no safe match exists.
 */
export async function linkOrCreateFederatedUser(
  em: EntityManager,
  input: FederatedIdentityInput,
): Promise<User> {
  const { normalizedEmail, verifiedEmail } = splitFederatedEmail(input);

  const existingIdentity = await em.findOne(Identity, {
    provider: input.provider,
    providerSubject: input.providerSubject,
  });
  if (existingIdentity) {
    const user = await em.findOne(User, { id: existingIdentity.userId });
    if (user) {
      let dirty = false;

      if (verifiedEmail) {
        const owner = await em.findOne(User, { email: verifiedEmail });
        if (
          canApplyVerifiedEmail({
            userId: user.id,
            currentUserEmail: user.email,
            verifiedEmail,
            ownerUserId: owner?.id,
          })
        ) {
          if (user.email !== verifiedEmail) {
            user.email = verifiedEmail;
            dirty = true;
          }
          if (!user.emailVerified) {
            user.emailVerified = true;
            dirty = true;
          }
        }
      }

      if (existingIdentity.email !== normalizedEmail) {
        existingIdentity.email = normalizedEmail;
        dirty = true;
      }
      if (!sameProfile(existingIdentity.rawProfile, input.rawProfile)) {
        existingIdentity.rawProfile = input.rawProfile;
        dirty = true;
      }

      if (dirty) {
        await em.flush();
      }
      return user;
    }

    em.remove(existingIdentity);
    await em.flush();
  }

  let user = verifiedEmail
    ? await em.findOne(User, { email: verifiedEmail })
    : null;

  if (!user) {
    user = em.create(User, {
      email: verifiedEmail,
      emailVerified: !!verifiedEmail,
      status: UserStatus.ACTIVE,
    } as unknown as User);
    em.persist(user);
    await em.flush();
  } else if (verifiedEmail && !user.emailVerified) {
    user.emailVerified = true;
    await em.flush();
  }

  const identity = em.create(Identity, {
    userId: user.id,
    provider: input.provider,
    providerSubject: input.providerSubject,
    email: normalizedEmail,
    rawProfile: input.rawProfile,
  } as unknown as Identity);
  em.persist(identity);
  await em.flush();

  return user;
}
