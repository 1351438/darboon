import { pickGithubVerifiedEmail } from './github-email.util';

describe('pickGithubVerifiedEmail', () => {
  it('prefers the primary verified email', () => {
    expect(
      pickGithubVerifiedEmail([
        { email: 'secondary@example.com', primary: false, verified: true },
        { email: 'Primary@Example.com', primary: true, verified: true },
      ]),
    ).toBe('primary@example.com');
  });

  it('falls back to another verified email when no primary verified email exists', () => {
    expect(
      pickGithubVerifiedEmail([
        { email: 'hidden@example.com', primary: false, verified: false },
        { email: 'usable@example.com', primary: false, verified: true },
      ]),
    ).toBe('usable@example.com');
  });

  it('returns undefined when GitHub exposes no verified email', () => {
    expect(
      pickGithubVerifiedEmail([
        { email: 'hidden@example.com', primary: true, verified: false },
      ]),
    ).toBeUndefined();
  });
});
