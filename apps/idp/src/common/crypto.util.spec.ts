import {
  randomNumericCode,
  randomToken,
  safeHexEqual,
  sha256Hex,
} from './crypto.util';

describe('crypto.util', () => {
  it('produces a stable sha256 hex digest', () => {
    expect(sha256Hex('darboon')).toBe(sha256Hex('darboon'));
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
    expect(sha256Hex('a')).toHaveLength(64);
  });

  it('compares hex digests in constant time and length-safely', () => {
    const a = sha256Hex('secret');
    expect(safeHexEqual(a, a)).toBe(true);
    expect(safeHexEqual(a, sha256Hex('other'))).toBe(false);
    expect(safeHexEqual(a, 'abc')).toBe(false);
    expect(safeHexEqual('', '')).toBe(false);
  });

  it('generates url-safe high-entropy tokens', () => {
    const t = randomToken(32);
    expect(t).not.toMatch(/[^A-Za-z0-9_-]/);
    expect(randomToken()).not.toBe(randomToken());
  });

  it('generates zero-padded numeric codes of the requested length', () => {
    for (let i = 0; i < 50; i++) {
      const code = randomNumericCode(6);
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});
