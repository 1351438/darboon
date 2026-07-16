import { normalizeFederatedEmail } from '../common/federated-identity.policy';

export interface GithubEmailRecord {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility?: string | null;
}

export function pickGithubVerifiedEmail(
  emails: GithubEmailRecord[],
): string | undefined {
  const match =
    emails.find((email) => email.primary && email.verified) ??
    emails.find((email) => email.verified);
  return normalizeFederatedEmail(match?.email);
}
